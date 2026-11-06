import { beforeEach, describe, expect, it } from 'vitest';
import { buildRequest, type OpName } from '../src/lib/qbxml';
import { harness } from './helpers/harness';

/**
 * M4 update operations. Golden fixtures are hand-authored from the public qbXML reference (see DECISIONS):
 * they prove self-consistency and element order, not acceptance by real QuickBooks.
 */
const GOLDEN: { op: OpName; input: unknown; xml: string }[] = [
  { op: 'estimate.mod', input: { txnId: 'T1', revisionNumber: '5', memo: 'Rev B', lines: [{ txnLineId: '-1', itemRef: { fullName: 'Labour' }, quantity: 3 }] },
    xml: '<EstimateModRq requestID="g"><EstimateMod><TxnID>T1</TxnID><EditSequence>5</EditSequence><Memo>Rev B</Memo><EstimateLineMod><TxnLineID>-1</TxnLineID><ItemRef><FullName>Labour</FullName></ItemRef><Quantity>3</Quantity></EstimateLineMod></EstimateMod></EstimateModRq>' },
  { op: 'salesOrder.mod', input: { txnId: 'T2', revisionNumber: '1', dueDate: '2026-12-01' },
    xml: '<SalesOrderModRq requestID="g"><SalesOrderMod><TxnID>T2</TxnID><EditSequence>1</EditSequence><DueDate>2026-12-01</DueDate></SalesOrderMod></SalesOrderModRq>' },
  { op: 'salesReceipt.mod', input: { txnId: 'T3', revisionNumber: '2', refNumber: 'SR-9' },
    xml: '<SalesReceiptModRq requestID="g"><SalesReceiptMod><TxnID>T3</TxnID><EditSequence>2</EditSequence><RefNumber>SR-9</RefNumber></SalesReceiptMod></SalesReceiptModRq>' },
  { op: 'creditMemo.mod', input: { txnId: 'T4', revisionNumber: '2', customerRef: { listId: 'C1' } },
    xml: '<CreditMemoModRq requestID="g"><CreditMemoMod><TxnID>T4</TxnID><EditSequence>2</EditSequence><CustomerRef><ListID>C1</ListID></CustomerRef></CreditMemoMod></CreditMemoModRq>' },
  { op: 'purchaseOrder.mod', input: { txnId: 'T5', revisionNumber: '4', expectedDate: '2026-12-24', lines: [{ txnLineId: 'L1', rate: 4.5 }] },
    xml: '<PurchaseOrderModRq requestID="g"><PurchaseOrderMod><TxnID>T5</TxnID><EditSequence>4</EditSequence><ExpectedDate>2026-12-24</ExpectedDate><PurchaseOrderLineMod><TxnLineID>L1</TxnLineID><Rate>4.50</Rate></PurchaseOrderLineMod></PurchaseOrderMod></PurchaseOrderModRq>' },
  { op: 'terms.mod', input: { listId: 'S1', revisionNumber: '1', stdDueDays: 45 },
    xml: '<StandardTermsModRq requestID="g"><StandardTermsMod><ListID>S1</ListID><EditSequence>1</EditSequence><StdDueDays>45</StdDueDays></StandardTermsMod></StandardTermsModRq>' },
  { op: 'invoice.mod', input: { txnId: 'T6', revisionNumber: '7', pONumber: 'PO-1' },
    xml: '<InvoiceModRq requestID="g"><InvoiceMod><TxnID>T6</TxnID><EditSequence>7</EditSequence><PONumber>PO-1</PONumber></InvoiceMod></InvoiceModRq>' },
  { op: 'bill.mod', input: { txnId: 'T7', revisionNumber: '3', expenseLines: [{ txnLineId: '-1', accountRef: { fullName: 'Rent' }, amount: 10 }] },
    xml: '<BillModRq requestID="g"><BillMod><TxnID>T7</TxnID><EditSequence>3</EditSequence><ExpenseLineMod><TxnLineID>-1</TxnLineID><AccountRef><FullName>Rent</FullName></AccountRef><Amount>10.00</Amount></ExpenseLineMod></BillMod></BillModRq>' },
  { op: 'item.mod', input: { listId: 'I1', revisionNumber: '1', salesOrPurchase: { price: 12 } },
    xml: '<ItemServiceModRq requestID="g"><ItemServiceMod><ListID>I1</ListID><EditSequence>1</EditSequence><SalesOrPurchaseMod><Price>12.00</Price></SalesOrPurchaseMod></ItemServiceMod></ItemServiceModRq>' },
  { op: 'account.mod', input: { listId: 'A1', revisionNumber: '1', isActive: false },
    xml: '<AccountModRq requestID="g"><AccountMod><ListID>A1</ListID><EditSequence>1</EditSequence><IsActive>false</IsActive></AccountMod></AccountModRq>' },
];

