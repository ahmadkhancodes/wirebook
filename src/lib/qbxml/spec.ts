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
} as const satisfies Record<string, OpDef>;
export type OpName = keyof typeof OPS;
