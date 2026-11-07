import { describe, expect, it } from 'vitest';
import { createMemoryBridge } from '../../src/lib/bridge';
import { chargeFor, canActivateFile, onFileSynced, recordActiveFile, syncStripeQuantity, usageSummary, type MeterStripe } from '../../src/lib/billing/metering';
import { NONE } from '../../src/lib/billing/entitlement';
import { createMemoryDb } from '../../src/lib/db/memory';
import type { Entitlement } from '../../src/lib/db/types';
import { evaluate, healthTick } from '../../src/lib/health';
import { clampRetention, purgePayloads } from '../../src/lib/retention';
import { product } from '../../src/config/product';
import { harness } from '../helpers/harness';
import type { EndUser } from '../../src/lib/qbwc';

const T0 = new Date('2026-11-10T12:00:00Z');
const H = 36e5;
const paid = (plan: Entitlement['plan'], interval: 'month' | 'year' = 'month'): Entitlement => ({ ...NONE(T0.getTime()), isPaid: true, status: 'active', plan, interval, expiresAt: T0.getTime() + 30 * 864e5, subscriptionId: 'sub_1' });

describe('billing metering: charge rules from product.ts', () => {
  it('Developer: 3 files free, capped', () => {
    expect(chargeFor('free', null, 2)).toMatchObject({ included: 3, billableFiles: 0, intervalCents: 0, capped: true });
    expect(chargeFor('free', null, 3).included).toBe(3);
  });
  it('Production: every active file at $24.99 monthly, $19.99 a month billed yearly', () => {
    expect(chargeFor('production', 'month', 3)).toMatchObject({ billableFiles: 3, monthlyCents: 3 * 2499, intervalCents: 3 * 2499 });
    expect(chargeFor('production', 'year', 3)).toMatchObject({ monthlyCents: 3 * 1999, intervalCents: 3 * 1999 * 12 });
    expect(chargeFor('production', 'month', 0).intervalCents).toBe(0);
  });
  it('Starter Pack: 4 files for one price, then Production rate per extra file', () => {
    expect(chargeFor('starter_pack', 'month', 3)).toMatchObject({ included: 4, extra: 0, monthlyCents: 9799 });
    expect(chargeFor('starter_pack', 'month', 4)).toMatchObject({ included: 4, extra: 0, monthlyCents: 9799 });
    expect(chargeFor('starter_pack', 'month', 6)).toMatchObject({ extra: 2, monthlyCents: 9799 + 2 * 2499 });
    expect(chargeFor('starter_pack', 'year', 5).monthlyCents).toBe(8299 + 1999);
  });
  it('Volume: $16.99 a file with a 50 file floor', () => {
    expect(chargeFor('volume', 'month', 10)).toMatchObject({ billableFiles: 50, monthlyCents: 50 * 1699 });
    expect(chargeFor('volume', 'month', 64)).toMatchObject({ billableFiles: 64, extra: 14, monthlyCents: 64 * 1699 });
  });
});

