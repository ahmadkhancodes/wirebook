import type { OpName } from '../qbxml';
import type { QbError } from '../errors/qb-status';

export type RequestState = 'queued' | 'sent' | 'succeeded' | 'failed' | 'outcome_unknown';

/** `raw` carries `{ qbxml }` and is forwarded as is (POST /v1/qbd/raw). */
export type JobOp = OpName | 'raw';

export interface JobMeta {
  projectId: string;
  method: string;
  path: string;
  objectType: string;
  idempotencyKey?: string;
}

export interface JobIterator { mode: 'Start' | 'Continue'; id?: string }

export interface ListFilter {
  projectId: string;
  endUserId?: string;
  state?: RequestState;
  objectType?: string;
  /** exact request id */
  id?: string;
  /** keyset: only rows strictly older than this (createdAt, id) */
  before?: { createdAt: Date; id: string };
  limit: number;
}

export interface Job {
  id: string;
  endUserId: string;
  op: JobOp;
  body: unknown;
  iterator?: JobIterator;
  meta?: JobMeta;
  state: RequestState;
  createdAt: Date;
  sentAt?: Date;
  completedAt?: Date;
  qbStatusCode?: number;
  error?: QbError;
  result?: Record<string, unknown>[];
  /** iterator id and remaining count from the response, for cursor pagination */
  iteratorResult?: { id?: string; remaining: number };
  /** set when the retention job removed body, result and rawResponse */
  purgedAt?: Date;
  /** raw qbXML response, kept only for raw passthrough jobs (the caller gets it back) */
  rawResponse?: string;
  durationMs?: number;
}

/** Per company file serial queue. Mongo implementation in M2; Valkey/BullMQ on the VPS later. */
export interface JobQueue {
  /** `id` lets a caller reserve the request id first (idempotency); enqueueing an id that exists throws. */
  enqueue(job: { id?: string; endUserId: string; op: JobOp; body: unknown; iterator?: JobIterator; meta?: JobMeta }): Promise<Job>;
  /** Atomically move the oldest queued job of this end user to sent. Returns null if none, or one is already in flight. */
  claim(endUserId: string, now: Date): Promise<Job | null>;
  inFlight(endUserId: string): Promise<Job | null>;
  queuedCount(endUserId: string): Promise<number>;
  complete(id: string, patch: Pick<Job, 'state'> & Partial<Pick<Job, 'qbStatusCode' | 'error' | 'result' | 'iteratorResult' | 'rawResponse'>>, now: Date): Promise<Job>;
  get(id: string): Promise<Job | null>;
  /** request log: newest first, tenant scoped by projectId */
  list(filter: ListFilter): Promise<Job[]>;
  /** sent for longer than olderThanMs -> outcome_unknown (reconciler). Returns changed jobs. */
  expireSent(olderThanMs: number, now: Date): Promise<Job[]>;
  /** Retention: drop request bodies, parsed results and raw responses of jobs created before `before`. Metadata stays. Returns the number purged. */
  purgePayloads(o: { before: Date; projectIds?: string[]; excludeProjectIds?: string[] }, now: Date): Promise<number>;
  /** Retention: delete finished request rows (the metadata) created before `before`. Queued and in flight work is never deleted. Returns the number deleted. */
  deleteMetadata(o: { before: Date }): Promise<number>;
  /** Jobs of one end user, newest first (used by the health detail page). */
  listForUser(endUserId: string, limit: number): Promise<Job[]>;
}

export interface EndUser {
  id: string;
  projectId: string;
  qbwcUsername: string;
  qbwcPasswordHash: string;
  ownerGuid: string;
  fileGuid: string;
  status: 'pending' | 'connected' | 'asleep' | 'broken';
  lastPollAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string;
  qbVersion?: string;
  qbxmlVersion?: string;
  failedAuth: { count: number; windowStart: Date };
  externalId?: string;
  companyName?: string;
  createdAt?: Date;
  /** Connect flow: what the server has actually observed, one timestamp per step. */
  qwcDownloadedAt?: Date;
  firstAuthAt?: Date;
  firstSessionAt?: Date;
  firstSyncAt?: Date;
  /** Set when the Broken email for the current incident went out; cleared on recovery (one email per incident). */
  brokenNotifiedAt?: Date;
  /** Full path of the company file the Web Connector last opened (sendRequestXML strCompanyFileName). */
  companyFile?: string;
  /** True when that file is a QuickBooks sample company file (free, never billed). Unknown until the first sendRequestXML. */
  sampleFile?: boolean;
  /** Set when the owner revoked this company file: the Web Connector login stops working and queued work was failed. */
  revokedAt?: Date;
}

export type HealthStatus = EndUser['status'];
export interface HealthEvent {
  id: string;
  endUserId: string;
  projectId: string;
  at: Date;
  status: HealthStatus;
  reason: string;
}
export interface HealthLog {
  append(e: Omit<HealthEvent, 'id'>): Promise<void>;
  /** newest first */
  list(endUserId: string, limit: number): Promise<HealthEvent[]>;
}

export interface EndUserRepo {
  findByUsername(username: string): Promise<EndUser | null>;
  get(id: string): Promise<EndUser | null>;
  update(id: string, patch: Partial<EndUser>): Promise<void>;
  /** Throws if the username, ownerGuid, fileGuid or (projectId, externalId) is already taken. */
  create(u: EndUser): Promise<void>;
  getByExternalId(projectId: string, externalId: string): Promise<EndUser | null>;
  /** Newest first. Without projectId: every end user (health tick). */
  list(o: { projectId?: string; limit: number }): Promise<EndUser[]>;
}

export interface Session {
  ticket: string;
  endUserId: string;
  qbxmlVersion: string;
  lastError?: string;
  expiresAt: Date;
}
export interface SessionStore {
  create(s: Session): Promise<void>;
  get(ticket: string): Promise<Session | null>;
  update(ticket: string, patch: Partial<Session>): Promise<void>;
  delete(ticket: string): Promise<void>;
}
