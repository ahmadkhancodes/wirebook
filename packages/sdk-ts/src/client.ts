import { ConnectionError, errorFrom, WirebookError, type ErrorBody } from './errors.js';
import type {
  Account, AccountCreate, AccountUpdate, Bill, BillCreate, BillUpdate, ConnectLink, CreditMemo, CreditMemoCreate, CreditMemoUpdate,
  Customer, CustomerCreate, CustomerUpdate, Employee, EmployeeCreate, EmployeeUpdate, Estimate, EstimateCreate, EstimateUpdate, Input,
  Invoice, InvoiceCreate, InvoiceUpdate, Item, ItemCreate, ItemUpdate, Page, Payment, PaymentCreate, PurchaseOrder, PurchaseOrderCreate,
  PurchaseOrderUpdate, QbClass, QbClassCreate, QbClassUpdate, QbRecord, Queued, RawResult, RequestStatus, SalesOrder, SalesOrderCreate,
  SalesOrderUpdate, SalesReceipt, SalesReceiptCreate, SalesReceiptUpdate, Term, TermCreate, TermUpdate, Vendor, VendorCreate, VendorUpdate,
} from './types.js';

export const DEFAULT_BASE_URL = 'https://wirebook.buffersoltech.com';
export const VERSION = '0.1.0';

export interface WirebookOptions {
  apiKey: string;
  baseUrl?: string;
  /** Retries after the first attempt, for network errors, 429, 5xx and retryable errors. Default 2. */
  maxRetries?: number;
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch;
  /** Per attempt timeout in ms. Default 70000. */
  timeoutMs?: number;
  /** Default X-End-User-Id; see `forUser`. */
  endUser?: string;
  /** Injectable delay, used by retries and `requests.wait`. */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestOptions {
  /** X-End-User-Id for this call, overriding the client default. */
  endUser?: string;
  /** Override the generated Idempotency-Key (writes). */
  idempotencyKey?: string;
  /** Send `Prefer: respond-async`: get a Queued marker immediately instead of waiting for QuickBooks. */
  async?: boolean;
  maxRetries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export type ListParams = { limit?: number; cursor?: string } & Record<string, string | number | boolean | undefined>;

interface Sent { status: number; body: unknown; headers: Headers }
interface SendInit extends RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  rawBody?: string;
  contentType?: string;
  write?: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n) && n >= 0) return n;
  const t = Date.parse(h);
  return Number.isNaN(t) ? undefined : Math.max(0, (t - Date.now()) / 1000);
}

/** Internal transport shared by every resource. */
export class Transport {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly endUser: string | undefined;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(o: WirebookOptions) {
    if (!o.apiKey) throw new WirebookError({ message: 'apiKey is required', code: 'missing_api_key' });
    this.apiKey = o.apiKey;
    this.baseUrl = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.maxRetries = o.maxRetries ?? 2;
    this.timeoutMs = o.timeoutMs ?? 70_000;
    this.sleep = o.sleep ?? defaultSleep;
    this.endUser = o.endUser;
    this.fetchImpl = o.fetch;
  }

  private backoff(attempt: number): number {
    const cap = Math.min(8000, 500 * 2 ** attempt);
    return cap * (0.5 + Math.random() * 0.5);
  }

  async send(method: string, path: string, init: SendInit = {}): Promise<Sent> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: 'application/json',
      'user-agent': `wirebook-sdk-ts/${VERSION}`,
      ...(init.headers ?? {}),
    };
    const endUser = init.endUser ?? this.endUser;
    if (endUser) headers['x-end-user-id'] = endUser;
    let payload: string | undefined;
    if (init.rawBody !== undefined) { payload = init.rawBody; headers['content-type'] = init.contentType ?? 'application/json'; }
    else if (init.body !== undefined) { payload = JSON.stringify(init.body); headers['content-type'] = 'application/json'; }
    // one key for every attempt, so a retry after a lost response replays instead of repeating
    if (init.write) headers['idempotency-key'] = init.idempotencyKey ?? crypto.randomUUID();
    if (init.async) headers.prefer = 'respond-async';

    const maxRetries = init.maxRetries ?? this.maxRetries;
    const doFetch = this.fetchImpl ?? globalThis.fetch.bind(globalThis);
    for (let attempt = 0; ; attempt++) {
      let res: Response | undefined;
      let netErr: unknown;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
      const onAbort = () => ctl.abort();
      init.signal?.addEventListener('abort', onAbort);
      try {
        res = await doFetch(url.toString(), { method, headers, ...(payload !== undefined ? { body: payload } : {}), signal: ctl.signal });
      } catch (e) {
        netErr = e;
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', onAbort);
      }

      if (!res) {
        if (init.signal?.aborted) throw new ConnectionError({ message: 'The request was aborted', code: 'aborted' });
        if (attempt < maxRetries) { await this.sleep(this.backoff(attempt)); continue; }
        throw new ConnectionError({ message: `Could not reach Wirebook: ${(netErr as Error)?.message ?? 'network error'}`, code: 'network_error', retryable: true });
      }

      const text = await res.text();
      let body: unknown = null;
      if (text) { try { body = JSON.parse(text); } catch { /* not JSON, e.g. a gateway page */ } }
      if (res.status >= 200 && res.status < 300) return { status: res.status, body, headers: res.headers };

      const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
      const err = errorFrom(res.status, body as ErrorBody | null, retryAfter, text && body === null ? text.slice(0, 200) : undefined);
      const requestId = err.requestId ?? res.headers.get('x-request-id') ?? undefined;
      const final = requestId && !err.requestId ? Object.assign(err, { requestId }) : err;
      const retryable = res.status === 429 || res.status >= 500 || (body as ErrorBody | null)?.error?.retryable === true;
      if (retryable && attempt < maxRetries) {
        await this.sleep(retryAfter !== undefined ? retryAfter * 1000 : this.backoff(attempt));
        continue;
      }
      throw final;
    }
  }
}

