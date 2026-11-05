import { beforeEach, describe, expect, it } from 'vitest';
import { generateQwc, handleSoap, hashPassword, MemoryEndUsers, MemoryQueue, MemorySessions, type BridgeDeps, type EndUser } from '../src/lib/qbwc';
import { FakeCompanyFile, QbwcSimulator } from '../tools/simulate-qbwc/simulator';

function user(id: string, name: string, pass = 'pw-' + id): EndUser {
  return { id, projectId: 'prj_1', qbwcUsername: name, qbwcPasswordHash: hashPassword(pass), ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID(), status: 'pending', failedAuth: { count: 0, windowStart: new Date() } };
}

let deps: BridgeDeps;
let users: MemoryEndUsers;
let clock: Date;
const post = (xml: string) => handleSoap(xml, deps);

beforeEach(() => {
  users = new MemoryEndUsers();
  clock = new Date('2026-11-05T10:00:00Z');
  deps = { queue: new MemoryQueue(), users, sessions: new MemorySessions(), now: () => clock };
  users.add(user('end_a', 'acme'));
  users.add(user('end_b', 'harlan'));
});
const sim = (name: string, id: string, qb = new FakeCompanyFile()) => new QbwcSimulator(post, { user: name, pass: 'pw-' + id }, qb);

