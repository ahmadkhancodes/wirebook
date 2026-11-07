import { randomUUID } from 'node:crypto';
import { XMLValidator, XMLParser } from 'fast-xml-parser';
import type { Bridge } from '@/lib/bridge';
import { IDEMPOTENCY_TTL_MS, newRequestId } from '@/lib/bridge';
import { errorFor } from '@/lib/errors/catalogue';
import { b64url, fromB64url, sha256 } from '@/lib/ids';
import { buildRequest, parseResponse, QbxmlValidationError } from '@/lib/qbxml';
import type { EndUser, Job, JobIterator, JobOp } from '@/lib/qbwc';
import { ApiError, apiError, errorBody, errorResponse } from './errors';
import { OBJECTS, type ObjectDef } from './objects';

export type Environment = 'test' | 'production';
export interface V1Auth { orgId: string; keyId: string; environment: Environment }

export interface V1Deps {
  bridge: Bridge;
  /** Verifies the API key. Throws ApiError (missing_api_key, invalid_api_key, rate_limited). */
  authenticate(req: Request): Promise<V1Auth>;
  /** Plan gate: may this billable file be used this month? Throws ApiError file_limit_reached. `endUser` is null for a file that does not exist yet. The bridge's admit hook enforces it again when the Web Connector asks for work. */
  checkFile?(auth: V1Auth, endUser: EndUser | null): Promise<void>;
  /** public origin, no trailing slash; used for guide links, Location and connect URLs */
  baseUrl: string;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** how long a request waits for QuickBooks before answering 202 (55 s fits Vercel Hobby; 90 s on Pro) */
  waitMs?: number;
  pollMs?: number;
}

export const MAX_BODY_BYTES = 1_000_000;
export const CURSOR_TTL_MS = 10 * 60 * 1000;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;

/** Tenancy: one project per org and environment. Every request, end user and key lookup is scoped by it. */
export const projectIdOf = (a: V1Auth) => `${a.orgId}__${a.environment}`;
const nowOf = (d: V1Deps) => (d.now ?? (() => new Date()))();
const isTerminal = (j: Job) => j.state === 'succeeded' || j.state === 'failed' || j.state === 'outcome_unknown';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Wraps a handler: ApiError and unexpected failures become the unified error object. */
export async function v1(req: Request, deps: V1Deps, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return errorResponse(e.err, deps.baseUrl, e.extra);
    console.error(JSON.stringify({ level: 'error', msg: 'v1_server_error', path: new URL(req.url).pathname, message: (e as Error)?.message }));
    return errorResponse(errorFor('server_error'), deps.baseUrl);
  }
}

async function readText(req: Request): Promise<string> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY_BYTES) throw apiError('payload_too_large');
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw apiError('payload_too_large');
  return text;
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await readText(req);
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw apiError('invalid_json'); }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) throw apiError('invalid_request', { path: '$' }, { message: '$: must be an object' });
  return data as Record<string, unknown>;
}

/** Dry run of the qbXML builder so a bad field is a 400 with its JSON path, before anything is queued. */
function validate(op: Exclude<JobOp, 'raw'>, body: unknown, iterator?: JobIterator) {
  try {
    buildRequest(op, body, { requestId: 'validate', ...(iterator ? { iterator: iterator.mode === 'Continue' ? { mode: 'Continue', id: iterator.id } : iterator } : {}) });
  } catch (e) {
    if (e instanceof QbxmlValidationError) throw apiError('invalid_request', { path: e.path }, { message: e.message });
    throw e;
  }
}

/** X-End-User-Id is the end user's id (end_...) or the external id you gave when creating the connect link. */
export async function resolveEndUser(deps: V1Deps, auth: V1Auth, req: Request): Promise<EndUser> {
  const ref = req.headers.get('x-end-user-id')?.trim();
  if (!ref) throw apiError('end_user_required');
  const byId = ref.startsWith('end_') ? await deps.bridge.users.get(ref) : null;
  const user = byId ?? (await deps.bridge.users.getByExternalId(projectIdOf(auth), ref));
  if (!user || user.projectId !== projectIdOf(auth)) throw apiError('end_user_not_found');
  return user;
}

function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

