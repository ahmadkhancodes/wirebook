import { MemoryEndUsers, MemoryQueue, MemorySessions, type EndUserRepo, type JobQueue, type SessionStore } from '@/lib/qbwc';

export interface IdempotencyRecord {
  projectId: string;
  key: string;
  bodyHash: string;
  requestId: string;
  createdAt: Date;
  /** 7 days after creation; a Date so the Mongo TTL index works */
  expiresAt: Date;
}
export const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface IdempotencyStore {
  get(projectId: string, key: string, now: Date): Promise<IdempotencyRecord | null>;
  /** Atomic insert. Returns the existing record if the key is already taken, else null. */
  put(rec: IdempotencyRecord): Promise<IdempotencyRecord | null>;
}

export interface ConnectLink {
  id: string;
  /** sha256 of the token; the token itself is shown once, inside the URL */
  tokenHash: string;
  projectId: string;
  endUserId: string;
  createdAt: Date;
  expiresAt: Date;
  /** set when the first sync is observed: the link is single use */
  usedAt?: Date;
}
export const CONNECT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

export interface ConnectLinkStore {
  create(l: ConnectLink): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<ConnectLink | null>;
  markUsed(id: string, at: Date): Promise<void>;
}

/** Everything the bridge and the REST layer persist. Memory driver here, Mongo driver in ./mongo. */
export interface Bridge {
  queue: JobQueue;
  users: EndUserRepo;
  sessions: SessionStore;
  idempotency: IdempotencyStore;
  links: ConnectLinkStore;
}

export class MemoryIdempotency implements IdempotencyStore {
  private m = new Map<string, IdempotencyRecord>();
  async get(projectId: string, key: string, now: Date) {
    const r = this.m.get(`${projectId}\u0000${key}`);
    return r && r.expiresAt > now ? { ...r } : null;
  }
  async put(rec: IdempotencyRecord) {
    const id = `${rec.projectId}\u0000${rec.key}`;
    const cur = this.m.get(id);
    if (cur && cur.expiresAt > rec.createdAt) return { ...cur };
    this.m.set(id, { ...rec });
    return null;
  }
}

export class MemoryLinks implements ConnectLinkStore {
  private m = new Map<string, ConnectLink>();
  async create(l: ConnectLink) { this.m.set(l.id, { ...l }); }
  async getByTokenHash(h: string) {
    for (const l of this.m.values()) if (l.tokenHash === h) return { ...l };
    return null;
  }
  async markUsed(id: string, at: Date) { const l = this.m.get(id); if (l && !l.usedAt) l.usedAt = at; }
}

export function createMemoryBridge(): Bridge {
  return { queue: new MemoryQueue(), users: new MemoryEndUsers(), sessions: new MemorySessions(), idempotency: new MemoryIdempotency(), links: new MemoryLinks() };
}