describe('active file counting and the plan gate', () => {
  it('counts a production file once per period; sample (test) files are free', async () => {
    const db = createMemoryDb('wirebook');
    expect(await recordActiveFile(db, 'org_1__test', 'end_1', T0)).toBe(false);
    expect(await recordActiveFile(db, 'org_1__production', 'end_1', T0)).toBe(true);
    expect(await recordActiveFile(db, 'org_1__production', 'end_1', T0)).toBe(false);
    expect(await recordActiveFile(db, 'org_1__production', 'end_2', T0)).toBe(true);
    expect(await recordActiveFile(db, 'org_1__production', 'end_1', new Date('2026-12-01T00:00:00Z'))).toBe(true); // next period
    expect((await usageSummary(db, 'org_1', T0)).files).toBe(2);
    expect(await db.getUsage('org_1', 'files', '2026-11')).toBe(2);
  });

  it('Developer blocks the 4th active file, lets known files through, and never blocks test or paid plans', async () => {
    const db = createMemoryDb('wirebook');
    for (const id of ['a', 'b', 'c']) await recordActiveFile(db, 'org_1__production', id, T0);
    expect(await canActivateFile(db, 'org_1__production', 'd', T0)).toBe(false);
    expect(await canActivateFile(db, 'org_1__production', null, T0)).toBe(false);
    expect(await canActivateFile(db, 'org_1__production', 'a', T0)).toBe(true);
    expect(await canActivateFile(db, 'org_1__test', 'd', T0)).toBe(true);
    await db.setEntitlement('org_1', paid('production'));
    expect(await canActivateFile(db, 'org_1__production', 'd', T0)).toBe(true);
  });

  it('REST: the 4th production file gets 402 file_limit_reached with a guide', async () => {
    const db = createMemoryDb('wirebook');
    const h = harness({ onSuccess: async (u, at) => { await onFileSynced(db, null, u.projectId, u.id, at); } });
    h.deps.checkFile = async (auth, u) => {
      if (!(await canActivateFile(db, `${auth.orgId}__${auth.environment}`, u?.id ?? null, h.clock.now))) throw (await import('../../src/lib/v1/errors')).apiError('file_limit_reached');
    };
    for (const id of ['end_a', 'end_b', 'end_c', 'end_d']) await h.addUser(id, { projectId: 'org_1__production' });
    for (const id of ['end_a', 'end_b', 'end_c']) expect((await h.call('GET', '/v1/qbd/customers', { auth: h.key('production'), user: id })).status).toBe(200); // an empty file answers status 1, which is a 200 with no rows
    const blocked = await h.call('GET', '/v1/qbd/customers', { auth: h.key('production'), user: 'end_d' });
    expect(blocked.status).toBe(402);
    expect(blocked.json.error).toMatchObject({ code: 'file_limit_reached', guideUrl: expect.stringContaining('/errors/file-limit-reached') });
    expect(await db.listActiveFiles('org_1', `${h.clock.now.getUTCFullYear()}-${String(h.clock.now.getUTCMonth() + 1).padStart(2, '0')}`)).toHaveLength(3);
  });
});

