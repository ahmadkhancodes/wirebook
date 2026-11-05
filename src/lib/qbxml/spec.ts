/**
 * Declarative qbXML element specs. Element ORDER in each array is the order qbXML requires.
 * NOTE: these specs are hand-authored from the public qbXML reference until the generator
 * (tools/gen-qbxml, M2) verifies them against the Intuit XSD, which is login-gated and not
 * redistributed. Golden fixtures therefore prove self-consistency, not real QuickBooks behaviour.
 */
export type Kind = 'str' | 'amount' | 'price' | 'quan' | 'int' | 'bool' | 'date' | 'obj' | 'list';

export interface Field {
  /** qbXML element name */
  name: string;
  kind: Kind;
  /** API key, defaults to camelCase of the element name (ListID -> listId) */
  key?: string;
  max?: number;
  required?: boolean;
  /** children for obj and list */
  children?: Spec;
}
export type Spec = readonly Field[];

export const camel = (name: string): string => name.replace(/ID$/, 'Id').replace(/^./, (c) => c.toLowerCase());
export const keyOf = (f: Field): string => f.key ?? camel(f.name);

const ref: Spec = [
  { name: 'ListID', kind: 'str', max: 36 },
  { name: 'FullName', kind: 'str', max: 209 },
];
const address: Spec = [
  { name: 'Addr1', kind: 'str', max: 41 },
  { name: 'Addr2', kind: 'str', max: 41 },
  { name: 'Addr3', kind: 'str', max: 41 },
  { name: 'City', kind: 'str', max: 31 },
  { name: 'State', kind: 'str', max: 21 },
  { name: 'PostalCode', kind: 'str', max: 13 },
  { name: 'Country', kind: 'str', max: 31 },
];
const R = (name: string): Field => ({ name, kind: 'obj', children: ref });

export const CUSTOMER_QUERY: Spec = [
  { name: 'ListID', kind: 'list', key: 'listIds', children: [] },
  { name: 'FullName', kind: 'list', key: 'fullNames', children: [] },
  { name: 'MaxReturned', kind: 'int' },
  { name: 'ActiveStatus', kind: 'str', max: 12 },
  { name: 'FromModifiedDate', kind: 'date' },
  { name: 'ToModifiedDate', kind: 'date' },
  { name: 'NameFilter', kind: 'obj', children: [
    { name: 'MatchCriterion', kind: 'str', required: true },
    { name: 'Name', kind: 'str', required: true },
  ] },
];

const customerFields: Spec = [
  { name: 'Name', kind: 'str', max: 41 },
  { name: 'IsActive', kind: 'bool' },
  R('ParentRef'),
  { name: 'CompanyName', kind: 'str', max: 41 },
  { name: 'FirstName', kind: 'str', max: 25 },
  { name: 'LastName', kind: 'str', max: 25 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'Phone', kind: 'str', max: 21 },
  { name: 'Email', kind: 'str', max: 1023 },
  R('TermsRef'),
];
export const CUSTOMER_ADD: Spec = customerFields.map((f) => (f.name === 'Name' ? { ...f, required: true } : f));
export const CUSTOMER_MOD: Spec = [
  { name: 'ListID', kind: 'str', required: true },
  { name: 'EditSequence', kind: 'str', key: 'revisionNumber', required: true },
  ...customerFields,
];

export const INVOICE_QUERY: Spec = [
  { name: 'TxnID', kind: 'list', key: 'txnIds', children: [] },
  { name: 'RefNumber', kind: 'list', key: 'refNumbers', children: [] },
  { name: 'MaxReturned', kind: 'int' },
  { name: 'ModifiedDateRangeFilter', kind: 'obj', children: [
    { name: 'FromModifiedDate', kind: 'date' },
    { name: 'ToModifiedDate', kind: 'date' },
  ] },
  { name: 'EntityFilter', kind: 'obj', children: [
    { name: 'ListID', kind: 'str' },
    { name: 'FullName', kind: 'str' },
  ] },
  { name: 'IncludeLineItems', kind: 'bool' },
];