async function awaitJob(deps: V1Deps, id: string, waitMs: number): Promise<Job> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = nowOf(deps).getTime() + waitMs;
  for (;;) {
    const j = await deps.bridge.queue.get(id);
    if (!j) throw apiError('server_error');
    if (isTerminal(j) || nowOf(deps).getTime() >= deadline) return j;
    await sleep(deps.pollMs ?? 250);
  }
}

interface Submit {
  auth: V1Auth;
  endUser: EndUser;
  op: JobOp;
  body: unknown;
  iterator?: JobIterator;
  objectType: string;
  method: string;
  path: string;
  /** writes only */
  idempotencyKey?: string | null;
  hashSource: string;
  render(job: Job): Response | Promise<Response>;
}

const failure = (deps: V1Deps, job: Job): Response =>
  errorResponse(job.state === 'outcome_unknown' ? errorFor('outcome_unknown') : job.error ?? errorFor('quickbooks_error'), deps.baseUrl, { requestId: job.id });

/** Queue one request on the file's serial queue, then wait for it: terminal -> render, otherwise 202 with the request id. */
async function submit(deps: V1Deps, req: Request, s: Submit): Promise<Response> {
  const projectId = projectIdOf(s.auth);
  const now = nowOf(deps);
  await deps.checkFile?.(s.auth, s.endUser);
  const key = s.idempotencyKey ?? undefined;
  if (key !== undefined && (key.length < 1 || key.length > 255 || !/^[\x20-\x7e]+$/.test(key))) throw apiError('invalid_request', { path: 'Idempotency-Key' }, { message: 'Idempotency-Key: must be 1 to 255 printable characters' });
  const bodyHash = await sha256(s.hashSource);
  let job: Job;
  let replay = false;

  const spec = { endUserId: s.endUser.id, op: s.op, body: s.body, ...(s.iterator ? { iterator: s.iterator } : {}), meta: { projectId, method: s.method, path: s.path, objectType: s.objectType, ...(key ? { idempotencyKey: key } : {}) } };
  /** Enqueue under a reserved id; if another request with the same key got there first, use its job (same key, same body). */
  const enqueueAs = async (id: string): Promise<Job> => {
    try {
      return await deps.bridge.queue.enqueue({ id, ...spec });
    } catch (e) {
      const won = await deps.bridge.queue.get(id);
      if (won) return won;
      throw e;
    }
  };

  if (key) {
    // Reserve the key BEFORE anything is queued: a concurrent retry can then never queue a second write.
    const id = newRequestId();
    const prior = (await deps.bridge.idempotency.get(projectId, key, now))
      ?? (await deps.bridge.idempotency.put({ projectId, key, bodyHash, requestId: id, createdAt: now, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) }));
    if (prior) {
      if (prior.bodyHash !== bodyHash) throw apiError('idempotency_conflict');
      // the first request may still be between reserving and queueing: queueing under its id is safe either way
      job = (await deps.bridge.queue.get(prior.requestId)) ?? (await enqueueAs(prior.requestId));
      replay = true;
    } else {
      job = await enqueueAs(id);
    }
  } else {
    job = await deps.bridge.queue.enqueue(spec);
  }

  const async = /respond-async/i.test(req.headers.get('prefer') ?? '');
  if (!isTerminal(job) && !async) job = await awaitJob(deps, job.id, deps.waitMs ?? 55_000);
  const headers: Record<string, string> = { 'x-request-id': job.id, ...(replay ? { 'idempotent-replayed': 'true' } : {}) };
  if (!isTerminal(job)) {
    return json({ id: job.id, object: 'request', state: job.state, links: { self: `${deps.baseUrl}/v1/requests/${job.id}` } }, 202, { ...headers, location: `/v1/requests/${job.id}` });
  }
  const res = job.state === 'succeeded' || (s.op === 'raw' && job.rawResponse) ? await s.render(job) : failure(deps, job);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

const def = (name: string): ObjectDef => {
  const d = OBJECTS[name];
  if (!d) throw apiError('not_found');
  return d;
};
const first = (job: Job) => job.result?.[0] ?? {};

