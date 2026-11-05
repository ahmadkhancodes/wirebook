import { describe, expect, it } from 'vitest';
import { buildRequest, parseResponse, QbxmlValidationError, type OpName } from '../src/lib/qbxml';
import { FakeCompanyFile } from '../tools/simulate-qbwc/simulator';

/**
 * Golden fixtures for the objects added in M2. They are hand-authored from the public qbXML reference
 * (see DECISIONS): they prove the builder is self-consistent and the order is the one we declared,
 * not that real QuickBooks accepts them. Real acceptance needs the Windows rig.
 */
const head = '<?xml version="1.0" encoding="utf-8"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">';
const tail = '</QBXMLMsgsRq></QBXML>';

const GOLDEN: { op: OpName; input: unknown; xml: string }[] = [
  { op: 'vendor.query', input: { maxReturned: 5, activeStatus: 'ActiveOnly', nameFilter: { name: 'Lum', matchCriterion: 'StartsWith' } },
    xml: '<VendorQueryRq requestID="g"><MaxReturned>5</MaxReturned><ActiveStatus>ActiveOnly</ActiveStatus><NameFilter><MatchCriterion>StartsWith</MatchCriterion><Name>Lum</Name></NameFilter></VendorQueryRq>' },
  { op: 'vendor.add', input: { email: 'x@y.test', name: 'Lumber Co', vendorAddress: { city: 'Leeds', addr1: '1 Mill Rd' }, termsRef: { fullName: 'Net 30' } },
    xml: '<VendorAddRq requestID="g"><VendorAdd><Name>Lumber Co</Name><VendorAddress><Addr1>1 Mill Rd</Addr1><City>Leeds</City></VendorAddress><Email>x@y.test</Email><TermsRef><FullName>Net 30</FullName></TermsRef></VendorAdd></VendorAddRq>' },
  { op: 'vendor.mod', input: { name: 'Lumber Ltd', revisionNumber: '17', listId: 'V1' },
    xml: '<VendorModRq requestID="g"><VendorMod><ListID>V1</ListID><EditSequence>17</EditSequence><Name>Lumber Ltd</Name></VendorMod></VendorModRq>' },
  { op: 'item.query', input: { listIds: ['I1', 'I2'] }, xml: '<ItemQueryRq requestID="g"><ListID>I1</ListID><ListID>I2</ListID></ItemQueryRq>' },
  { op: 'item.add', input: { name: 'Labour', salesOrPurchase: { price: 85, desc: 'Hourly', accountRef: { fullName: 'Sales' } } },
    xml: '<ItemServiceAddRq requestID="g"><ItemServiceAdd><Name>Labour</Name><SalesOrPurchase><Desc>Hourly</Desc><Price>85.00</Price><AccountRef><FullName>Sales</FullName></AccountRef></SalesOrPurchase></ItemServiceAdd></ItemServiceAddRq>' },
  { op: 'account.query', input: { accountType: 'Bank', maxReturned: 3 }, xml: '<AccountQueryRq requestID="g"><MaxReturned>3</MaxReturned><AccountType>Bank</AccountType></AccountQueryRq>' },
  { op: 'account.add', input: { accountType: 'Income', name: 'Sales', openBalance: 10, openBalanceDate: '2026-01-01' },
    xml: '<AccountAddRq requestID="g"><AccountAdd><Name>Sales</Name><AccountType>Income</AccountType><OpenBalance>10.00</OpenBalance><OpenBalanceDate>2026-01-01</OpenBalanceDate></AccountAdd></AccountAddRq>' },
  { op: 'bill.query', input: { refNumbers: ['B-1'], includeLineItems: true }, xml: '<BillQueryRq requestID="g"><RefNumber>B-1</RefNumber><IncludeLineItems>true</IncludeLineItems></BillQueryRq>' },
  { op: 'bill.add', input: { refNumber: 'B-1', vendorRef: { fullName: 'Lumber Co' }, txnDate: '2026-11-05', itemLines: [{ cost: 4.5, quantity: 10, itemRef: { fullName: 'Plank' } }], expenseLines: [{ amount: 12, accountRef: { fullName: 'Freight' } }] },
    xml: '<BillAddRq requestID="g"><BillAdd><VendorRef><FullName>Lumber Co</FullName></VendorRef><TxnDate>2026-11-05</TxnDate><RefNumber>B-1</RefNumber><ExpenseLineAdd><AccountRef><FullName>Freight</FullName></AccountRef><Amount>12.00</Amount></ExpenseLineAdd><ItemLineAdd><ItemRef><FullName>Plank</FullName></ItemRef><Quantity>10</Quantity><Cost>4.50</Cost></ItemLineAdd></BillAdd></BillAddRq>' },
  { op: 'payment.query', input: { entityFilter: { fullName: 'Acme' } }, xml: '<ReceivePaymentQueryRq requestID="g"><EntityFilter><FullName>Acme</FullName></EntityFilter></ReceivePaymentQueryRq>' },
  { op: 'payment.add', input: { totalAmount: 20, customerRef: { fullName: 'Acme' }, appliedTo: [{ paymentAmount: 20, txnId: 'T1' }], memo: 'Thanks' },
    xml: '<ReceivePaymentAddRq requestID="g"><ReceivePaymentAdd><CustomerRef><FullName>Acme</FullName></CustomerRef><TotalAmount>20.00</TotalAmount><Memo>Thanks</Memo><AppliedToTxnAdd><TxnID>T1</TxnID><PaymentAmount>20.00</PaymentAmount></AppliedToTxnAdd></ReceivePaymentAdd></ReceivePaymentAddRq>' },
];