export const INVOICE_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ClassRef'),
  R('ARAccountRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'IsPending', kind: 'bool' },
  { name: 'PONumber', kind: 'str', max: 25 },
  R('TermsRef'),
  { name: 'DueDate', kind: 'date' },
  R('SalesRepRef'),
  { name: 'ShipDate', kind: 'date' },
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  { name: 'InvoiceLineAdd', kind: 'list', key: 'lines', children: [
    { ...R('ItemRef'), required: true },
    { name: 'Desc', kind: 'str', max: 4095 },
    { name: 'Quantity', kind: 'quan' },
    { name: 'UnitOfMeasure', kind: 'str', max: 31 },
    { name: 'Rate', kind: 'price' },
    R('ClassRef'),
    { name: 'Amount', kind: 'amount' },
  ] },
];

/** Shared list query shape (customer, vendor, item, account): ListID*, FullName*, MaxReturned, ActiveStatus, modified range, NameFilter. */
const listQuery = (extra: Spec = []): Spec => [...CUSTOMER_QUERY, ...extra];
export const VENDOR_QUERY: Spec = listQuery();
export const ITEM_QUERY: Spec = listQuery();
export const ACCOUNT_QUERY: Spec = listQuery([{ name: 'AccountType', kind: 'str', max: 40 }]);
/** Transaction query shape reused by bill and receive payment. */
export const BILL_QUERY: Spec = INVOICE_QUERY;
export const PAYMENT_QUERY: Spec = INVOICE_QUERY;

const vendorFields: Spec = [
  { name: 'Name', kind: 'str', max: 41 },
  { name: 'IsActive', kind: 'bool' },
  { name: 'CompanyName', kind: 'str', max: 41 },
  { name: 'FirstName', kind: 'str', max: 25 },
  { name: 'LastName', kind: 'str', max: 25 },
  { name: 'VendorAddress', kind: 'obj', children: address },
  { name: 'Phone', kind: 'str', max: 21 },
  { name: 'Email', kind: 'str', max: 1023 },
  { name: 'NameOnCheck', kind: 'str', max: 41 },
  { name: 'AccountNumber', kind: 'str', max: 99 },
  R('TermsRef'),
];
export const VENDOR_ADD: Spec = vendorFields.map((f) => (f.name === 'Name' ? { ...f, required: true } : f));
export const VENDOR_MOD: Spec = [
  { name: 'ListID', kind: 'str', required: true },
  { name: 'EditSequence', kind: 'str', key: 'revisionNumber', required: true },
  ...vendorFields,
];

/** Service items only in M2; other item types follow with the remaining objects. */
export const ITEM_SERVICE_ADD: Spec = [
  { name: 'Name', kind: 'str', max: 31, required: true },
  { name: 'IsActive', kind: 'bool' },
  R('ParentRef'),
  { name: 'SalesOrPurchase', kind: 'obj', required: true, children: [
    { name: 'Desc', kind: 'str', max: 4095 },
    { name: 'Price', kind: 'price' },
    { ...R('AccountRef'), required: true },
  ] },
];

export const ACCOUNT_ADD: Spec = [
  { name: 'Name', kind: 'str', max: 31, required: true },
  { name: 'IsActive', kind: 'bool' },
  R('ParentRef'),
  { name: 'AccountType', kind: 'str', max: 40, required: true },
  { name: 'AccountNumber', kind: 'str', max: 7 },
  { name: 'BankNumber', kind: 'str', max: 25 },
  { name: 'Desc', kind: 'str', max: 200 },
  { name: 'OpenBalance', kind: 'amount' },
  { name: 'OpenBalanceDate', kind: 'date' },
];

export const BILL_ADD: Spec = [
  { ...R('VendorRef'), required: true },
  R('APAccountRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'DueDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 20 },
  R('TermsRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'ExpenseLineAdd', kind: 'list', key: 'expenseLines', children: [
    { ...R('AccountRef'), required: true },
    { name: 'Amount', kind: 'amount', required: true },
    { name: 'Memo', kind: 'str', max: 4095 },
    R('CustomerRef'),
    R('ClassRef'),
  ] },
  { name: 'ItemLineAdd', kind: 'list', key: 'itemLines', children: [
    { ...R('ItemRef'), required: true },
    { name: 'Desc', kind: 'str', max: 4095 },
    { name: 'Quantity', kind: 'quan' },
    { name: 'UnitOfMeasure', kind: 'str', max: 31 },
    { name: 'Cost', kind: 'price' },
    { name: 'Amount', kind: 'amount' },
    R('CustomerRef'),
    R('ClassRef'),
  ] },
];

export const PAYMENT_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ARAccountRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 20 },
  { name: 'TotalAmount', kind: 'amount', required: true },
  R('PaymentMethodRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  R('DepositToAccountRef'),
  { name: 'AppliedToTxnAdd', kind: 'list', key: 'appliedTo', children: [
    { name: 'TxnID', kind: 'str', required: true },
    { name: 'PaymentAmount', kind: 'amount' },
  ] },
];