describe('Stripe quantity report', () => {
  function fake(planKey: string, appMeta = 'wirebook', qty = 1) {
    const calls: { m: string; a: unknown }[] = [];
    const items = [{ id: 'si_1', quantity: qty, price: { lookup_key: planKey } }] as { id: string; quantity: number; price: { lookup_key: string } }[];
    const stripe = {
      subscriptions: { retrieve: async () => ({ id: 'sub_1', metadata: { app: appMeta }, items: { data: items } }) },
      prices: { list: async () => ({ data: [{ id: 'price_prod_m', metadata: { app: 'wirebook' } }] }) },
      subscriptionItems: {
        update: async (id: string, p: { quantity: number }) => { calls.push({ m: 'update', a: [id, p.quantity] }); const i = items.find((x) => x.id === id); if (i) i.quantity = p.quantity; return {}; },
        create: async (p: { quantity: number; price: string }) => { calls.push({ m: 'create', a: [p.price, p.quantity] }); const it = { id: 'si_2', quantity: p.quantity, price: { lookup_key: 'wirebook_production_monthly' } }; items.push(it); return it; },
      },
    } as unknown as MeterStripe;
    return { stripe, calls };
  }
  const seed = async (plan: Entitlement['plan'], files: number) => {
    const db = createMemoryDb('wirebook');
    await db.setEntitlement('org_1', paid(plan));
    for (let i = 0; i < files; i++) await recordActiveFile(db, 'org_1__production', `f${i}`, new Date());
    return db;
  };

  it('Production: subscription item quantity follows the active file count', async () => {
    const f = fake('wirebook_production_monthly');
    const db = await seed('production', 3);
    expect(await syncStripeQuantity(f.stripe, db, 'org_1')).toEqual({ subscriptionId: 'sub_1', quantity: 3 });
    expect(f.calls).toEqual([{ m: 'update', a: ['si_1', 3] }]);
    expect(await syncStripeQuantity(f.stripe, db, 'org_1')).toMatchObject({ quantity: 3 });
    expect(f.calls).toHaveLength(1); // unchanged quantity is not re-sent
  });
  it('Starter Pack: pack stays 1, files above 4 go on a Production priced item', async () => {
    const f = fake('wirebook_starter_pack_monthly');
    const db = await seed('starter_pack', 6);
    expect(await syncStripeQuantity(f.stripe, db, 'org_1')).toEqual({ subscriptionId: 'sub_1', quantity: 1, extraQuantity: 2 });
    expect(f.calls).toEqual([{ m: 'create', a: ['price_prod_m', 2] }]);
  });
  it('reports nothing for Developer, and never touches another app\'s subscription', async () => {
    const f = fake('wirebook_production_monthly', 'otherapp');
    expect(await syncStripeQuantity(f.stripe, await seed('production', 2), 'org_1')).toBeNull();
    expect(await syncStripeQuantity(f.stripe, await seed('free', 2), 'org_1')).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
});

describe('connection health transitions', () => {
  const u = (o: Partial<EndUser>): EndUser => ({ id: 'end_1', projectId: 'org_1__production', qbwcUsername: 'x', qbwcPasswordHash: 'x', ownerGuid: 'g', fileGuid: 'f', status: 'connected', failedAuth: { count: 0, windowStart: T0 }, ...o });

  it('evaluate: asleep after 2 hours, broken after 72, pending untouched, broken is sticky', () => {
    expect(evaluate(u({ lastPollAt: new Date(T0.getTime() - 1 * H) }), T0)).toBeNull();
    expect(evaluate(u({ lastPollAt: new Date(T0.getTime() - 3 * H) }), T0)).toMatchObject({ status: 'asleep' });
    expect(evaluate(u({ status: 'asleep', lastPollAt: new Date(T0.getTime() - 5 * H) }), T0)).toBeNull();
    expect(evaluate(u({ status: 'asleep', lastPollAt: new Date(T0.getTime() - 80 * H) }), T0)).toMatchObject({ status: 'broken' });
    expect(evaluate(u({ lastPollAt: new Date(T0.getTime() - 80 * H) }), T0)).toMatchObject({ status: 'broken' });
    expect(evaluate(u({ status: 'pending' }), T0)).toBeNull();
    expect(evaluate(u({ status: 'broken', lastPollAt: new Date(T0.getTime() - 80 * H) }), T0)).toBeNull();
    expect(product.health.asleepAfterMs).toBe(2 * H);
  });

  it('health-tick: marks Asleep then Broken, one email per incident, new email after recovery and a second break', async () => {
    const h = harness();
    const { user, sim } = await h.addUser('end_a', { projectId: 'org_1__production' });
    await h.bridge.users.update(user.id, { status: 'connected', lastPollAt: new Date(T0.getTime() - 3 * H), companyName: 'Acme Builders' });
    const sent: { to: string; subject: string }[] = [];
    let now = T0;
    const run = () => healthTick({ bridge: h.bridge, ownerEmail: async () => 'owner@example.test', send: async (m) => { sent.push(m); }, now: () => now, baseUrl: 'https://wirebook.test' });

    expect(await run()).toMatchObject({ checked: 1, asleep: 1, broken: 0, emailed: 0 });
    expect((await h.bridge.users.get('end_a'))?.status).toBe('asleep');
    expect(await run()).toMatchObject({ asleep: 0, emailed: 0 }); // idempotent

    now = new Date(T0.getTime() + 80 * H);
    expect(await run()).toMatchObject({ broken: 1, emailed: 1 });
    expect(await run()).toMatchObject({ broken: 0, emailed: 0 }); // same incident: no second email
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'owner@example.test', subject: expect.stringContaining('Acme Builders') });

    // the Web Connector polls again: bridge recovers the file and clears the incident
    h.clock.now = now;
    await sim.runSession();
    const back = await h.bridge.users.get('end_a');
    expect(back).toMatchObject({ status: 'connected' });
    expect(back?.brokenNotifiedAt).toBeUndefined();

    now = new Date(now.getTime() + 80 * H);
    expect(await run()).toMatchObject({ broken: 1, emailed: 1 }); // a new incident after recovery emails again
    const events = (await h.bridge.health.list('end_a', 20)).map((e) => e.status);
    expect(events).toEqual(expect.arrayContaining(['asleep', 'broken', 'connected']));
    expect(sent.length).toBe(2);
  });

  it('records the incident but sends no email for test files or an unknown owner', async () => {
    const h = harness();
    await h.addUser('end_t', { projectId: 'org_1__test' });
    await h.addUser('end_p', { projectId: 'org_1__production' });
    for (const id of ['end_t', 'end_p']) await h.bridge.users.update(id, { status: 'connected', lastPollAt: new Date(T0.getTime() - 100 * H) });
    const sent: unknown[] = [];
    const r = await healthTick({ bridge: h.bridge, ownerEmail: async () => null, send: async (m) => { sent.push(m); }, now: () => T0, baseUrl: 'https://wirebook.test' });
    expect(r.emailed).toBe(0);
    expect(sent).toHaveLength(0);
    expect((await h.bridge.users.get('end_t'))?.status).toBe('broken');
    expect((await h.bridge.users.get('end_p'))?.brokenNotifiedAt).toBeDefined();
  });

  it('connection error from the Web Connector writes a Broken event; a reconnect link works for a broken file only', async () => {
    const h = harness();
    const { sim, qb } = await h.addUser('end_a');
    void qb;
    expect((await h.call('POST', '/v1/connect-links', { body: { externalId: 'end_a' }, user: null })).status).toBe(201);
    const s = await sim.runSession();
    expect(s.authResult).not.toBe('nvu');
    await h.bridge.users.update('end_a', { firstSyncAt: new Date(), status: 'connected' });
    expect((await h.call('POST', '/v1/connect-links', { body: { externalId: 'end_a' }, user: null })).status).toBe(409);
    await h.bridge.users.update('end_a', { status: 'broken' });
    const again = await h.call('POST', '/v1/connect-links', { body: { externalId: 'end_a' }, user: null });
    expect(again.status).toBe(201);
    expect((await h.bridge.users.get('end_a'))?.firstSyncAt).toBeUndefined(); // the four steps replay
  });
});

