/** QuickBooks rows are open: these interfaces name the fields every row has and let the rest through. */
export interface QbRecord {
  /** id of list objects */
  listId?: string;
  /** id of transactions */
  txnId?: string;
  /** QuickBooks EditSequence; send it back on update */
  revisionNumber?: string;
  [field: string]: unknown;
}

export * from './models.js';

/** Request bodies are camelCase qbXML fields; unknown fields are rejected by the API with the path of the problem. */
export type Input = Record<string, unknown>;

export interface Page<T> {
  data: T[];
  hasMore: boolean;
  nextCursor: string | null;
  cursorExpiresAt: string | null;
  /** The next page, or null on the last one. */
  next(): Promise<Page<T> | null>;
}

/** A 202: QuickBooks has not answered yet. Poll with `wb.requests.wait(id)`. */
export interface Queued {
  state: 'queued';
  id: string;
}
export const isQueued = (x: unknown): x is Queued => typeof x === 'object' && x !== null && (x as Queued).state === 'queued' && typeof (x as Queued).id === 'string' && Object.keys(x).length === 2;

export type RequestState = 'queued' | 'in_flight' | 'succeeded' | 'failed' | 'outcome_unknown';
export interface RequestStatus {
  id: string;
  object: 'request';
  state: RequestState;
  objectType?: string;
  method?: string;
  path?: string;
  createdAt?: string;
  completedAt?: string | null;
  durationMs?: number | null;
  data?: QbRecord[];
  error?: ErrorBodyInner;
}
export interface ErrorBodyInner { code: string; type: string; message: string; userFacingMessage?: string; guideUrl?: string; retryable?: boolean; path?: string; requestId?: string }

export interface ConnectLink {
  id: string;
  object: 'connect_link';
  url: string;
  expiresAt: string;
  endUserId: string;
  externalId: string;
}

export interface RawResult { requestId: string; state: string; raw: string; parsed: unknown }