describe('Web Connector bridge', () => {
  it('authenticates and exchanges a CustomerQuery end to end', async () => {
    const s = sim('acme', 'end_a');
    s.qb.seedCustomer('Acme Builders');
    const job = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const rep = await s.runSession();
    expect(rep).toMatchObject({ authResult: '', exchanges: 1, ended: 'done' });
    const done = await deps.queue.get(job.id);
    expect(done?.state).toBe('succeeded');
    expect(done?.result?.[0]).toMatchObject({ name: 'Acme Builders' });
    expect((await users.get('end_a'))?.status).toBe('connected');
  });

  it('returns NONE when there is no work and nvu for bad credentials', async () => {
    expect((await sim('acme', 'end_a').runSession()).authResult).toBe('NONE');
    const bad = new QbwcSimulator(post, { user: 'acme', pass: 'wrong' });
    expect((await bad.runSession()).ended).toBe('badauth');
    expect((await new QbwcSimulator(post, { user: 'nobody', pass: 'x' }).runSession()).ended).toBe('badauth');
  });

  it('reports percent below 100 while jobs remain and runs a file serially', async () => {
    const s = sim('acme', 'end_a');
    s.qb.seedCustomer('Acme Builders');
    const j1 = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const j2 = await deps.queue.enqueue({ endUserId: 'end_a', op: 'invoice.add', body: { customerRef: { fullName: 'Acme Builders' }, refNumber: 'INV-1', lines: [{ itemRef: { fullName: 'Labour' }, quantity: 2, rate: 10 }] } });
    const rep = await s.runSession();
    expect(rep.exchanges).toBe(2);
    expect((await deps.queue.get(j1.id))?.completedAt!.getTime()).toBeLessThanOrEqual((await deps.queue.get(j2.id))?.sentAt!.getTime() ?? Infinity);
    expect((await deps.queue.get(j2.id))?.state).toBe('succeeded');
    expect(s.qb.invoices).toHaveLength(1);
  });

  it('never hands out a second job while one is in flight', async () => {
    await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const first = await deps.queue.claim('end_a', clock);
    expect(first).not.toBeNull();
    expect(await deps.queue.claim('end_a', clock)).toBeNull();
    // a different file is not blocked
    await deps.queue.enqueue({ endUserId: 'end_b', op: 'customer.query', body: {} });
    expect(await deps.queue.claim('end_b', clock)).not.toBeNull();
  });

  it('claims atomically under concurrency: each job is sent once', async () => {
    for (let i = 0; i < 20; i++) await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const got = await Promise.all(Array.from({ length: 10 }, () => deps.queue.claim('end_a', clock)));
    expect(got.filter(Boolean)).toHaveLength(1);
  });

  it('maps QuickBooks 3140 to a failed request with a guide link', async () => {
    const s = sim('acme', 'end_a');
    const j = await deps.queue.enqueue({ endUserId: 'end_a', op: 'invoice.add', body: { customerRef: { fullName: 'Ghost' }, lines: [{ itemRef: { fullName: 'X' } }] } });
    await s.runSession();
    const done = await deps.queue.get(j.id);
    expect(done).toMatchObject({ state: 'failed', qbStatusCode: 3140 });
    expect(done?.error).toMatchObject({ code: 'invalid_reference', guideUrl: '/errors/3140', retryable: false });
  });

  it('fails an invalid request without blocking the file', async () => {
    const s = sim('acme', 'end_a');
    s.qb.seedCustomer('Acme Builders');
    const bad = await deps.queue.enqueue({ endUserId: 'end_a', op: 'invoice.add', body: { customerRef: { fullName: 'Acme Builders' }, nonsense: 1 } });
    const good = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    await s.runSession();
    expect((await deps.queue.get(bad.id))?.error?.code).toBe('invalid_request');
    expect((await deps.queue.get(good.id))?.state).toBe('succeeded');
  });

  it('ends the session on an unknown ticket instead of faulting', async () => {
    const s = sim('acme', 'end_a');
    const r = await s.sendWithTicket('no-such-ticket');
    expect(r.status).toBe(200);
    expect(r.result).toBe('');
    expect(r.raw).not.toContain('Fault');
  });

  it('records connectionError as broken, fails the job, and recovers on the next good poll', async () => {
    const s = sim('acme', 'end_a');
    const j = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const a = await post(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><authenticate xmlns="http://developer.intuit.com/"><strUserName>acme</strUserName><strPassword>pw-end_a</strPassword></authenticate></soap:Body></soap:Envelope>`);
    const ticket = /<string>([^<]+)<\/string>/.exec(a.body)![1]!;
    await deps.queue.claim('end_a', clock);
    const r = await s.reportConnectionError(ticket);
    expect(r.result).toBe('done');
    expect((await users.get('end_a'))?.status).toBe('broken');
    expect((await deps.queue.get(j.id))?.error?.code).toBe('quickbooks_could_not_start');
    await sim('acme', 'end_a').runSession();
    expect((await users.get('end_a'))?.status).toBe('connected');
  });

  it('locks an account out after 20 failed authentications in an hour', async () => {
    const bad = new QbwcSimulator(post, { user: 'acme', pass: 'nope' });
    for (let i = 0; i < 20; i++) await bad.runSession();
    // even the right password is refused now
    expect((await sim('acme', 'end_a').runSession()).ended).toBe('badauth');
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect((await sim('acme', 'end_a').runSession()).authResult).toBe('NONE');
  });

  it('isolates two end users: each only sees its own jobs', async () => {
    const a = sim('acme', 'end_a'); a.qb.seedCustomer('Acme Builders');
    const b = sim('harlan', 'end_b'); b.qb.seedCustomer('Harlan Mechanical');
    const ja = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const jb = await deps.queue.enqueue({ endUserId: 'end_b', op: 'customer.query', body: {} });
    await b.runSession(); await a.runSession();
    expect((await deps.queue.get(ja.id))?.result?.[0]).toMatchObject({ name: 'Acme Builders' });
    expect((await deps.queue.get(jb.id))?.result?.[0]).toMatchObject({ name: 'Harlan Mechanical' });
  });

  it('turns a job whose QuickBooks never answered into outcome_unknown (reconciler)', async () => {
    const qb = new FakeCompanyFile(); qb.hangNext = true;
    const s = sim('acme', 'end_a', qb);
    const j = await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    await s.runSession();
    expect((await deps.queue.get(j.id))?.state).toBe('sent');
    clock = new Date(clock.getTime() + 6 * 60_000);
    const changed = await deps.queue.expireSent(5 * 60_000, clock);
    expect(changed.map((c) => c.state)).toEqual(['outcome_unknown']);
  });

  it('long polls: waits for a job that arrives while the session is open', async () => {
    let slept = 0;
    deps.holdMs = 5_000;
    deps.sleep = async (ms) => { slept += ms; clock = new Date(clock.getTime() + ms); if (slept === 500) await deps.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} }); };
    const a = await post(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><authenticate xmlns="http://developer.intuit.com/"><strUserName>acme</strUserName><strPassword>pw-end_a</strPassword></authenticate></soap:Body></soap:Envelope>`);
    const ticket = /<string>([^<]+)<\/string>/.exec(a.body)![1]!;
    const r = await post(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><sendRequestXML xmlns="http://developer.intuit.com/"><ticket>${ticket}</ticket><qbXMLMajorVers>16</qbXMLMajorVers><qbXMLMinorVers>0</qbXMLMinorVers></sendRequestXML></soap:Body></soap:Envelope>`);
    expect(r.body).toContain('CustomerQueryRq');
    expect(slept).toBe(500);
  });

  it('serves clientVersion and serverVersion, and faults only on a malformed envelope', async () => {
    const call = (op: string) => post(`<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="http://developer.intuit.com/"/></soap:Body></soap:Envelope>`);
    expect((await call('serverVersion')).body).toContain('wirebook-qbwc/');
    expect((await call('clientVersion')).body).toContain('<clientVersionResult></clientVersionResult>');
    expect((await post('garbage')).status).toBe(400);
  });
});

describe('.qwc generator', () => {
  const base = { appName: 'Wirebook', appUrl: 'https://wirebook.buffersoltech.com/qbwc', appDescription: 'Wirebook by BufferSol', appSupport: 'https://wirebook.buffersoltech.com/support', username: 'acme' };
  it('emits unique OwnerID and FileID and refuses http', () => {
    const a = generateQwc({ ...base, ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID() });
    const b = generateQwc({ ...base, ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID() });
    const ids = (x: string) => [/<OwnerID>([^<]+)</.exec(x)![1], /<FileID>([^<]+)</.exec(x)![1]];
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(4);
    expect(a).toContain('<RunEveryNSeconds>60</RunEveryNSeconds>');
    expect(() => generateQwc({ ...base, appUrl: 'http://example.com/qbwc', ownerGuid: crypto.randomUUID(), fileGuid: crypto.randomUUID() })).toThrow(/https/);
    expect(() => generateQwc({ ...base, ownerGuid: 'nope', fileGuid: crypto.randomUUID() })).toThrow(/GUID/);
  });
});
