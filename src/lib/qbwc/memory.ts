import { randomUUID } from 'node:crypto';
import type { EndUser, EndUserRepo, Job, JobQueue, ListFilter, Session, SessionStore } from './types';

/** In-memory drivers (DB_DRIVER=memory). Same contract the Mongo drivers must pass. */
export class MemoryQueue implements JobQueue {
  private jobs = new Map<string, Job>();
  private seq = 0;
  async enqueue(j: Parameters<JobQueue['enqueue']>[0]): Promise<Job> {
    const id = `req_${String(++this.seq).padStart(6, '0')}`;
    const job: Job = { id, endUserId: j.endUserId, op: j.op, body: j.body, state: 'queued', createdAt: new Date(), ...(j.iterator ? { iterator: j.iterator } : {}), ...(j.meta ? { meta: j.meta } : {}) };
    this.jobs.set(id, job);
    return { ...job };
  }
  private inFlightSync(endUserId: string): Job | null {
    for (const j of this.jobs.values()) if (j.endUserId === endUserId && j.state === 'sent') return { ...j };
    return null;
  }
  async inFlight(endUserId: string) { return this.inFlightSync(endUserId); }
  /** The check and the state change must not be separated by an await (atomic). The Mongo driver enforces the same with a unique partial index on (endUserId) where state = 'sent'. */
  async claim(endUserId: string, now: Date) {
    if (this.inFlightSync(endUserId)) return null;
    const next = [...this.jobs.values()].filter((j) => j.endUserId === endUserId && j.state === 'queued').sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!next) return null;
    next.state = 'sent';
    next.sentAt = now;
    return { ...next };
  }
  async queuedCount(endUserId: string) {
    return [...this.jobs.values()].filter((j) => j.endUserId === endUserId && j.state === 'queued').length;
  }
  async complete(id: string, patch: Parameters<JobQueue['complete']>[1], now: Date) {
    const j = this.jobs.get(id);
    if (!j) throw new Error(`unknown job ${id}`);
    Object.assign(j, patch, { completedAt: now, durationMs: j.sentAt ? now.getTime() - j.sentAt.getTime() : undefined });
    return { ...j };
  }
  async get(id: string) { const j = this.jobs.get(id); return j ? { ...j } : null; }
  async list(f: ListFilter) {
    return [...this.jobs.values()]
      .filter((j) => j.meta?.projectId === f.projectId)
      .filter((j) => !f.endUserId || j.endUserId === f.endUserId)
      .filter((j) => !f.state || j.state === f.state)
      .filter((j) => !f.objectType || j.meta?.objectType === f.objectType)
      .filter((j) => !f.id || j.id === f.id)
      .filter((j) => !f.before || j.id < f.before.id)
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, f.limit)
      .map((j) => ({ ...j }));
  }
  async expireSent(olderThanMs: number, now: Date) {
    const out: Job[] = [];
    for (const j of this.jobs.values()) {
      if (j.state === 'sent' && j.sentAt && now.getTime() - j.sentAt.getTime() > olderThanMs) {
        j.state = 'outcome_unknown'; j.completedAt = now; out.push({ ...j });
      }
    }
    return out;
  }
}

export class MemoryEndUsers implements EndUserRepo {
  private users = new Map<string, EndUser>();
  add(u: EndUser) { this.users.set(u.id, u); }
  async create(u: EndUser) {
    for (const x of this.users.values()) {
      if (x.id === u.id || x.qbwcUsername === u.qbwcUsername || x.ownerGuid === u.ownerGuid || x.fileGuid === u.fileGuid
        || (u.externalId !== undefined && x.projectId === u.projectId && x.externalId === u.externalId)) throw new Error('duplicate end user');
    }
    this.users.set(u.id, { ...u });
  }
  async getByExternalId(projectId: string, externalId: string) {
    for (const u of this.users.values()) if (u.projectId === projectId && u.externalId === externalId) return { ...u };
    return null;
  }
  async findByUsername(username: string) {
    for (const u of this.users.values()) if (u.qbwcUsername === username) return { ...u };
    return null;
  }
  async get(id: string) { const u = this.users.get(id); return u ? { ...u } : null; }
  async update(id: string, patch: Partial<EndUser>) {
    const u = this.users.get(id);
    if (u) Object.assign(u, patch);
  }
}

export class MemorySessions implements SessionStore {
  private s = new Map<string, Session>();
  async create(x: Session) { this.s.set(x.ticket, x); }
  async get(t: string) { const x = this.s.get(t); return x && x.expiresAt > new Date() ? { ...x } : null; }
  async update(t: string, p: Partial<Session>) { const x = this.s.get(t); if (x) Object.assign(x, p); }
  async delete(t: string) { this.s.delete(t); }
}

export const newTicket = () => randomUUID();