const queuedOf = (b: unknown): Queued => ({ state: 'queued', id: (b as { id: string }).id });

/** T is the row, C the create body and U the update body (`never` where the API has no update). */
export class Resource<T extends QbRecord = QbRecord, C = Input, U = Input & { revisionNumber: string }> {
  constructor(private readonly t: Transport, readonly segment: string) {}
  private get base() { return `/v1/qbd/${this.segment}`; }

  /** One page. Throws WirebookError(code 'request_pending') if QuickBooks did not answer within the server wait window. */
  async list(params: ListParams = {}, opts: RequestOptions = {}): Promise<Page<T>> {
    const r = await this.t.send('GET', this.base, { ...opts, query: params });
    if (r.status === 202) throw new WirebookError({ message: 'QuickBooks has not answered yet; retry the list call', code: 'request_pending', status: 202, requestId: (r.body as { id?: string })?.id, retryable: true });
    return this.page(r.body as Omit<Page<T>, 'next'>, params, opts);
  }

  private page(b: Omit<Page<T>, 'next'>, params: ListParams, opts: RequestOptions): Page<T> {
    return {
      data: b.data, hasMore: b.hasMore, nextCursor: b.nextCursor, cursorExpiresAt: b.cursorExpiresAt,
      next: async () => (b.hasMore && b.nextCursor ? this.list({ ...params, cursor: b.nextCursor }, opts) : null),
    };
  }

  /** Every row, following nextCursor. Cursors last 10 minutes, so page through promptly. */
  async *iterate(params: ListParams = {}, opts: RequestOptions = {}): AsyncGenerator<T, void, undefined> {
    let page: Page<T> | null = await this.list(params, opts);
    while (page) {
      yield* page.data;
      page = await page.next();
    }
  }

  async listAll(params: ListParams = {}, opts: RequestOptions = {}): Promise<T[]> {
    const out: T[] = [];
    for await (const row of this.iterate(params, opts)) out.push(row);
    return out;
  }

  /** Creates a record. An Idempotency-Key is added for you and reused across retries. Returns Queued on a 202. */
  async create(body: C, opts: RequestOptions = {}): Promise<T | Queued> {
    const r = await this.t.send('POST', this.base, { ...opts, body, write: true });
    return r.status === 202 ? queuedOf(r.body) : (r.body as T);
  }

  /** Retrieves by id. If QuickBooks is slow this waits for the queued request. */
  async get(id: string, opts: RequestOptions = {}): Promise<T> {
    const r = await this.t.send('GET', `${this.base}/${encodeURIComponent(id)}`, opts);
    if (r.status !== 202) return r.body as T;
    const done = await new Requests(this.t).wait((r.body as { id: string }).id);
    const row = done.data?.[0];
    if (!row) throw errorFrom(404, { error: { code: 'not_found', type: 'not_found', message: 'No such object.' } });
    return row as T;
  }

  /** Updates a record; the body must carry the revisionNumber you read. Returns Queued on a 202. */
  async update(id: string, body: U, opts: RequestOptions = {}): Promise<T | Queued> {
    const r = await this.t.send('POST', `${this.base}/${encodeURIComponent(id)}`, { ...opts, body, write: true });
    return r.status === 202 ? queuedOf(r.body) : (r.body as T);
  }
}

export interface WaitOptions { timeoutMs?: number; intervalMs?: number; endUser?: string }

export class Requests {
  constructor(private readonly t: Transport) {}

