import { beforeEach, describe, expect, it } from 'vitest';
import { harness } from './helpers/harness';

let h: ReturnType<typeof harness>;
let qb: any;
beforeEach(async () => {
  h = harness();
  qb = (await h.addUser('end_a')).qb;
});

const inv = { customerRef: { fullName: 'Acme Builders' }, refNumber: 'INV-1', lines: [{ itemRef: { fullName: 'Labour' }, quantity: 2, rate: 10 }] };

describe('REST /v1/qbd core objects (validated against the simulator)', () => {
  it('creates a customer: 201 with the created object, request id header', async () => {
    const r = await h.call('POST', '/v1/qbd/customers', { body: { name: 'Acme Builders', email: 'ap@acme.test' } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ name: 'Acme Builders', revisionNumber: '1700000000' });
    expect(r.json.listId).toMatch(/^8000/);
    expect(r.headers.get('x-request-id')).toMatch(/^req_/);
    expect(qb.customers).toHaveLength(1);
  });

  it('creates and lists all seven objects through the queue', async () => {
    await h.call('POST', '/v1/qbd/customers', { body: { name: 'Acme Builders' } });
    expect((await h.call('POST', '/v1/qbd/vendors', { body: { name: 'Lumber Co', email: 'x@lumber.test' } })).status).toBe(201);
    expect((await h.call('POST', '/v1/qbd/accounts', { body: { name: 'Sales', accountType: 'Income' } })).status).toBe(201);
    expect((await h.call('POST', '/v1/qbd/items', { body: { name: 'Labour', salesOrPurchase: { price: 85, accountRef: { fullName: 'Sales' } } } })).status).toBe(201);
    expect((await h.call('POST', '/v1/qbd/invoices', { body: inv })).status).toBe(201);
    const bill = await h.call('POST', '/v1/qbd/bills', { body: { vendorRef: { fullName: 'Lumber Co' }, refNumber: 'B-1', expenseLines: [{ accountRef: { fullName: 'Sales' }, amount: 120.5 }] } });
    expect(bill.status).toBe(201);
    expect(bill.json.amountDue).toBe('120.50');
    const pay = await h.call('POST', '/v1/qbd/payments', { body: { customerRef: { fullName: 'Acme Builders' }, totalAmount: 20, appliedTo: [{ txnId: '9000-1', paymentAmount: 20 }] } });
    expect(pay.status).toBe(201);
    for (const o of ['customers', 'vendors', 'items', 'accounts', 'invoices', 'bills', 'payments']) {
      const l = await h.call('GET', `/v1/qbd/${o}`);
      expect(l.status, o).toBe(200);
      expect(l.json.data, o).toHaveLength(1);
      expect(l.json).toMatchObject({ hasMore: false, nextCursor: null });
    }
  });

  it('retrieves by id and answers 404 not_found for an unknown id', async () => {
    const c = (await h.call('POST', '/v1/qbd/customers', { body: { name: 'Acme Builders' } })).json;
    const got = await h.call('GET', `/v1/qbd/customers/${c.listId}`);
    expect(got.json.name).toBe('Acme Builders');
    const none = await h.call('GET', '/v1/qbd/customers/80000001-999');
    expect(none.status).toBe(404);
    expect(none.json.error.code).toBe('not_found');
  });

  it('updates with revisionNumber; stale -> 409; missing -> 400 with path; unsupported object -> 405', async () => {
    const c = (await h.call('POST', '/v1/qbd/customers', { body: { name: 'Acme Builders' } })).json;
    const missing = await h.call('POST', `/v1/qbd/customers/${c.listId}`, { body: { email: 'a@b.test' } });
    expect(missing.status).toBe(400);
    expect(missing.json.error).toMatchObject({ code: 'invalid_request', path: 'revisionNumber' });
    const ok = await h.call('POST', `/v1/qbd/customers/${c.listId}`, { body: { email: 'a@b.test', revisionNumber: c.revisionNumber } });
    expect(ok.status).toBe(200);
    expect(ok.json.revisionNumber).toBe('1700000001');
    const stale = await h.call('POST', `/v1/qbd/customers/${c.listId}`, { body: { email: 'z@b.test', revisionNumber: c.revisionNumber } });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('revision_conflict');
    expect((await h.call('POST', '/v1/qbd/payments/9500-1', { body: {} })).status).toBe(405);
  });

  it('vendor update works through VendorMod', async () => {
    const v = (await h.call('POST', '/v1/qbd/vendors', { body: { name: 'Lumber Co' } })).json;
    const up = await h.call('POST', `/v1/qbd/vendors/${v.listId}`, { body: { phone: '555-0100', revisionNumber: v.revisionNumber } });
    expect(up.status).toBe(200);
    expect(up.json.phone).toBe('555-0100');
  });
});

