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
  { op: 'estimate.query', input: { entityFilter: { fullName: 'Acme' }, maxReturned: 2 }, xml: '<EstimateQueryRq requestID="g"><MaxReturned>2</MaxReturned><EntityFilter><FullName>Acme</FullName></EntityFilter></EstimateQueryRq>' },
  { op: 'estimate.add', input: { refNumber: 'E-1', customerRef: { fullName: 'Acme' }, txnDate: '2026-11-05', lines: [{ rate: 5, quantity: 2, itemRef: { fullName: 'Labour' } }] },
    xml: '<EstimateAddRq requestID="g"><EstimateAdd><CustomerRef><FullName>Acme</FullName></CustomerRef><TxnDate>2026-11-05</TxnDate><RefNumber>E-1</RefNumber><EstimateLineAdd><ItemRef><FullName>Labour</FullName></ItemRef><Quantity>2</Quantity><Rate>5.00</Rate></EstimateLineAdd></EstimateAdd></EstimateAddRq>' },
  { op: 'salesOrder.query', input: { refNumbers: ['SO-1'] }, xml: '<SalesOrderQueryRq requestID="g"><RefNumber>SO-1</RefNumber></SalesOrderQueryRq>' },
  { op: 'salesOrder.add', input: { memo: 'm', shipDate: '2026-12-01', pONumber: 'P1', customerRef: { fullName: 'Acme' }, lines: [{ amount: 9, itemRef: { fullName: 'Labour' } }] },
    xml: '<SalesOrderAddRq requestID="g"><SalesOrderAdd><CustomerRef><FullName>Acme</FullName></CustomerRef><PONumber>P1</PONumber><ShipDate>2026-12-01</ShipDate><Memo>m</Memo><SalesOrderLineAdd><ItemRef><FullName>Labour</FullName></ItemRef><Amount>9.00</Amount></SalesOrderLineAdd></SalesOrderAdd></SalesOrderAddRq>' },
  { op: 'salesReceipt.query', input: { includeLineItems: true }, xml: '<SalesReceiptQueryRq requestID="g"><IncludeLineItems>true</IncludeLineItems></SalesReceiptQueryRq>' },
  { op: 'salesReceipt.add', input: { depositToAccountRef: { fullName: 'Bank' }, checkNumber: '77', customerRef: { fullName: 'Acme' }, paymentMethodRef: { fullName: 'Cash' }, lines: [{ rate: 1, itemRef: { fullName: 'Labour' } }] },
    xml: '<SalesReceiptAddRq requestID="g"><SalesReceiptAdd><CustomerRef><FullName>Acme</FullName></CustomerRef><CheckNumber>77</CheckNumber><PaymentMethodRef><FullName>Cash</FullName></PaymentMethodRef><DepositToAccountRef><FullName>Bank</FullName></DepositToAccountRef><SalesReceiptLineAdd><ItemRef><FullName>Labour</FullName></ItemRef><Rate>1.00</Rate></SalesReceiptLineAdd></SalesReceiptAdd></SalesReceiptAddRq>' },
  { op: 'creditMemo.query', input: { modifiedDateRangeFilter: { fromModifiedDate: '2026-01-01' } }, xml: '<CreditMemoQueryRq requestID="g"><ModifiedDateRangeFilter><FromModifiedDate>2026-01-01</FromModifiedDate></ModifiedDateRangeFilter></CreditMemoQueryRq>' },
  { op: 'creditMemo.add', input: { memo: 'refund', aRAccountRef: { fullName: 'AR' }, customerRef: { fullName: 'Acme' }, lines: [{ amount: 3, itemRef: { fullName: 'Labour' } }] },
    xml: '<CreditMemoAddRq requestID="g"><CreditMemoAdd><CustomerRef><FullName>Acme</FullName></CustomerRef><ARAccountRef><FullName>AR</FullName></ARAccountRef><Memo>refund</Memo><CreditMemoLineAdd><ItemRef><FullName>Labour</FullName></ItemRef><Amount>3.00</Amount></CreditMemoLineAdd></CreditMemoAdd></CreditMemoAddRq>' },
  { op: 'purchaseOrder.query', input: { entityFilter: { fullName: 'Lumber Co' } }, xml: '<PurchaseOrderQueryRq requestID="g"><EntityFilter><FullName>Lumber Co</FullName></EntityFilter></PurchaseOrderQueryRq>' },
  { op: 'purchaseOrder.add', input: { expectedDate: '2026-12-02', vendorRef: { fullName: 'Lumber Co' }, lines: [{ rate: 4, quantity: 3, customerRef: { fullName: 'Acme' }, itemRef: { fullName: 'Plank' } }] },
    xml: '<PurchaseOrderAddRq requestID="g"><PurchaseOrderAdd><VendorRef><FullName>Lumber Co</FullName></VendorRef><ExpectedDate>2026-12-02</ExpectedDate><PurchaseOrderLineAdd><ItemRef><FullName>Plank</FullName></ItemRef><Quantity>3</Quantity><Rate>4.00</Rate><CustomerRef><FullName>Acme</FullName></CustomerRef></PurchaseOrderLineAdd></PurchaseOrderAdd></PurchaseOrderAddRq>' },
  { op: 'class.query', input: { activeStatus: 'ActiveOnly' }, xml: '<ClassQueryRq requestID="g"><ActiveStatus>ActiveOnly</ActiveStatus></ClassQueryRq>' },
  { op: 'class.add', input: { parentRef: { fullName: 'East' }, name: 'East:Leeds' }, xml: '<ClassAddRq requestID="g"><ClassAdd><Name>East:Leeds</Name><ParentRef><FullName>East</FullName></ParentRef></ClassAdd></ClassAddRq>' },
  { op: 'class.mod', input: { name: 'North', revisionNumber: '3', listId: 'C1' }, xml: '<ClassModRq requestID="g"><ClassMod><ListID>C1</ListID><EditSequence>3</EditSequence><Name>North</Name></ClassMod></ClassModRq>' },
  { op: 'terms.query', input: { listIds: ['T1'] }, xml: '<TermsQueryRq requestID="g"><ListID>T1</ListID></TermsQueryRq>' },
  { op: 'terms.add', input: { discountPct: '2.0', stdDueDays: 30, name: 'Net 30', stdDiscountDays: 10 },
    xml: '<StandardTermsAddRq requestID="g"><StandardTermsAdd><Name>Net 30</Name><StdDueDays>30</StdDueDays><StdDiscountDays>10</StdDiscountDays><DiscountPct>2.0</DiscountPct></StandardTermsAdd></StandardTermsAddRq>' },
  { op: 'employee.query', input: { nameFilter: { name: 'Ann', matchCriterion: 'StartsWith' } }, xml: '<EmployeeQueryRq requestID="g"><NameFilter><MatchCriterion>StartsWith</MatchCriterion><Name>Ann</Name></NameFilter></EmployeeQueryRq>' },
  { op: 'employee.add', input: { email: 'a@b.test', lastName: 'Lee', firstName: 'Ann', jobTitle: 'Foreman' },
    xml: '<EmployeeAddRq requestID="g"><EmployeeAdd><FirstName>Ann</FirstName><LastName>Lee</LastName><JobTitle>Foreman</JobTitle><Email>a@b.test</Email></EmployeeAdd></EmployeeAddRq>' },
  { op: 'employee.mod', input: { phone: '555', revisionNumber: '9', listId: 'E1' }, xml: '<EmployeeModRq requestID="g"><EmployeeMod><ListID>E1</ListID><EditSequence>9</EditSequence><Phone>555</Phone></EmployeeMod></EmployeeModRq>' },
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
    need('estimate.add', {}, /customerRef: is required/);
    need('estimate.add', { customerRef: { fullName: 'c' }, lines: [{}] }, /lines\[0\]\.itemRef: is required/);
    need('salesOrder.add', {}, /customerRef: is required/);
    need('salesReceipt.add', {}, /customerRef: is required/);
    need('creditMemo.add', {}, /customerRef: is required/);
    need('purchaseOrder.add', {}, /vendorRef: is required/);
    need('class.add', {}, /name: is required/);
    need('class.mod', { listId: 'C1' }, /revisionNumber: is required/);
    need('terms.add', {}, /name: is required/);
    need('employee.add', { firstName: 'A' }, /lastName: is required/);
    need('employee.mod', { revisionNumber: '1' }, /listId: is required/);
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
