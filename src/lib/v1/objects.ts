import type { OpName } from '@/lib/qbxml';

type Filter = (value: string) => Record<string, unknown>;

export interface ObjectDef {
  /** URL segment */
  name: string;
  query: OpName;
  add: OpName;
  mod?: OpName;
  /** field of a returned object that holds its id, and the query list that selects by id */
  idList: 'listIds' | 'txnIds';
  /** query string parameters accepted by the list endpoint, mapped to qbXML query fields */
  filters: Record<string, Filter>;
  /** extra fields set on every query */
  queryDefaults?: Record<string, unknown>;
}

const date = (key: string): Filter => (v) => ({ [key]: v });
const listFilters: Record<string, Filter> = {
  name: (v) => ({ nameFilter: { matchCriterion: 'StartsWith', name: v } }),
  active: (v) => ({ activeStatus: v === 'true' ? 'ActiveOnly' : v === 'false' ? 'InactiveOnly' : 'All' }),
  modifiedSince: date('fromModifiedDate'),
  modifiedUntil: date('toModifiedDate'),
};
const txnFilters = (entity: string): Record<string, Filter> => ({
  [entity]: (v) => ({ entityFilter: { fullName: v } }),
  refNumber: (v) => ({ refNumbers: [v] }),
  modifiedSince: (v) => ({ modifiedDateRangeFilter: { fromModifiedDate: v } }),
  includeLines: (v) => ({ includeLineItems: v === 'true' }),
});

export const OBJECTS: Record<string, ObjectDef> = {
  customers: { name: 'customers', query: 'customer.query', add: 'customer.add', mod: 'customer.mod', idList: 'listIds', filters: listFilters },
  vendors: { name: 'vendors', query: 'vendor.query', add: 'vendor.add', mod: 'vendor.mod', idList: 'listIds', filters: listFilters },
  items: { name: 'items', query: 'item.query', add: 'item.add', mod: 'item.mod', idList: 'listIds', filters: listFilters },
  accounts: { name: 'accounts', query: 'account.query', add: 'account.add', mod: 'account.mod', idList: 'listIds', filters: { ...listFilters, type: (v) => ({ accountType: v }) } },
  invoices: { name: 'invoices', query: 'invoice.query', add: 'invoice.add', mod: 'invoice.mod', idList: 'txnIds', filters: txnFilters('customer') },
  bills: { name: 'bills', query: 'bill.query', add: 'bill.add', mod: 'bill.mod', idList: 'txnIds', filters: txnFilters('vendor') },
  payments: { name: 'payments', query: 'payment.query', add: 'payment.add', idList: 'txnIds', filters: txnFilters('customer') },
  estimates: { name: 'estimates', query: 'estimate.query', add: 'estimate.add', mod: 'estimate.mod', idList: 'txnIds', filters: txnFilters('customer') },
  'sales-orders': { name: 'sales-orders', query: 'salesOrder.query', add: 'salesOrder.add', mod: 'salesOrder.mod', idList: 'txnIds', filters: txnFilters('customer') },
  'sales-receipts': { name: 'sales-receipts', query: 'salesReceipt.query', add: 'salesReceipt.add', mod: 'salesReceipt.mod', idList: 'txnIds', filters: txnFilters('customer') },
  'credit-memos': { name: 'credit-memos', query: 'creditMemo.query', add: 'creditMemo.add', mod: 'creditMemo.mod', idList: 'txnIds', filters: txnFilters('customer') },
  'purchase-orders': { name: 'purchase-orders', query: 'purchaseOrder.query', add: 'purchaseOrder.add', mod: 'purchaseOrder.mod', idList: 'txnIds', filters: txnFilters('vendor') },
  classes: { name: 'classes', query: 'class.query', add: 'class.add', mod: 'class.mod', idList: 'listIds', filters: listFilters },
  terms: { name: 'terms', query: 'terms.query', add: 'terms.add', mod: 'terms.mod', idList: 'listIds', filters: listFilters },
  employees: { name: 'employees', query: 'employee.query', add: 'employee.add', mod: 'employee.mod', idList: 'listIds', filters: listFilters },
};