describe('golden fixtures: update operations', () => {
  for (const g of GOLDEN) {
    it(g.op, () => {
      const xml = buildRequest(g.op, g.input, { requestId: 'g' });
      expect(xml).toContain(g.xml);
    });
  }

  it('requires the id and the revisionNumber, and a txnLineId on every line', () => {
    expect(() => buildRequest('estimate.mod', { revisionNumber: '1' }, { requestId: 'g' })).toThrow(/txnId: is required/);
    expect(() => buildRequest('estimate.mod', { txnId: 'T' }, { requestId: 'g' })).toThrow(/revisionNumber: is required/);
    expect(() => buildRequest('estimate.mod', { txnId: 'T', revisionNumber: '1', lines: [{ quantity: 1 }] }, { requestId: 'g' })).toThrow(/lines\[0\]\.txnLineId: is required/);
    expect(() => buildRequest('terms.mod', { listId: 'S', revisionNumber: '1', bogus: 1 }, { requestId: 'g' })).toThrow(/unknown field/);
  });
});

let h: ReturnType<typeof harness>;
beforeEach(async () => {
  h = harness();
  const { qb } = await h.addUser('end_a');
  qb.seedCustomer('Acme Builders');
});

describe('update operations through the REST API and the simulator', () => {
  it('estimates: update, then a stale revisionNumber is 409', async () => {
    const c = (await h.call('POST', '/v1/qbd/estimates', { body: { customerRef: { fullName: 'Acme Builders' }, lines: [{ itemRef: { fullName: 'Labour' }, quantity: 1, rate: 5 }] } })).json;
    expect(c.revisionNumber).toBe('1700000000');
    const ok = await h.call('POST', `/v1/qbd/estimates/${c.txnId}`, { body: { memo: 'Updated', revisionNumber: c.revisionNumber } });
    expect(ok.status).toBe(200);
    expect(ok.json.revisionNumber).toBe('1700000001');
    const stale = await h.call('POST', `/v1/qbd/estimates/${c.txnId}`, { body: { memo: 'Again', revisionNumber: c.revisionNumber } });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('revision_conflict');
  });

  it('terms and account: update works', async () => {
    const t = (await h.call('POST', '/v1/qbd/terms', { body: { name: 'Net 30', stdDueDays: 30 } })).json;
    const tu = await h.call('POST', `/v1/qbd/terms/${t.listId}`, { body: { stdDueDays: 45, revisionNumber: t.revisionNumber } });
    expect(tu.status).toBe(200);
    expect(tu.json.stdDueDays).toBe('45');
    const ar = await h.call('POST', '/v1/qbd/accounts', { body: { name: 'Petty cash', accountType: 'Bank' } });
    const a = ar.json;
    const au = await h.call('POST', `/v1/qbd/accounts/${a.listId}`, { body: { isActive: false, revisionNumber: a.revisionNumber } });
    expect(au.status).toBe(200);
  });

  it('invoices: update the reference number', async () => {
    const inv = (await h.call('POST', '/v1/qbd/invoices', { body: { customerRef: { fullName: 'Acme Builders' }, refNumber: 'I-1', lines: [{ itemRef: { fullName: 'Labour' }, quantity: 1, rate: 5 }] } })).json;
    const up = await h.call('POST', `/v1/qbd/invoices/${inv.txnId}`, { body: { refNumber: 'I-2', revisionNumber: inv.revisionNumber } });
    expect(up.status).toBe(200);
    expect(up.json.refNumber).toBe('I-2');
  });

  it('a body without revisionNumber is 400 with its path; an unknown id is invalid_reference', async () => {
    const miss = await h.call('POST', '/v1/qbd/sales-orders/9500-1', { body: { memo: 'x' } });
    expect(miss.status).toBe(400);
    expect(miss.json.error.path).toBe('revisionNumber');
    const gone = await h.call('POST', '/v1/qbd/credit-memos/nope', { body: { memo: 'x', revisionNumber: '1' } });
    expect(gone.status).toBe(422);
  });
});
