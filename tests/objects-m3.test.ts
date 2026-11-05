import { beforeEach, describe, expect, it } from 'vitest';
import { harness } from './helpers/harness';

let h: ReturnType<typeof harness>;
let qb: any;
beforeEach(async () => {
  h = harness();
  qb = (await h.addUser('end_a')).qb;
  qb.seedCustomer('Acme Builders');
  await h.call('POST', '/v1/qbd/vendors', { body: { name: 'Lumber Co' } });
});

const line = { itemRef: { fullName: 'Labour' }, quantity: 2, rate: 10 };
const txns: [string, Record<string, unknown>, string][] = [
  ['estimates', { customerRef: { fullName: 'Acme Builders' }, refNumber: 'E-1', lines: [line] }, 'customerRef'],
  ['sales-orders', { customerRef: { fullName: 'Acme Builders' }, refNumber: 'SO-1', lines: [line] }, 'customerRef'],
  ['sales-receipts', { customerRef: { fullName: 'Acme Builders' }, refNumber: 'SR-1', lines: [line] }, 'customerRef'],
  ['credit-memos', { customerRef: { fullName: 'Acme Builders' }, refNumber: 'CM-1', lines: [line] }, 'customerRef'],
  ['purchase-orders', { vendorRef: { fullName: 'Lumber Co' }, refNumber: 'PO-1', lines: [line] }, 'vendorRef'],
];
const lists: [string, Record<string, unknown>, string][] = [
  ['classes', { name: 'East' }, 'name'],
  ['terms', { name: 'Net 30', stdDueDays: 30 }, 'name'],
  ['employees', { firstName: 'Ann', lastName: 'Lee', email: 'ann@x.test' }, 'firstName'],
];

describe('M3 objects through the simulator', () => {
  for (const [obj, body] of txns) {
    it(`${obj}: create, list and get by id`, async () => {
      const c = await h.call('POST', `/v1/qbd/${obj}`, { body });
      expect(c.status).toBe(201);
      expect(c.json.txnId).toMatch(/^9500-/);
      expect(c.json.refNumber).toBe(body.refNumber);
      const l = await h.call('GET', `/v1/qbd/${obj}`);
      expect(l.status).toBe(200);
      expect(l.json.data).toHaveLength(1);
      const g = await h.call('GET', `/v1/qbd/${obj}/${c.json.txnId}`);
      expect(g.status).toBe(200);
      expect(g.json.txnId).toBe(c.json.txnId);
    });
  }
  for (const [obj, body, key] of lists) {
    it(`${obj}: create, list and get by id`, async () => {
      const c = await h.call('POST', `/v1/qbd/${obj}`, { body });
      expect(c.status).toBe(201);
      expect(c.json.listId).toMatch(/^8000/);
      expect(c.json[key]).toBe(body[key]);
      const l = await h.call('GET', `/v1/qbd/${obj}`);
      expect(l.json.data).toHaveLength(1);
      const g = await h.call('GET', `/v1/qbd/${obj}/${c.json.listId}`);
      expect(g.status).toBe(200);
      expect(g.json.listId).toBe(c.json.listId);
    });
  }

  it('employees and classes are queryable by name', async () => {
    await h.call('POST', '/v1/qbd/employees', { body: { firstName: 'Ann', lastName: 'Lee' } });
    await h.call('POST', '/v1/qbd/employees', { body: { firstName: 'Bob', lastName: 'Ray' } });
    const r = await h.call('GET', '/v1/qbd/employees?name=Ann');
    expect(r.json.data.map((e: any) => e.fullName)).toEqual(['Ann Lee']);
  });

  it('replays an idempotent create once', async () => {
    const headers = { 'idempotency-key': 'est-1' };
    const a = await h.call('POST', '/v1/qbd/estimates', { body: txns[0]![1], headers });
    const b = await h.call('POST', '/v1/qbd/estimates', { body: txns[0]![1], headers });
    expect(b.status).toBe(201);
    expect(b.json.txnId).toBe(a.json.txnId);
    expect(qb.store.EstimateRet).toHaveLength(1);
  });

  for (const [obj, body] of txns) {
    it(`${obj}: unknown reference returns 3140 as a 422-class error`, async () => {
      const ref = 'vendorRef' in body ? 'vendorRef' : 'customerRef';
      const r = await h.call('POST', `/v1/qbd/${obj}`, { body: { ...body, [ref]: { fullName: 'Nobody' } } });
      expect(r.status).toBeGreaterThanOrEqual(400);
      expect(r.status).toBeLessThan(500);
      expect(JSON.stringify(r.json)).toMatch(/invalid reference|3140|Nobody/i);
    });
  }

  for (const [obj, body] of [['classes', { name: 'East' }], ['employees', { firstName: 'Ann', lastName: 'Lee' }]] as const) {
    it(`${obj}: update with revisionNumber, stale revision conflicts`, async () => {
      const c = (await h.call('POST', `/v1/qbd/${obj}`, { body })).json;
      const patch = obj === 'classes' ? { isActive: false } : { phone: '555-0100' };
      const ok = await h.call('POST', `/v1/qbd/${obj}/${c.listId}`, { body: { ...patch, revisionNumber: c.revisionNumber } });
      expect(ok.status).toBe(200);
      expect(ok.json.revisionNumber).toBe('1700000001');
      const stale = await h.call('POST', `/v1/qbd/${obj}/${c.listId}`, { body: { ...patch, revisionNumber: c.revisionNumber } });
      expect(stale.status).toBe(409);
      expect(stale.json.error.code).toBe('revision_conflict');
    });
  }

  it('terms and transactions refuse updates (405)', async () => {
    expect((await h.call('POST', '/v1/qbd/terms/80000100-1', { body: {} })).status).toBe(405);
    expect((await h.call('POST', '/v1/qbd/estimates/9500-1', { body: {} })).status).toBe(405);
  });

  it('paginates with limit=2 across 3 rows', async () => {
    for (const n of ['A', 'B', 'C']) await h.call('POST', '/v1/qbd/classes', { body: { name: `Class ${n}` } });
    const names: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: any = await h.call('GET', `/v1/qbd/classes?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(r.status).toBe(200);
      names.push(...r.json.data.map((c: any) => c.name));
      cursor = r.json.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(2);
    expect(names).toEqual(['Class A', 'Class B', 'Class C']);
  });
});
