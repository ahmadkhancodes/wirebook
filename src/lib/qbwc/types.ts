import type { OpName } from '../qbxml';
import type { QbError } from '../errors/qb-status';

export type RequestState = 'queued' | 'sent' | 'succeeded' | 'failed' | 'outcome_unknown';

export interface Job {
  id: string;
  endUserId: string;
  op: OpName;
  body: unknown;
  state: RequestState;
  createdAt: Date;
  sentAt?: Date;
  completedAt?: Date;
  qbStatusCode?: number;
  error?: QbError;
  result?: Record<string, unknown>[];
  durationMs?: number;
}

/** Per company file serial queue. Mongo implementation in M2; Valkey/BullMQ on the VPS later. */
export interface JobQueue {
  enqueue(job: { endUserId: string; op: OpName; body: unknown }): Promise<Job>;
  /** Atomically move the oldest queued job of this end user to sent. Returns null if none, or one is already in flight. */
  claim(endUserId: string, now: Date): Promise<Job | null>;
  inFlight(endUserId: string): Promise<Job | null>;
  queuedCount(endUserId: string): Promise<number>;
  complete(id: string, patch: Pick<Job, 'state'> & Partial<Pick<Job, 'qbStatusCode' | 'error' | 'result'>>, now: Date): Promise<Job>;
  get(id: string): Promise<Job | null>;
  /** sent for longer than olderThanMs -> outcome_unknown (reconciler). Returns changed jobs. */
  expireSent(olderThanMs: number, now: Date): Promise<Job[]>;
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
}

export interface EndUserRepo {
  findByUsername(username: string): Promise<EndUser | null>;
  get(id: string): Promise<EndUser | null>;
  update(id: string, patch: Partial<EndUser>): Promise<void>;
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