  get(id: string, opts: RequestOptions = {}): Promise<RequestStatus> {
    return this.t.send('GET', `/v1/requests/${encodeURIComponent(id)}`, opts).then((r) => r.body as RequestStatus);
  }

  /** Polls until the request succeeded (returns its status with `data`). A failed request throws the typed error. */
  async wait(idOrQueued: string | Queued, o: WaitOptions = {}): Promise<RequestStatus> {
    const id = typeof idOrQueued === 'string' ? idOrQueued : idOrQueued.id;
    const timeoutMs = o.timeoutMs ?? 60_000;
    const interval = o.intervalMs ?? 1000;
    let waited = 0;
    for (;;) {
      const s = await this.get(id);
      if (s.state === 'succeeded') return s;
      if (s.state === 'failed' || s.state === 'outcome_unknown') {
        throw errorFrom(undefined, { error: s.error ?? { code: 'outcome_unknown', type: 'connection', message: 'The outcome is unknown.' } }, undefined, `Request ${id} ${s.state}`);
      }
      if (waited >= timeoutMs) throw new WirebookError({ message: `Request ${id} did not finish within ${timeoutMs} ms`, code: 'wait_timeout', requestId: id, retryable: true });
      const step = Math.min(interval, timeoutMs - waited);
      await this.t.sleep(step);
      waited += step;
    }
  }
}

export class ConnectLinks {
  constructor(private readonly t: Transport) {}
  create(input: { externalId: string; companyName?: string }, opts: RequestOptions = {}): Promise<ConnectLink> {
    return this.t.send('POST', '/v1/connect-links', { ...opts, body: input }).then((r) => r.body as ConnectLink);
  }
}

export class Qbd {
  readonly customers: Resource<Customer, CustomerCreate, CustomerUpdate>;
  readonly vendors: Resource<Vendor, VendorCreate, VendorUpdate>;
  readonly items: Resource<Item, ItemCreate, ItemUpdate>;
  readonly accounts: Resource<Account, AccountCreate, AccountUpdate>;
  readonly invoices: Resource<Invoice, InvoiceCreate, InvoiceUpdate>;
  readonly bills: Resource<Bill, BillCreate, BillUpdate>;
  readonly payments: Resource<Payment, PaymentCreate, never>;
  readonly estimates: Resource<Estimate, EstimateCreate, EstimateUpdate>;
  readonly salesOrders: Resource<SalesOrder, SalesOrderCreate, SalesOrderUpdate>;
  readonly salesReceipts: Resource<SalesReceipt, SalesReceiptCreate, SalesReceiptUpdate>;
  readonly creditMemos: Resource<CreditMemo, CreditMemoCreate, CreditMemoUpdate>;
  readonly purchaseOrders: Resource<PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate>;
  readonly classes: Resource<QbClass, QbClassCreate, QbClassUpdate>;
  readonly terms: Resource<Term, TermCreate, TermUpdate>;
  readonly employees: Resource<Employee, EmployeeCreate, EmployeeUpdate>;

  constructor(private readonly t: Transport) {
    this.customers = new Resource(t, 'customers');
    this.vendors = new Resource(t, 'vendors');
    this.items = new Resource(t, 'items');
    this.accounts = new Resource(t, 'accounts');
    this.invoices = new Resource(t, 'invoices');
    this.bills = new Resource(t, 'bills');
    this.payments = new Resource(t, 'payments');
    this.estimates = new Resource(t, 'estimates');
    this.salesOrders = new Resource(t, 'sales-orders');
    this.salesReceipts = new Resource(t, 'sales-receipts');
    this.creditMemos = new Resource(t, 'credit-memos');
    this.purchaseOrders = new Resource(t, 'purchase-orders');
    this.classes = new Resource(t, 'classes');
    this.terms = new Resource(t, 'terms');
    this.employees = new Resource(t, 'employees');
  }

  /** Sends one raw qbXML request. Returns Queued on a 202. */
  async raw(qbxml: string, opts: RequestOptions = {}): Promise<RawResult | Queued> {
    const r = await this.t.send('POST', '/v1/qbd/raw', { ...opts, body: { qbxml }, write: true });
    return r.status === 202 ? queuedOf(r.body) : (r.body as RawResult);
  }
}

export class Wirebook {
  readonly qbd: Qbd;
  readonly connectLinks: ConnectLinks;
  readonly requests: Requests;
  private readonly options: WirebookOptions;

  constructor(options: WirebookOptions) {
    this.options = options;
    const t = new Transport(options);
    this.qbd = new Qbd(t);
    this.connectLinks = new ConnectLinks(t);
    this.requests = new Requests(t);
  }

  /** A client whose calls all carry X-End-User-Id: endUserId. */
  forUser(endUserId: string): Wirebook {
    return new Wirebook({ ...this.options, endUser: endUserId });
  }
}