describe('golden qbXML requests for the M2 objects', () => {
  for (const g of GOLDEN) {
    it(`${g.op}: element order follows the declared spec regardless of input key order`, () => {
      expect(buildRequest(g.op, g.input, { requestId: 'g' })).toBe(`${head}${g.xml}${tail}`);
    });
  }

  it('requires the fields the spec marks required, with the JSON path', () => {
    const need = (op: OpName, body: unknown, re: RegExp) => expect(() => buildRequest(op, body, { requestId: 'r' })).toThrow(re);
    need('vendor.add', {}, /name: is required/);
    need('vendor.mod', { listId: 'V1' }, /revisionNumber: is required/);
    need('account.add', { name: 'x' }, /accountType: is required/);
    need('item.add', { name: 'x' }, /salesOrPurchase: is required/);
    need('item.add', { name: 'x', salesOrPurchase: {} }, /salesOrPurchase\.accountRef: is required/);
    need('bill.add', {}, /vendorRef: is required/);
    need('bill.add', { vendorRef: { fullName: 'v' }, expenseLines: [{ accountRef: { fullName: 'a' } }] }, /expenseLines\[0\]\.amount: is required/);
    need('payment.add', { customerRef: { fullName: 'c' } }, /totalAmount: is required/);
    need('payment.add', { customerRef: { fullName: 'c' }, totalAmount: 1, appliedTo: [{}] }, /appliedTo\[0\]\.txnId: is required/);
    expect(() => buildRequest('vendor.add', { name: 'x', colour: 1 }, { requestId: 'r' })).toThrowError(new QbxmlValidationError('colour', 'unknown field'));
  });

  it('iterator attributes: Start, then Continue with the id; a bad id is refused', () => {
    expect(buildRequest('customer.query', { maxReturned: 2 }, { requestId: 'g', iterator: { mode: 'Start' } }))
      .toContain('<CustomerQueryRq requestID="g" iterator="Start"><MaxReturned>2</MaxReturned>');
    expect(buildRequest('customer.query', { maxReturned: 2 }, { requestId: 'g', iterator: { mode: 'Continue', id: '{AB-12}' } }))
      .toContain('<CustomerQueryRq requestID="g" iterator="Continue" iteratorID="{AB-12}">');
    expect(() => buildRequest('customer.query', {}, { requestId: 'g', iterator: { mode: 'Continue', id: '"><x/>' } })).toThrow(/iterator id/);
  });
});

describe('golden responses (simulator)', () => {
  it('parses iterator attributes and camelCases Ret rows with revisionNumber', () => {
    const qb = new FakeCompanyFile();
    for (const n of ['A', 'B', 'C']) qb.seedCustomer(`Cust ${n}`);
    const first = parseResponse(qb.respond(buildRequest('customer.query', { maxReturned: 2 }, { requestId: 'p1', iterator: { mode: 'Start' } })));
    expect(first).toMatchObject({ statusCode: 0, rs: 'CustomerQueryRs', requestId: 'p1', iteratorRemaining: 1 });
    expect(first.iteratorId).toMatch(/^\{sim-iter/);
    expect(first.rows).toHaveLength(2);
    expect(first.rows[0]).toMatchObject({ name: 'Cust A', revisionNumber: '1700000000', isActive: 'true' });
    const next = parseResponse(qb.respond(buildRequest('customer.query', { maxReturned: 2 }, { requestId: 'p2', iterator: { mode: 'Continue', id: first.iteratorId } })));
    expect(next).toMatchObject({ iteratorRemaining: 0 });
    expect(next.rows.map((r) => r.name)).toEqual(['Cust C']);
  });

  it('parses a bill with its lines and an empty query as status 1', () => {
    const qb = new FakeCompanyFile();
    qb.respond(buildRequest('vendor.add', { name: 'Lumber Co' }, { requestId: 'v' }));
    const bill = parseResponse(qb.respond(buildRequest('bill.add', { vendorRef: { fullName: 'Lumber Co' }, expenseLines: [{ accountRef: { fullName: 'Freight' }, amount: 5 }] }, { requestId: 'b' })));
    expect(bill.rows[0]).toMatchObject({ txnId: expect.stringMatching(/^9500-/), vendorRef: { fullName: 'Lumber Co' }, expenseLineRet: [{ amount: '5.00' }], amountDue: '5.00' });
    expect(parseResponse(qb.respond(buildRequest('payment.query', {}, { requestId: 'q' })))).toMatchObject({ statusCode: 1, rows: [] });
  });
});