/** M3 objects. Same hand-authored caveat as above. */
const saleLine = (tag: string): Field => ({ name: tag, kind: 'list', key: 'lines', children: [
  { ...R('ItemRef'), required: true },
  { name: 'Desc', kind: 'str', max: 4095 },
  { name: 'Quantity', kind: 'quan' },
  { name: 'UnitOfMeasure', kind: 'str', max: 31 },
  { name: 'Rate', kind: 'price' },
  R('ClassRef'),
  { name: 'Amount', kind: 'amount' },
] });
export const ESTIMATE_QUERY: Spec = INVOICE_QUERY;
export const SALES_ORDER_QUERY: Spec = INVOICE_QUERY;
export const SALES_RECEIPT_QUERY: Spec = INVOICE_QUERY;
export const CREDIT_MEMO_QUERY: Spec = INVOICE_QUERY;
export const PURCHASE_ORDER_QUERY: Spec = INVOICE_QUERY;
export const CLASS_QUERY: Spec = listQuery();
export const EMPLOYEE_QUERY: Spec = listQuery();
export const TERMS_QUERY: Spec = listQuery();

export const ESTIMATE_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ClassRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'IsActive', kind: 'bool' },
  { name: 'PONumber', kind: 'str', max: 25 },
  R('TermsRef'),
  { name: 'DueDate', kind: 'date' },
  R('SalesRepRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  saleLine('EstimateLineAdd'),
];
export const SALES_ORDER_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ClassRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'PONumber', kind: 'str', max: 25 },
  R('TermsRef'),
  { name: 'DueDate', kind: 'date' },
  R('SalesRepRef'),
  { name: 'ShipDate', kind: 'date' },
  R('ShipMethodRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  saleLine('SalesOrderLineAdd'),
];
export const SALES_RECEIPT_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ClassRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'IsPending', kind: 'bool' },
  { name: 'CheckNumber', kind: 'str', max: 25 },
  R('PaymentMethodRef'),
  { name: 'DueDate', kind: 'date' },
  R('SalesRepRef'),
  { name: 'ShipDate', kind: 'date' },
  R('ShipMethodRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  R('DepositToAccountRef'),
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  saleLine('SalesReceiptLineAdd'),
];
export const CREDIT_MEMO_ADD: Spec = [
  { ...R('CustomerRef'), required: true },
  R('ClassRef'),
  R('ARAccountRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'BillAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  { name: 'IsPending', kind: 'bool' },
  { name: 'PONumber', kind: 'str', max: 25 },
  R('TermsRef'),
  { name: 'DueDate', kind: 'date' },
  R('SalesRepRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  saleLine('CreditMemoLineAdd'),
];
export const PURCHASE_ORDER_ADD: Spec = [
  { ...R('VendorRef'), required: true },
  R('ClassRef'),
  R('ShipToEntityRef'),
  R('TemplateRef'),
  { name: 'TxnDate', kind: 'date' },
  { name: 'RefNumber', kind: 'str', max: 11 },
  { name: 'VendorAddress', kind: 'obj', children: address },
  { name: 'ShipAddress', kind: 'obj', children: address },
  R('TermsRef'),
  { name: 'DueDate', kind: 'date' },
  { name: 'ExpectedDate', kind: 'date' },
  R('ShipMethodRef'),
  { name: 'Memo', kind: 'str', max: 4095 },
  { name: 'IsToBePrinted', kind: 'bool' },
  { name: 'IsToBeEmailed', kind: 'bool' },
  { name: 'PurchaseOrderLineAdd', kind: 'list', key: 'lines', children: [
    { ...R('ItemRef'), required: true },
    { name: 'Desc', kind: 'str', max: 4095 },
    { name: 'Quantity', kind: 'quan' },
    { name: 'UnitOfMeasure', kind: 'str', max: 31 },
    { name: 'Rate', kind: 'price' },
    R('ClassRef'),
    { name: 'Amount', kind: 'amount' },
    R('CustomerRef'),
  ] },
];

const classFields: Spec = [
  { name: 'Name', kind: 'str', max: 31 },
  { name: 'IsActive', kind: 'bool' },
  R('ParentRef'),
];
export const CLASS_ADD: Spec = classFields.map((f) => (f.name === 'Name' ? { ...f, required: true } : f));
export const CLASS_MOD: Spec = [
  { name: 'ListID', kind: 'str', required: true },
  { name: 'EditSequence', kind: 'str', key: 'revisionNumber', required: true },
  ...classFields,
];

const employeeFields: Spec = [
  { name: 'IsActive', kind: 'bool' },
  { name: 'Salutation', kind: 'str', max: 15 },
  { name: 'FirstName', kind: 'str', max: 25 },
  { name: 'MiddleName', kind: 'str', max: 5 },
  { name: 'LastName', kind: 'str', max: 25 },
  { name: 'JobTitle', kind: 'str', max: 41 },
  { name: 'EmployeeAddress', kind: 'obj', children: address },
  { name: 'PrintAs', kind: 'str', max: 41 },
  { name: 'Phone', kind: 'str', max: 21 },
  { name: 'Mobile', kind: 'str', max: 21 },
  { name: 'Email', kind: 'str', max: 1023 },
];
export const EMPLOYEE_ADD: Spec = employeeFields.map((f) => (f.name === 'FirstName' || f.name === 'LastName' ? { ...f, required: true } : f));
export const EMPLOYEE_MOD: Spec = [
  { name: 'ListID', kind: 'str', required: true },
  { name: 'EditSequence', kind: 'str', key: 'revisionNumber', required: true },
  ...employeeFields,
];

/** Standard terms only; date-driven terms (DateDrivenTermsAdd) are not supported yet. */
export const STANDARD_TERMS_ADD: Spec = [
  { name: 'Name', kind: 'str', max: 31, required: true },
  { name: 'IsActive', kind: 'bool' },
  { name: 'StdDueDays', kind: 'int' },
  { name: 'StdDiscountDays', kind: 'int' },
  { name: 'DiscountPct', kind: 'str', max: 8 },
];

export interface OpDef {
  /** e.g. CustomerQueryRq */
  rq: string;
  /** inner wrapper element for add/mod, e.g. CustomerAdd; absent for queries */
  wrapper?: string;
  spec: Spec;
  /** response element, e.g. CustomerQueryRs */
  rs: string;
  /** the Ret element name in the response */
  ret: string;
}

export const OPS = {
  'customer.query': { rq: 'CustomerQueryRq', rs: 'CustomerQueryRs', ret: 'CustomerRet', spec: CUSTOMER_QUERY },
  'customer.add': { rq: 'CustomerAddRq', wrapper: 'CustomerAdd', rs: 'CustomerAddRs', ret: 'CustomerRet', spec: CUSTOMER_ADD },
  'customer.mod': { rq: 'CustomerModRq', wrapper: 'CustomerMod', rs: 'CustomerModRs', ret: 'CustomerRet', spec: CUSTOMER_MOD },
  'invoice.query': { rq: 'InvoiceQueryRq', rs: 'InvoiceQueryRs', ret: 'InvoiceRet', spec: INVOICE_QUERY },
  'invoice.add': { rq: 'InvoiceAddRq', wrapper: 'InvoiceAdd', rs: 'InvoiceAddRs', ret: 'InvoiceRet', spec: INVOICE_ADD },
  'vendor.query': { rq: 'VendorQueryRq', rs: 'VendorQueryRs', ret: 'VendorRet', spec: VENDOR_QUERY },
  'vendor.add': { rq: 'VendorAddRq', wrapper: 'VendorAdd', rs: 'VendorAddRs', ret: 'VendorRet', spec: VENDOR_ADD },
  'vendor.mod': { rq: 'VendorModRq', wrapper: 'VendorMod', rs: 'VendorModRs', ret: 'VendorRet', spec: VENDOR_MOD },
  'item.query': { rq: 'ItemQueryRq', rs: 'ItemQueryRs', ret: 'ItemServiceRet', spec: ITEM_QUERY },
  'item.add': { rq: 'ItemServiceAddRq', wrapper: 'ItemServiceAdd', rs: 'ItemServiceAddRs', ret: 'ItemServiceRet', spec: ITEM_SERVICE_ADD },
  'account.query': { rq: 'AccountQueryRq', rs: 'AccountQueryRs', ret: 'AccountRet', spec: ACCOUNT_QUERY },
  'account.add': { rq: 'AccountAddRq', wrapper: 'AccountAdd', rs: 'AccountAddRs', ret: 'AccountRet', spec: ACCOUNT_ADD },
  'bill.query': { rq: 'BillQueryRq', rs: 'BillQueryRs', ret: 'BillRet', spec: BILL_QUERY },
  'bill.add': { rq: 'BillAddRq', wrapper: 'BillAdd', rs: 'BillAddRs', ret: 'BillRet', spec: BILL_ADD },
  'payment.query': { rq: 'ReceivePaymentQueryRq', rs: 'ReceivePaymentQueryRs', ret: 'ReceivePaymentRet', spec: PAYMENT_QUERY },
  'payment.add': { rq: 'ReceivePaymentAddRq', wrapper: 'ReceivePaymentAdd', rs: 'ReceivePaymentAddRs', ret: 'ReceivePaymentRet', spec: PAYMENT_ADD },
  'estimate.query': { rq: 'EstimateQueryRq', rs: 'EstimateQueryRs', ret: 'EstimateRet', spec: ESTIMATE_QUERY },
  'estimate.add': { rq: 'EstimateAddRq', wrapper: 'EstimateAdd', rs: 'EstimateAddRs', ret: 'EstimateRet', spec: ESTIMATE_ADD },
  'salesOrder.query': { rq: 'SalesOrderQueryRq', rs: 'SalesOrderQueryRs', ret: 'SalesOrderRet', spec: SALES_ORDER_QUERY },
  'salesOrder.add': { rq: 'SalesOrderAddRq', wrapper: 'SalesOrderAdd', rs: 'SalesOrderAddRs', ret: 'SalesOrderRet', spec: SALES_ORDER_ADD },
  'salesReceipt.query': { rq: 'SalesReceiptQueryRq', rs: 'SalesReceiptQueryRs', ret: 'SalesReceiptRet', spec: SALES_RECEIPT_QUERY },
  'salesReceipt.add': { rq: 'SalesReceiptAddRq', wrapper: 'SalesReceiptAdd', rs: 'SalesReceiptAddRs', ret: 'SalesReceiptRet', spec: SALES_RECEIPT_ADD },
  'creditMemo.query': { rq: 'CreditMemoQueryRq', rs: 'CreditMemoQueryRs', ret: 'CreditMemoRet', spec: CREDIT_MEMO_QUERY },
  'creditMemo.add': { rq: 'CreditMemoAddRq', wrapper: 'CreditMemoAdd', rs: 'CreditMemoAddRs', ret: 'CreditMemoRet', spec: CREDIT_MEMO_ADD },
  'purchaseOrder.query': { rq: 'PurchaseOrderQueryRq', rs: 'PurchaseOrderQueryRs', ret: 'PurchaseOrderRet', spec: PURCHASE_ORDER_QUERY },
  'purchaseOrder.add': { rq: 'PurchaseOrderAddRq', wrapper: 'PurchaseOrderAdd', rs: 'PurchaseOrderAddRs', ret: 'PurchaseOrderRet', spec: PURCHASE_ORDER_ADD },
  'class.query': { rq: 'ClassQueryRq', rs: 'ClassQueryRs', ret: 'ClassRet', spec: CLASS_QUERY },
  'class.add': { rq: 'ClassAddRq', wrapper: 'ClassAdd', rs: 'ClassAddRs', ret: 'ClassRet', spec: CLASS_ADD },
  'class.mod': { rq: 'ClassModRq', wrapper: 'ClassMod', rs: 'ClassModRs', ret: 'ClassRet', spec: CLASS_MOD },
  'employee.query': { rq: 'EmployeeQueryRq', rs: 'EmployeeQueryRs', ret: 'EmployeeRet', spec: EMPLOYEE_QUERY },
  'employee.add': { rq: 'EmployeeAddRq', wrapper: 'EmployeeAdd', rs: 'EmployeeAddRs', ret: 'EmployeeRet', spec: EMPLOYEE_ADD },
  'employee.mod': { rq: 'EmployeeModRq', wrapper: 'EmployeeMod', rs: 'EmployeeModRs', ret: 'EmployeeRet', spec: EMPLOYEE_MOD },
  'terms.query': { rq: 'TermsQueryRq', rs: 'TermsQueryRs', ret: 'StandardTermsRet', spec: TERMS_QUERY },
  'terms.add': { rq: 'StandardTermsAddRq', wrapper: 'StandardTermsAdd', rs: 'StandardTermsAddRs', ret: 'StandardTermsRet', spec: STANDARD_TERMS_ADD },
} as const satisfies Record<string, OpDef>;
export type OpName = keyof typeof OPS;
