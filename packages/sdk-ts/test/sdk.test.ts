import { beforeEach, describe, expect, it } from 'vitest';
import { fetchFor, harness } from '../../../tests/helpers/harness';
import { OBJECTS } from '../../../src/lib/v1/objects';
import {
  AuthenticationError, ConflictError, InvalidRequestError, NotFoundError, RateLimitError, Wirebook, WirebookError, isQueued,
  type Customer,
} from '../src/index';

let h: ReturnType<typeof harness>;
let qb: any;
const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };
const BASE = 'https://wirebook.test';

const client = (o: Partial<ConstructorParameters<typeof Wirebook>[0]> = {}) =>
  new Wirebook({ apiKey: 'sk:test:org_1', baseUrl: BASE, fetch: fetchFor(h), sleep, ...o }).forUser('end_a');

beforeEach(async () => {
  h = harness();
  qb = (await h.addUser('end_a')).qb;
  sleeps.length = 0;
});

const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

describe('SDK surface', () => {
  it('exposes an accessor for every API object', () => {
    const wb: any = client().qbd;
    for (const key of Object.keys(OBJECTS)) {
      expect(wb[camel(key)], key).toBeDefined();
      expect(wb[camel(key)].segment).toBe(OBJECTS[key]!.name);
    }
  });

  it('creates, gets and updates a customer', async () => {
    const wb = client();
    const c = (await wb.qbd.customers.create({ name: 'Acme Builders' })) as Customer;
    expect(c.name).toBe('Acme Builders');
    expect((await wb.qbd.customers.get(c.listId!)).name).toBe('Acme Builders');
    const u = (await wb.qbd.customers.update(c.listId!, { email: 'a@b.test', revisionNumber: c.revisionNumber! })) as Customer;
    expect(u.revisionNumber).not.toBe(c.revisionNumber);
  });

  it('per-call endUser option and forUser set X-End-User-Id', async () => {
    const base = new Wirebook({ apiKey: 'sk:test:org_1', baseUrl: BASE, fetch: fetchFor(h), sleep });
    await expect(base.qbd.customers.list()).rejects.toMatchObject({ code: 'end_user_required' });
    expect((await base.qbd.customers.list({}, { endUser: 'end_a' })).data).toEqual([]);
    expect((await base.forUser('end_a').qbd.customers.list()).data).toEqual([]);
  });

  it('raw and connectLinks and requests', async () => {
    const wb = client();
    const link = await wb.connectLinks.create({ externalId: 'ext_1', companyName: 'Zed' });
    expect(link.url).toContain('/connect/');
    const r = await wb.qbd.raw('<?xml version="1.0"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><CustomerQueryRq requestID="1"><MaxReturned>1</MaxReturned></CustomerQueryRq></QBXMLMsgsRq></QBXML>');
    expect(isQueued(r)).toBe(false);
    const rid = (r as any).requestId as string;
    expect((await wb.requests.get(rid)).state).toBe('succeeded');
  });
});

describe('pagination', () => {
  it('lists across 3 pages with limit=2, and iterates all', async () => {
    const wb = client();
    for (const n of ['A', 'B', 'C', 'D', 'E']) await wb.qbd.customers.create({ name: n });
    expect(qb.customers).toHaveLength(5);
    const p1 = await wb.qbd.customers.list({ limit: 2 });
    expect(p1.data).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    const p2 = (await p1.next())!;
    const p3 = (await p2.next())!;
    expect(p2.data).toHaveLength(2);
    expect(p3.data).toHaveLength(1);
    expect(p3.hasMore).toBe(false);
    expect(await p3.next()).toBeNull();

    const names: string[] = [];
    for await (const c of wb.qbd.customers.iterate({ limit: 2 })) names.push(c.name as string);
    expect(names.sort()).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(await wb.qbd.customers.listAll({ limit: 2 })).toHaveLength(5);
  });
});

