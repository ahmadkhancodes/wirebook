import { createConnectLink, derivePassword } from '../../src/lib/connect';
import { createMemoryBridge, type Bridge } from '../../src/lib/bridge';
import { handleSoap, hashPassword, type BridgeDeps, type EndUser } from '../../src/lib/qbwc';
import { createObject, getObject, getRequest, listObjects, rawQbxml, updateObject, v1, type V1Auth, type V1Deps } from '../../src/lib/v1/engine';
import { apiError } from '../../src/lib/v1/errors';
import { FakeCompanyFile, QbwcSimulator } from '../../tools/simulate-qbwc/simulator';

export const BASE = 'https://wirebook.test';
export const SECRET = 'test-secret';

/** Everything runs in process: memory bridge, a fake clock, and the Web Connector simulator standing in for QuickBooks. No network. */
export function harness(opts: { waitMs?: number; onSuccess?: (u: EndUser, at: Date) => Promise<void>; onEvent?: BridgeDeps['onEvent']; admit?: BridgeDeps['admit'] } = {}) {
  const bridge: Bridge = createMemoryBridge();
  const clock = { now: new Date() };
  const sims = new Map<string, QbwcSimulator>();
  const post = (xml: string) => handleSoap(xml, { ...bridge, now: () => clock.now, ...(opts.onSuccess ? { onSuccess: opts.onSuccess } : {}), ...(opts.onEvent ? { onEvent: opts.onEvent } : {}), ...(opts.admit ? { admit: opts.admit } : {}) });

  const deps: V1Deps & { secret: string } = {
    bridge, baseUrl: BASE, secret: SECRET, now: () => clock.now, waitMs: opts.waitMs ?? 5000,
    async authenticate(req): Promise<V1Auth> {
      const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
      if (!raw) throw apiError('missing_api_key');
      if (raw === 'bad') throw apiError('invalid_api_key');
      const [, env = 'test', org = 'org_1'] = raw.split(':');
      return { orgId: org, keyId: `key_${raw}`, environment: env === 'production' ? 'production' : 'test' };
    },
    // while a request waits, the Web Connector "polls": every simulated company file runs a session
    async sleep() { for (const s of sims.values()) await s.runSession(); },
  };

  async function addUser(id: string, o: { projectId?: string; externalId?: string } = {}) {
    const username = `wb_${id}`;
    const u: EndUser = {
      id, projectId: o.projectId ?? 'org_1__test', externalId: o.externalId ?? id, qbwcUsername: username,
      qbwcPasswordHash: hashPassword(await derivePassword(SECRET, id)), ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID(),
      status: 'pending', failedAuth: { count: 0, windowStart: clock.now },
    };
    await bridge.users.create(u);
    const sim = new QbwcSimulator(post, { user: username, pass: await derivePassword(SECRET, id) }, new FakeCompanyFile());
    sims.set(id, sim);
    return { user: u, sim, qb: sim.qb };
  }

  const key = (env: 'test' | 'production' = 'test', org = 'org_1') => `Bearer sk:${env}:${org}`;

  async function call(method: string, path: string, o: { body?: unknown; raw?: string; headers?: Record<string, string>; auth?: string | null; user?: string | null } = {}) {
    const headers: Record<string, string> = { ...(o.auth === null ? {} : { authorization: o.auth ?? key() }), ...(o.user === null ? {} : { 'x-end-user-id': o.user ?? 'end_a' }), ...(o.headers ?? {}) };
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    const req = new Request(`${BASE}${path}`, { method, headers, body: o.raw ?? (o.body !== undefined ? JSON.stringify(o.body) : undefined) });
    const url = new URL(req.url);
    const seg = url.pathname.split('/').filter(Boolean); // v1 qbd <object> [id]
    const res = await v1(req, deps, async () => {
      if (url.pathname === '/v1/connect-links') return createConnectLink(deps, req);
      if (seg[1] === 'requests') return getRequest(deps, req, seg[2]!);
      if (url.pathname === '/v1/qbd/raw') return rawQbxml(deps, req);
      if (seg.length === 3) return method === 'GET' ? listObjects(deps, req, seg[2]!) : createObject(deps, req, seg[2]!);
      return method === 'GET' ? getObject(deps, req, seg[2]!, seg[3]!) : updateObject(deps, req, seg[2]!, seg[3]!);
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, json, text };
  }
  return { bridge, deps, clock, sims, addUser, call, key, post };
}

/** A fetch-compatible function that routes requests into the in-process API of a harness. For SDK tests. */
export function fetchFor(h: ReturnType<typeof harness>): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const url = new URL(req.url);
    const text = await req.text();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => { headers[k] = v; });
    const r = await h.call(req.method, url.pathname + url.search, { ...(text ? { raw: text } : {}), headers, auth: null, user: null });
    const out = new Headers(r.headers);
    return new Response(r.text, { status: r.status, headers: out });
  }) as typeof fetch;
}