/** POST /v1/qbd/{object} */
export async function createObject(deps: V1Deps, req: Request, objectName: string): Promise<Response> {
  const auth = await deps.authenticate(req);
  const d = def(objectName);
  const body = await readBody(req);
  validate(d.add as Exclude<JobOp, 'raw'>, body);
  const endUser = await resolveEndUser(deps, auth, req);
  return submit(deps, req, {
    auth, endUser, op: d.add, body, objectType: d.name, method: 'POST', path: `/v1/qbd/${d.name}`,
    idempotencyKey: req.headers.get('idempotency-key'), hashSource: `POST /v1/qbd/${d.name}\n${canonical(body)}`,
    render: (job) => json(first(job), 201),
  });
}

/** POST /v1/qbd/{object}/{id}: update; the body carries the revisionNumber you read. */
export async function updateObject(deps: V1Deps, req: Request, objectName: string, id: string): Promise<Response> {
  const auth = await deps.authenticate(req);
  const d = def(objectName);
  if (!d.mod) throw apiError('not_supported');
  const input = await readBody(req);
  const body = { ...input, [d.idList === 'txnIds' ? 'txnId' : 'listId']: id };
  validate(d.mod as Exclude<JobOp, 'raw'>, body);
  const endUser = await resolveEndUser(deps, auth, req);
  return submit(deps, req, {
    auth, endUser, op: d.mod, body, objectType: d.name, method: 'POST', path: `/v1/qbd/${d.name}/${id}`,
    idempotencyKey: req.headers.get('idempotency-key'), hashSource: `POST /v1/qbd/${d.name}/${id}\n${canonical(input)}`,
    render: (job) => json(first(job), 200),
  });
}

/** GET /v1/qbd/{object}/{id} */
export async function getObject(deps: V1Deps, req: Request, objectName: string, id: string): Promise<Response> {
  const auth = await deps.authenticate(req);
  const d = def(objectName);
  const body = { [d.idList]: [id], ...(d.idList === 'txnIds' ? { includeLineItems: true } : {}) };
  const endUser = await resolveEndUser(deps, auth, req);
  return submit(deps, req, {
    auth, endUser, op: d.query, body, objectType: d.name, method: 'GET', path: `/v1/qbd/${d.name}/${id}`, hashSource: '',
    render: (job) => (job.result?.[0] ? json(job.result[0]) : errorResponse(errorFor('not_found'), deps.baseUrl, { requestId: job.id })),
  });
}

interface CursorPayload { o: string; u: string; i: string; x: number }
const encodeCursor = (c: CursorPayload) => b64url(new TextEncoder().encode(JSON.stringify(c)));
function decodeCursor(raw: string): CursorPayload {
  try {
    const c = JSON.parse(new TextDecoder().decode(fromB64url(raw))) as CursorPayload;
    if (typeof c.o === 'string' && typeof c.u === 'string' && typeof c.i === 'string' && typeof c.x === 'number') return c;
  } catch { /* fall through */ }
  throw apiError('invalid_cursor', { path: 'cursor' });
}

/** GET /v1/qbd/{object}: cursor pagination over the qbXML iterator. */
export async function listObjects(deps: V1Deps, req: Request, objectName: string): Promise<Response> {
  const auth = await deps.authenticate(req);
  const d = def(objectName);
  const q = new URL(req.url).searchParams;
  const body: Record<string, unknown> = {};
  let limit = DEFAULT_LIMIT;
  let cursor: CursorPayload | null = null;
  for (const [k, v] of q) {
    if (k === 'limit') {
      limit = Number(v);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw apiError('invalid_request', { path: 'limit' }, { message: `limit: must be an integer from 1 to ${MAX_LIMIT}` });
    } else if (k === 'cursor') cursor = decodeCursor(v);
    else if (d.filters[k]) Object.assign(body, d.filters[k]!(v));
    else throw apiError('invalid_request', { path: k }, { message: `${k}: unknown query parameter` });
  }
  body.maxReturned = limit;
  const endUser = await resolveEndUser(deps, auth, req);
  if (cursor) {
    if (cursor.o !== d.name || cursor.u !== endUser.id) throw apiError('invalid_cursor', { path: 'cursor' });
    if (cursor.x <= nowOf(deps).getTime()) throw apiError('cursor_expired', { path: 'cursor', cursorExpiresAt: new Date(cursor.x).toISOString() });
  }
  const iterator: JobIterator = cursor ? { mode: 'Continue', id: cursor.i } : { mode: 'Start' };
  validate(d.query as Exclude<JobOp, 'raw'>, body, iterator);
  return submit(deps, req, {
    auth, endUser, op: d.query, body, iterator, objectType: d.name, method: 'GET', path: `/v1/qbd/${d.name}`, hashSource: '',
    render: (job) => {
      const more = (job.iteratorResult?.remaining ?? 0) > 0 && !!job.iteratorResult?.id;
      const exp = nowOf(deps).getTime() + CURSOR_TTL_MS;
      return json({
        data: job.result ?? [],
        hasMore: more,
        nextCursor: more ? encodeCursor({ o: d.name, u: endUser.id, i: job.iteratorResult!.id!, x: exp }) : null,
        cursorExpiresAt: more ? new Date(exp).toISOString() : null,
      });
    },
  });
}