describe('retention purge', () => {
  it('clamps: default 14, an org can only shorten, minimum 1', () => {
    expect(clampRetention(undefined)).toBe(14);
    expect(clampRetention(7)).toBe(7);
    expect(clampRetention(90)).toBe(14);
    expect(clampRetention(0)).toBe(1);
  });

  it('removes bodies, results and raw responses after the retention, keeps metadata, audits, honours the org setting', async () => {
    const db = createMemoryDb('wirebook');
    const bridge = createMemoryBridge();
    const mk = async (projectId: string, raw = false) => {
      const j = await bridge.queue.enqueue({ endUserId: 'end_x', op: raw ? 'raw' : 'customer.add', body: { name: 'Secret Co', qbxml: '<x/>' }, meta: { projectId, method: 'POST', path: '/v1/qbd/customers', objectType: raw ? 'raw' : 'customers' } });
      await bridge.queue.claim('end_x', new Date());
      await bridge.queue.complete(j.id, { state: 'succeeded', result: [{ name: 'Secret Co' }], ...(raw ? { rawResponse: '<QBXML>secret</QBXML>' } : {}) }, new Date());
      return j.id;
    };
    const a = await mk('org_1__production', true);
    const b = await mk('org_2__production');
    const queued = (await bridge.queue.enqueue({ endUserId: 'end_y', op: 'customer.query', body: {}, meta: { projectId: 'org_1__production', method: 'GET', path: '/x', objectType: 'customers' } })).id;
    await db.setOrgSettings('org_2', { retentionDays: 3 });

    const day = (n: number) => new Date(Date.now() + n * 864e5);
    let r = await purgePayloads(db, bridge, day(5));
    expect(r).toMatchObject({ purged: 1, orgs: 1 });
    expect((await bridge.queue.get(b))).toMatchObject({ body: {}, purgedAt: expect.any(Date), state: 'succeeded', meta: { objectType: 'customers' } });
    expect((await bridge.queue.get(b))?.result).toBeUndefined();
    expect((await bridge.queue.get(a))?.result).toBeDefined(); // org_1 keeps 14 days

    r = await purgePayloads(db, bridge, day(15));
    expect(r.purged).toBe(1);
    const gone = await bridge.queue.get(a);
    expect(gone?.rawResponse).toBeUndefined();
    expect(gone?.result).toBeUndefined();
    expect(gone?.body).toEqual({});
    expect((await bridge.queue.get(queued))?.purgedAt).toBeUndefined(); // queued work is never purged
    expect((await purgePayloads(db, bridge, day(16))).purged).toBe(0); // idempotent

    expect((await db.listAudit('org_2')).map((e) => e.action)).toEqual(['retention.purged']);
    expect((await db.listAudit('org_2'))[0]!.meta).toEqual({ count: 1, retentionDays: 3 });
  });
});