describe('cursor pagination', () => {
  beforeEach(() => { for (const n of ['A', 'B', 'C', 'D', 'E']) qb.seedCustomer(`Cust ${n}`); });

  it('walks pages with nextCursor and hasMore', async () => {
    const names: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: any = await h.call('GET', `/v1/qbd/customers?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      expect(r.status).toBe(200);
      names.push(...r.json.data.map((c: any) => c.name));
      cursor = r.json.nextCursor;
      expect(r.json.hasMore).toBe(cursor !== null);
      if (cursor) expect(new Date(r.json.cursorExpiresAt).getTime()).toBeGreaterThan(h.clock.now.getTime());
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(names).toEqual(['Cust A', 'Cust B', 'Cust C', 'Cust D', 'Cust E']);
  });

  it('applies filters and rejects bad limit, unknown params and tampered cursors', async () => {
    qb.seedCustomer('Zed');
    const f = await h.call('GET', '/v1/qbd/customers?name=Zed');
    expect(f.json.data.map((c: any) => c.name)).toEqual(['Zed']);
    expect((await h.call('GET', '/v1/qbd/customers?limit=0')).json.error.path).toBe('limit');
    expect((await h.call('GET', '/v1/qbd/customers?limit=101')).status).toBe(400);
    expect((await h.call('GET', '/v1/qbd/customers?colour=red')).json.error).toMatchObject({ code: 'invalid_request', path: 'colour' });
    const bad = await h.call('GET', '/v1/qbd/customers?cursor=not-a-cursor');
    expect(bad.status).toBe(400);
    expect(bad.json.error.code).toBe('invalid_cursor');
  });

  it('refuses a cursor from another object and answers 410 cursor_expired after 10 minutes', async () => {
    const first = await h.call('GET', '/v1/qbd/customers?limit=2');
    const cursor = first.json.nextCursor as string;
    expect((await h.call('GET', `/v1/qbd/vendors?cursor=${cursor}`)).json.error.code).toBe('invalid_cursor');
    h.clock.now = new Date(h.clock.now.getTime() + 11 * 60_000);
    const gone = await h.call('GET', `/v1/qbd/customers?cursor=${cursor}`);
    expect(gone.status).toBe(410);
    expect(gone.json.error.code).toBe('cursor_expired');
    expect(gone.json.error.cursorExpiresAt).toBeTruthy();
  });
});

describe('idempotency (writes, 7 days)', () => {
  beforeEach(() => { qb.seedCustomer('Acme Builders'); });

  it('replays the original response and sends one request to QuickBooks', async () => {
    const a = await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'acme-inv-1' } });
    const b = await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'acme-inv-1' } });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.json).toEqual(a.json);
    expect(b.headers.get('idempotent-replayed')).toBe('true');
    expect(a.headers.get('idempotent-replayed')).toBeNull();
    expect(b.headers.get('x-request-id')).toBe(a.headers.get('x-request-id'));
    expect(qb.invoices).toHaveLength(1);
  });

  it('is body-order insensitive but 409s on a different body or path', async () => {
    await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'k1' } });
    const reordered = { lines: inv.lines, refNumber: 'INV-1', customerRef: inv.customerRef };
    expect((await h.call('POST', '/v1/qbd/invoices', { body: reordered, headers: { 'idempotency-key': 'k1' } })).status).toBe(201);
    const diff = await h.call('POST', '/v1/qbd/invoices', { body: { ...inv, refNumber: 'INV-2' }, headers: { 'idempotency-key': 'k1' } });
    expect(diff.status).toBe(409);
    expect(diff.json.error.code).toBe('idempotency_conflict');
    expect(qb.invoices).toHaveLength(1);
  });

  it('expires after 7 days and is scoped per project', async () => {
    await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'k2' } });
    h.clock.now = new Date(h.clock.now.getTime() + 8 * 24 * 3600_000);
    const again = await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'k2' } });
    expect(again.headers.get('idempotent-replayed')).toBeNull();
    expect(qb.invoices).toHaveLength(2);
    expect((await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': '' } })).json.error.path).toBe('Idempotency-Key');
  });

  it('keys are scoped per project: the same key in production is a separate request', async () => {
    const prod = await h.addUser('end_p', { projectId: 'org_1__production' });
    prod.qb.seedCustomer('Acme Builders');
    await h.call('POST', '/v1/qbd/invoices', { body: inv, headers: { 'idempotency-key': 'same' } });
    const p = await h.call('POST', '/v1/qbd/invoices', { body: inv, auth: h.key('production'), user: 'end_p', headers: { 'idempotency-key': 'same' } });
    expect(p.status).toBe(201);
    expect(p.headers.get('idempotent-replayed')).toBeNull();
    expect(prod.qb.invoices).toHaveLength(1);
  });
});

describe('sync, async and request lifecycle', () => {
  it('answers 202 with a request id when QuickBooks has not answered; GET /v1/requests/{id} then shows the result', async () => {
    const slow = harness({ waitMs: 0 });
    const { sim } = await slow.addUser('end_a');
    const r = await slow.call('POST', '/v1/qbd/customers', { body: { name: 'Late Co' } });
    expect(r.status).toBe(202);
    expect(r.json).toMatchObject({ object: 'request', state: 'queued' });
    expect(r.headers.get('location')).toBe(`/v1/requests/${r.json.id}`);
    expect((await slow.call('GET', `/v1/requests/${r.json.id}`)).json.state).toBe('queued');
    await sim.runSession();
    const done = await slow.call('GET', `/v1/requests/${r.json.id}`);
    expect(done.json).toMatchObject({ state: 'succeeded', data: [{ name: 'Late Co' }] });
  });

  it('Prefer: respond-async returns 202 immediately', async () => {
    const r = await h.call('POST', '/v1/qbd/customers', { body: { name: 'Async Co' }, headers: { prefer: 'respond-async' } });
    expect(r.status).toBe(202);
    expect(qb.customers).toHaveLength(0);
  });

  it('a failed QuickBooks request keeps its state and error in the request record', async () => {
    const r = await h.call('POST', '/v1/qbd/invoices', { body: inv });
    expect(r.status).toBe(422);
    const rec = await h.call('GET', `/v1/requests/${r.json.error.requestId}`);
    expect(rec.json).toMatchObject({ state: 'failed', error: { code: 'invalid_reference' } });
  });
});

describe('unified errors and error mapping', () => {
  it('maps QuickBooks codes to catalogue errors with a resolvable guideUrl', async () => {
    const bad = await h.call('POST', '/v1/qbd/invoices', { body: inv });
    expect(bad.json.error).toEqual({
      code: 'invalid_reference', type: 'quickbooks', retryable: false,
      message: 'A referenced list item does not exist in this company file (3140).',
      userFacingMessage: 'A name or item in this request was not found in QuickBooks.',
      guideUrl: 'https://wirebook.test/errors/3140', requestId: bad.headers.get('x-request-id'),
    });
    await h.call('POST', '/v1/qbd/customers', { body: { name: 'Dup' } });
    const dup = await h.call('POST', '/v1/qbd/customers', { body: { name: 'Dup' } });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toMatchObject({ code: 'duplicate_name', guideUrl: 'https://wirebook.test/errors/3100' });
  });

  it('validates input with the JSON path before anything is queued', async () => {
    const r = await h.call('POST', '/v1/qbd/invoices', { body: { customerRef: { fullName: 'A' }, lines: [{ itemRef: { fullName: 'I' }, colour: 'red' }] } });
    expect(r.status).toBe(400);
    expect(r.json.error).toMatchObject({ code: 'invalid_request', path: 'lines[0].colour', guideUrl: 'https://wirebook.test/errors/invalid-request' });
    expect((await h.call('POST', '/v1/qbd/customers', { raw: '{nope', headers: { 'content-type': 'application/json' } })).json.error.code).toBe('invalid_json');
    expect((await h.call('POST', '/v1/qbd/customers', { body: [1] })).json.error.path).toBe('$');
    expect((await h.call('POST', '/v1/qbd/customers', { raw: JSON.stringify({ name: 'x'.repeat(1_100_000) }) })).status).toBe(413);
    expect(await h.bridge.queue.list({ projectId: 'org_1__test', limit: 50 })).toHaveLength(0);
  });

  it('auth and tenancy: missing/invalid key, missing or foreign end user, other project requests', async () => {
    expect((await h.call('GET', '/v1/qbd/customers', { auth: null })).json.error.code).toBe('missing_api_key');
    const bad = await h.call('GET', '/v1/qbd/customers', { auth: 'Bearer bad' });
    expect(bad.status).toBe(401);
    expect(bad.json.error.code).toBe('invalid_api_key');
    expect((await h.call('GET', '/v1/qbd/customers', { user: null })).json.error.code).toBe('end_user_required');
    expect((await h.call('GET', '/v1/qbd/customers', { user: 'end_nope' })).status).toBe(404);
    // a production key cannot see the test end user, nor a test request
    const prod = await h.call('GET', '/v1/qbd/customers', { auth: h.key('production') });
    expect(prod.json.error.code).toBe('end_user_not_found');
    const mine = await h.call('POST', '/v1/qbd/customers', { body: { name: 'Mine' } });
    expect((await h.call('GET', `/v1/requests/${mine.headers.get('x-request-id')}`, { auth: h.key('production') })).status).toBe(404);
    // another org with the same external id is a different project
    await h.addUser('end_other', { projectId: 'org_2__test', externalId: 'end_a2' });
    expect((await h.call('GET', '/v1/qbd/customers', { auth: h.key('test', 'org_1'), user: 'end_other' })).status).toBe(404);
  });

  it('resolves end users by external id and unknown objects are 404', async () => {
    await h.addUser('end_x', { externalId: 'acme-42' });
    expect((await h.call('GET', '/v1/qbd/customers', { user: 'acme-42' })).status).toBe(200);
    expect((await h.call('GET', '/v1/qbd/widgets')).json.error.code).toBe('not_found');
  });
});

describe('POST /v1/qbd/raw', () => {
  const rq = (inner: string) => `<?xml version="1.0"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">${inner}</QBXMLMsgsRq></QBXML>`;

  it('forwards valid qbXML and returns the raw response plus parsed JSON', async () => {
    qb.seedCustomer('Acme Builders');
    const r = await h.call('POST', '/v1/qbd/raw', { body: { qbxml: rq('<CustomerQueryRq requestID="1"><MaxReturned>5</MaxReturned></CustomerQueryRq>') } });
    expect(r.status).toBe(200);
    expect(r.json.raw).toContain('<CustomerRet>');
    expect(r.json.parsed).toMatchObject({ statusCode: 0, rs: 'CustomerQueryRs', rows: [{ name: 'Acme Builders' }] });
    expect(r.json.state).toBe('succeeded');
  });

  it('accepts an XML body and returns QuickBooks errors as parsed output', async () => {
    const r = await h.call('POST', '/v1/qbd/raw', { raw: rq('<InvoiceAddRq requestID="2"><InvoiceAdd><CustomerRef><FullName>Nobody</FullName></CustomerRef></InvoiceAdd></InvoiceAddRq>'), headers: { 'content-type': 'text/xml' } });
    expect(r.status).toBe(200);
    expect(r.json.state).toBe('failed');
    expect(r.json.parsed.statusCode).toBe(3140);
  });

  it('rejects malformed XML with the position, and anything but a single request', async () => {
    const bad = await h.call('POST', '/v1/qbd/raw', { body: { qbxml: '<QBXML><QBXMLMsgsRq><CustomerQueryRq></QBXMLMsgsRq></QBXML>' } });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toMatchObject({ code: 'invalid_qbxml' });
    expect(bad.json.error.path).toMatch(/^line \d+, column \d+$/);
    const two = await h.call('POST', '/v1/qbd/raw', { body: { qbxml: rq('<CustomerQueryRq/><VendorQueryRq/>') } });
    expect(two.json.error.code).toBe('invalid_qbxml');
    expect((await h.call('POST', '/v1/qbd/raw', { body: {} })).json.error.path).toBe('qbxml');
    expect((await h.call('POST', '/v1/qbd/raw', { body: { qbxml: '<a/>' } })).json.error.code).toBe('invalid_qbxml');
  });
});