/** Well formedness and shape check for the raw passthrough. Exactly one request message is allowed. */
export function checkQbxml(xml: string): void {
  const v = XMLValidator.validate(xml);
  if (v !== true) throw apiError('invalid_qbxml', { path: `line ${v.err.line}, column ${v.err.col}` }, { message: `The qbXML is not well formed (line ${v.err.line}, column ${v.err.col}): ${v.err.msg}` });
  const doc = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml) as { QBXML?: { QBXMLMsgsRq?: Record<string, unknown> } };
  const msgs = doc?.QBXML?.QBXMLMsgsRq;
  const reqs = msgs && typeof msgs === 'object' ? Object.keys(msgs).filter((k) => k.endsWith('Rq')) : [];
  if (!msgs || reqs.length !== 1 || Array.isArray(msgs[reqs[0]!])) throw apiError('invalid_qbxml', {}, { message: 'The qbXML must contain QBXML/QBXMLMsgsRq with exactly one request message.' });
}

/** POST /v1/qbd/raw: JSON {qbxml} or an XML body. Returns the raw QuickBooks response plus parsed JSON. */
export async function rawQbxml(deps: V1Deps, req: Request): Promise<Response> {
  const auth = await deps.authenticate(req);
  const text = await readText(req);
  let qbxml = text;
  if ((req.headers.get('content-type') ?? '').includes('json')) {
    let data: { qbxml?: unknown };
    try { data = JSON.parse(text); } catch { throw apiError('invalid_json'); }
    if (typeof data?.qbxml !== 'string') throw apiError('invalid_request', { path: 'qbxml' }, { message: 'qbxml: is required and must be a string' });
    qbxml = data.qbxml;
  }
  checkQbxml(qbxml);
  const endUser = await resolveEndUser(deps, auth, req);
  return submit(deps, req, {
    auth, endUser, op: 'raw', body: { qbxml }, objectType: 'raw', method: 'POST', path: '/v1/qbd/raw',
    idempotencyKey: req.headers.get('idempotency-key'), hashSource: `POST /v1/qbd/raw\n${qbxml}`,
    render: (job) => {
      let parsed: unknown = null;
      try { parsed = job.rawResponse ? parseResponse(job.rawResponse) : null; } catch { /* best effort */ }
      return json({ requestId: job.id, state: job.state, raw: job.rawResponse ?? '', parsed });
    },
  });
}

/** GET /v1/requests/{id}: poll a 202. */
export async function getRequest(deps: V1Deps, req: Request, id: string): Promise<Response> {
  const auth = await deps.authenticate(req);
  const job = await deps.bridge.queue.get(id);
  if (!job || job.meta?.projectId !== projectIdOf(auth)) throw apiError('not_found');
  return json({
    id: job.id, object: 'request', state: job.state, objectType: job.meta?.objectType, method: job.meta?.method, path: job.meta?.path,
    createdAt: job.createdAt, completedAt: job.completedAt ?? null, durationMs: job.durationMs ?? null,
    ...(job.state === 'succeeded' ? { data: job.result ?? [] } : {}),
    ...(job.state === 'failed' || job.state === 'outcome_unknown'
      ? errorBody(job.state === 'outcome_unknown' ? errorFor('outcome_unknown') : job.error ?? errorFor('quickbooks_error'), deps.baseUrl, { requestId: job.id })
      : {}),
  });
}

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '')}`;
