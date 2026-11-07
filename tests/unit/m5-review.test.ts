import { describe, expect, it } from 'vitest';
import { canActivateFile, isBillableFile, onFileSynced, recordActiveFile } from '../../src/lib/billing/metering';
import { createMemoryDb } from '../../src/lib/db/memory';
import { errorFor } from '../../src/lib/errors/catalogue';
import { handleSoap, isSampleCompanyFile, type BridgeDeps } from '../../src/lib/qbwc';
import { harness } from '../helpers/harness';

/** Pre-launch review (M5) regressions: each test failed before its fix. */

const env = (op: string, args: Record<string, string>) => {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="http://developer.intuit.com/">${Object.entries(args).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('')}</${op}></soap:Body></soap:Envelope>`;
};
const result = (body: string, op: string) => {
  const m = body.match(new RegExp(`<${op}Result>([\\s\\S]*?)</${op}Result>`));
  return (m?.[1] ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
};
const period = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
const invoice = { customerRef: { fullName: 'Acme' }, refNumber: 'INV-1', lines: [{ itemRef: { fullName: 'Labour' }, quantity: 1, rate: 10 }] };

describe('QBWC state machine under failure', () => {
  it('a request whose session died after the send no longer blocks the file forever', async () => {
    const h = harness();
    const { qb, sim } = await h.addUser('end_a');
    qb.seedCustomer('Acme');
    const stuck = await h.bridge.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    await h.bridge.queue.claim('end_a', h.clock.now); // the Web Connector took it, then the PC slept
    const next = await h.bridge.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    h.clock.now = new Date(h.clock.now.getTime() + 16 * 60_000);
    await sim.runSession();
    expect((await h.bridge.queue.get(stuck.id))?.state).toBe('outcome_unknown');
    expect((await h.bridge.queue.get(next.id))?.state).toBe('succeeded');
  });

  it('a reply carrying another request id never completes the request in flight', async () => {
    const h = harness();
    const { qb } = await h.addUser('end_a');
    qb.seedCustomer('Acme');
    const job = await h.bridge.queue.enqueue({ endUserId: 'end_a', op: 'customer.query', body: {} });
    const deps: BridgeDeps = { ...h.bridge, now: () => h.clock.now };
    const { derivePassword } = await import('../../src/lib/connect');
    const auth = await handleSoap(env('authenticate', { strUserName: 'wb_end_a', strPassword: await derivePassword('test-secret', 'end_a') }), deps);
    const ticket = auth.body.match(/<string>([^<]*)<\/string>/)![1]!;
    const sent = result((await handleSoap(env('sendRequestXML', { ticket, strHCPResponse: '', strCompanyFileName: 'C:\\x\\sample_a.qbw', qbXMLCountry: 'US', qbXMLMajorVers: '16', qbXMLMinorVers: '0' }), deps)).body, 'sendRequestXML');
    const stale = qb.respond(sent).replace(`requestID="${job.id}"`, 'requestID="req_from_a_dead_session"');
    await handleSoap(env('receiveResponseXML', { ticket, response: stale, hresult: '', message: '' }), deps);
    expect((await h.bridge.queue.get(job.id))?.state).toBe('sent');
    await handleSoap(env('receiveResponseXML', { ticket, response: qb.respond(sent), hresult: '', message: '' }), deps);
    expect((await h.bridge.queue.get(job.id))?.state).toBe('succeeded');
  });

  it('a connection error never reports a write from an earlier session as failed', async () => {
    const h = harness();
    const { sim } = await h.addUser('end_a');
    const job = await h.bridge.queue.enqueue({ endUserId: 'end_a', op: 'invoice.add', body: invoice });
    await h.bridge.queue.claim('end_a', h.clock.now);
    const deps: BridgeDeps = { ...h.bridge, now: () => h.clock.now };
    const { derivePassword } = await import('../../src/lib/connect');
    const auth = await handleSoap(env('authenticate', { strUserName: 'wb_end_a', strPassword: await derivePassword('test-secret', 'end_a') }), deps);
    const ticket = auth.body.match(/<string>([^<]*)<\/string>/)![1]!;
    void sim;
    await handleSoap(env('connectionError', { ticket, hresult: '0x80040408', message: 'Could not start QuickBooks.' }), deps);
    const done = await h.bridge.queue.get(job.id);
    expect(done?.state).toBe('outcome_unknown');
    expect(done?.error?.code).toBe('outcome_unknown');
  });
});

describe('Idempotency under concurrency', () => {
  it('two concurrent requests with the same key queue exactly one write', async () => {
    const h = harness();
    await h.addUser('end_a');
    // force the race: both requests look the key up before either has stored it
    const get = h.bridge.idempotency.get.bind(h.bridge.idempotency);
    let arrived = 0;
    let release!: () => void;
    const both = new Promise<void>((r) => { release = r; });
    h.bridge.idempotency.get = async (...a) => { const r = await get(...a); if (++arrived === 2) release(); await both; return r; };
    const headers = { 'idempotency-key': 'inv-1', prefer: 'respond-async' };
    const [a, b] = await Promise.all([
      h.call('POST', '/v1/qbd/invoices', { body: invoice, headers }),
      h.call('POST', '/v1/qbd/invoices', { body: invoice, headers }),
    ]);
    expect(a.status).toBe(202);
    expect(b.status).toBe(202);
    expect(a.json.id).toBe(b.json.id);
    const jobs = await h.bridge.queue.listForUser('end_a', 10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.state).toBe('queued');
  });
});

describe('Billing: only sample company files are free, and the Developer cap holds', () => {
  it('detects QuickBooks sample company files by file name', () => {
    expect(isSampleCompanyFile('C:\\Users\\Public\\Documents\\Intuit\\QuickBooks\\Sample Company Files\\QuickBooks 2024\\sample_product-based business.qbw')).toBe(true);
    expect(isSampleCompanyFile('C:\\Books\\Harlan Plumbing.qbw')).toBe(false);
    expect(isSampleCompanyFile('C:\\Books\\sample.qbw')).toBe(false);
    expect(isBillableFile({ projectId: 'o__test', sampleFile: false })).toBe(true);
    expect(isBillableFile({ projectId: 'o__production', sampleFile: true })).toBe(false);
    expect(isBillableFile({ projectId: 'o__test' })).toBe(false);
  });

  it('a test key on a real company file is metered and capped; sample files stay free', async () => {
    const db = createMemoryDb('wirebook');
    const h = harness({
      admit: async (u) => ((await canActivateFile(db, u.projectId, u.id, h.clock.now, isBillableFile(u))) ? null : errorFor('file_limit_reached')),
      onSuccess: async (u, at) => { await onFileSynced(db, null, u.projectId, u.id, at, isBillableFile(u)); },
    });
    for (const id of ['end_a', 'end_b', 'end_c', 'end_d']) (await h.addUser(id)).sim.companyFile = `C:\\Books\\${id}.qbw`;
    await h.addUser('end_s'); // the simulator's default: a sample company file
    for (const id of ['end_s', 'end_a', 'end_b', 'end_c']) expect((await h.call('GET', '/v1/qbd/customers', { user: id })).status).toBe(200);
    const blocked = await h.call('GET', '/v1/qbd/customers', { user: 'end_d' });
    expect(blocked.status).toBe(402);
    expect(blocked.json.error.code).toBe('file_limit_reached');
    expect(await db.listActiveFiles('org_1', period(h.clock.now))).toEqual(['end_a', 'end_b', 'end_c']);
  });

  it('connect links queued before the cap was reached cannot activate a 4th file on Developer', async () => {
    const db = createMemoryDb('wirebook');
    const h = harness({
      admit: async (u) => ((await canActivateFile(db, u.projectId, u.id, h.clock.now, isBillableFile(u))) ? null : errorFor('file_limit_reached')),
      onSuccess: async (u, at) => { await onFileSynced(db, null, u.projectId, u.id, at, isBillableFile(u)); },
    });
    h.deps.checkFile = async (auth, u) => {
      if (!(await canActivateFile(db, `${auth.orgId}__${auth.environment}`, u?.id ?? null, h.clock.now, u ? isBillableFile(u) : auth.environment === 'production'))) throw (await import('../../src/lib/v1/errors')).apiError('file_limit_reached');
    };
    const ids = ['end_a', 'end_b', 'end_c', 'end_d', 'end_e'];
    // every probe is queued while no file is active yet, so the request-time check lets all five through
    for (const id of ids) {
      const { sim } = await h.addUser(id, { projectId: 'org_1__production' });
      sim.companyFile = `C:\\Books\\${id}.qbw`;
      await h.bridge.queue.enqueue({ endUserId: id, op: 'customer.query', body: { maxReturned: 1 }, meta: { projectId: 'org_1__production', method: 'POST', path: '/v1/connect-links', objectType: 'connection' } });
    }
    for (const id of ids) await h.sims.get(id)!.runSession();
    expect(await db.listActiveFiles('org_1', period(h.clock.now))).toHaveLength(3);
    const refused = await h.bridge.queue.listForUser('end_e', 5);
    expect(refused[0]?.error?.code).toBe('file_limit_reached');
  });

  it('recordActiveFile never counts a 4th file on a capped plan', async () => {
    const db = createMemoryDb('wirebook');
    const now = new Date('2026-11-10T00:00:00Z');
    for (const id of ['a', 'b', 'c']) expect(await recordActiveFile(db, 'org_1__production', id, now)).toBe(true);
    expect(await recordActiveFile(db, 'org_1__production', 'd', now)).toBe(false);
    expect(await db.listActiveFiles('org_1', '2026-11')).toHaveLength(3);
  });
});

describe('Secrets', () => {
  it('never falls back to the public development secret in production', async () => {
    const { secretOr } = await import('../../src/lib/env');
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      expect(() => secretOr(undefined, 'wirebook-dev-secret', 'BETTER_AUTH_SECRET')).toThrow('BETTER_AUTH_SECRET is not set');
      expect(secretOr('real', 'x', 'BETTER_AUTH_SECRET')).toBe('real');
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? 'test';
    }
  });
});

describe('Webhook SSRF and API key roles', () => {
  it('refuses webhook hosts that resolve to private addresses', async () => {
    const { isPrivateAddress, resolvesPublic } = await import('../../src/lib/webhooks/outbound');
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ['8.8.8.8', '2606:4700::1111']) expect(isPrivateAddress(ip)).toBe(false);
    expect(await resolvesPublic('https://hooks.example.com/x', async () => [{ address: '127.0.0.1' }])).toBe(false);
    expect(await resolvesPublic('https://hooks.example.com/x', async () => [{ address: '93.184.216.34' }])).toBe(true);
  });

  it('owners and admins can create and revoke API keys through Better Auth; members and viewers cannot', async () => {
    const { roles } = await import('../../src/lib/auth/roles');
    for (const action of ['create', 'delete', 'update', 'read']) {
      expect(roles.owner.authorize({ apiKey: [action] } as never).success).toBe(true);
      expect(roles.admin.authorize({ apiKey: [action] } as never).success).toBe(true);
    }
    expect(roles.member.authorize({ apiKey: ['create'] } as never).success).toBe(false);
    expect(roles.viewer.authorize({ apiKey: ['create'] } as never).success).toBe(false);
  });
});

describe('P1 follow-ups', () => {
  it('a suspended org gets no work through the Web Connector', async () => {
    const { suspendedRefusal } = await import('../../src/lib/security/abuse');
    const db = createMemoryDb('wirebook');
    expect(await suspendedRefusal(db, 'org1__test')).toBeNull();
    await db.setOrgSettings('org1', { suspended: true });
    expect((await suspendedRefusal(db, 'org1__test'))?.code).toBe('org_suspended');
    expect(await suspendedRefusal(db, 'org2__test')).toBeNull();
  });

  it('mail in production without a provider fails loudly', async () => {
    const { transportFromEnv } = await import('../../src/lib/mail');
    const keep = { n: process.env.NODE_ENV, k: process.env.RESEND_API_KEY, p: process.env.MAIL_PROVIDER };
    delete process.env.RESEND_API_KEY; delete process.env.MAIL_PROVIDER;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try { expect(() => transportFromEnv()).toThrow(/mail provider/i); }
    finally {
      (process.env as Record<string, string>).NODE_ENV = keep.n!;
      if (keep.k) process.env.RESEND_API_KEY = keep.k;
      if (keep.p) process.env.MAIL_PROVIDER = keep.p;
    }
    expect(transportFromEnv().name).toBe('console');
  });
});