describe('idempotency and retries', () => {
  it('reuses the Idempotency-Key when the first response is lost (503), one QuickBooks record', async () => {
    const real = fetchFor(h);
    const keys: string[] = [];
    let n = 0;
    const flaky = (async (i: RequestInfo | URL, init?: RequestInit) => {
      const res = await real(i, init);
      keys.push(new Headers(init?.headers).get('idempotency-key') ?? '');
      if (n++ === 0) return new Response('upstream down', { status: 503 });
      return res;
    }) as typeof fetch;
    const wb = client({ fetch: flaky });
    const c = (await wb.qbd.customers.create({ name: 'Once Only' })) as Customer;
    expect(c.name).toBe('Once Only');
    expect(n).toBe(2);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(qb.customers).toHaveLength(1);
    expect(sleeps).toHaveLength(1);
  });

  it('honours Retry-After on 429', async () => {
    let n = 0;
    const real = fetchFor(h);
    const limited = (async (i: RequestInfo | URL, init?: RequestInit) => {
      if (n++ === 0) return new Response(JSON.stringify({ error: { code: 'rate_limited', type: 'rate_limit', message: 'slow', retryable: true } }), { status: 429, headers: { 'retry-after': '7' } });
      return real(i, init);
    }) as typeof fetch;
    const out = await client({ fetch: limited }).qbd.customers.list();
    expect(out.data).toEqual([]);
    expect(sleeps).toEqual([7000]);
  });

  it('throws RateLimitError with retryAfter once retries are exhausted', async () => {
    const always = (async () => new Response(JSON.stringify({ error: { code: 'rate_limited', type: 'rate_limit', message: 'slow', retryable: true } }), { status: 429, headers: { 'retry-after': '3' } })) as typeof fetch;
    const err = await client({ fetch: always, maxRetries: 1 }).qbd.customers.list().catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(3);
    expect(sleeps).toEqual([3000]);
  });

  it('retries network errors with backoff, then throws ConnectionError', async () => {
    let n = 0;
    const down = (async () => { n++; throw new TypeError('fetch failed'); }) as typeof fetch;
    const err = await client({ fetch: down }).qbd.customers.list().catch((e) => e);
    expect(err.name).toBe('ConnectionError');
    expect(n).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]!).toBeGreaterThan(sleeps[0]! * 0.9);
  });

  it('does not retry a 400', async () => {
    const real = fetchFor(h);
    let n = 0;
    const counting = (async (i: RequestInfo | URL, init?: RequestInit) => { n++; return real(i, init); }) as typeof fetch;
    const err = await client({ fetch: counting }).qbd.customers.create({ bogus: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidRequestError);
    expect(err.status).toBe(400);
    expect(n).toBe(1);
    expect(sleeps).toEqual([]);
  });
});

describe('typed errors', () => {
  it('401 AuthenticationError', async () => {
    const err = await client({ apiKey: 'bad' }).qbd.customers.list().catch((e) => e);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err).toBeInstanceOf(WirebookError);
    expect(err).toMatchObject({ code: 'invalid_api_key', status: 401, retryable: false });
    expect(err.guideUrl).toContain('/errors/');
  });

  it('404 NotFoundError', async () => {
    const err = await client().qbd.customers.get('80000001-999').catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.code).toBe('not_found');
    expect(err.requestId).toMatch(/^req_/);
  });

  it('409 ConflictError on a stale revisionNumber and on idempotency key reuse', async () => {
    const wb = client();
    const c = (await wb.qbd.customers.create({ name: 'Acme' })) as Customer;
    await wb.qbd.customers.update(c.listId!, { email: 'a@b.test', revisionNumber: c.revisionNumber! });
    const stale = await wb.qbd.customers.update(c.listId!, { email: 'z@b.test', revisionNumber: c.revisionNumber! }).catch((e) => e);
    expect(stale).toBeInstanceOf(ConflictError);
    expect(stale.code).toBe('revision_conflict');
    await wb.qbd.customers.create({ name: 'K1' }, { idempotencyKey: 'dup-key' });
    const dup = await wb.qbd.customers.create({ name: 'K2' }, { idempotencyKey: 'dup-key' }).catch((e) => e);
    expect(dup).toBeInstanceOf(ConflictError);
    expect(dup.code).toBe('idempotency_conflict');
  });

  it('400 InvalidRequestError carries path', async () => {
    const err = await client().qbd.customers.update('x', { email: 'a' } as any).catch((e) => e);
    expect(err).toBeInstanceOf(InvalidRequestError);
    expect(err.path).toBe('revisionNumber');
  });
});

describe('async 202 and requests.wait', () => {
  it('surfaces Queued with async: true and waits for it', async () => {
    const wb = client();
    const q = await wb.qbd.customers.create({ name: 'Slow' }, { async: true });
    expect(q).toMatchObject({ state: 'queued' });
    expect(isQueued(q)).toBe(true);
    // each poll stands in for the Web Connector: run a session between polls
    const sims = [...h.sims.values()];
    const step = async () => { for (const s of sims) await s.runSession(); };
    const wb2 = client({ sleep: async () => step() });
    const done = await wb2.requests.wait(q as any, { timeoutMs: 5000 });
    expect(done.state).toBe('succeeded');
    expect(done.data?.[0]).toMatchObject({ name: 'Slow' });
  });

  it('wait times out with wait_timeout', async () => {
    const wb = client();
    const q: any = await wb.qbd.customers.create({ name: 'Never' }, { async: true });
    const err = await wb.requests.wait(q.id, { timeoutMs: 3000, intervalMs: 1000 }).catch((e) => e);
    expect(err.code).toBe('wait_timeout');
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });
});
