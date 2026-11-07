import type { Collection, Document } from 'mongodb';
import { mongoClient } from '@/lib/db/mongo';
import { uuidv7 } from '@/lib/ids';
import type { EndUser, EndUserRepo, HealthEvent, HealthLog, Job, JobQueue, ListFilter, Session, SessionStore } from '@/lib/qbwc';
import { newRequestId, type Bridge, type ConnectLink, type ConnectLinkStore, type IdempotencyRecord, type IdempotencyStore } from './store';

/** Mongo drivers for the bridge. Collections: requests, endUsers, qbwcSessions, idempotencyKeys, connectLinks. Indexes: ensureBridgeIndexes. */
type Doc<T> = Omit<T, 'id'> & { _id: string };
type Cols = <T extends Document>(name: string) => Promise<Collection<T>>;

const isDup = (e: unknown) => (e as { code?: number })?.code === 11000;
const clean = <T extends object>(o: T): Partial<T> => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
const fromDoc = <T extends { id: string }>(d: Doc<T> | null): T | null => {
  if (!d) return null;
  const { _id, ...rest } = d;
  return { id: _id, ...rest } as unknown as T;
};

class MongoQueue implements JobQueue {
  constructor(private cols: Cols) {}
  private c() { return this.cols<Doc<Job>>('requests'); }
  async enqueue(j: Parameters<JobQueue['enqueue']>[0]) {
    const doc = { _id: j.id ?? newRequestId(), endUserId: j.endUserId, op: j.op, body: j.body, state: 'queued' as const, createdAt: new Date(), ...clean({ iterator: j.iterator, meta: j.meta }) } as Doc<Job>;
    await (await this.c()).insertOne(doc as never);
    return fromDoc<Job>(doc)!;
  }
  async claim(endUserId: string, now: Date) {
    const c = await this.c();
    if (await c.findOne({ endUserId, state: 'sent' }, { projection: { _id: 1 } })) return null;
    try {
      // unique partial index on (endUserId) where state = 'sent' makes a lost race throw E11000
      const d = await c.findOneAndUpdate({ endUserId, state: 'queued' }, { $set: { state: 'sent', sentAt: now } }, { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' });
      return fromDoc<Job>(d as Doc<Job> | null);
    } catch (e) {
      if (isDup(e)) return null;
      throw e;
    }
  }
  async inFlight(endUserId: string) { return fromDoc<Job>(await (await this.c()).findOne({ endUserId, state: 'sent' })); }
  async queuedCount(endUserId: string) { return (await this.c()).countDocuments({ endUserId, state: 'queued' }); }
  async complete(id: string, patch: Parameters<JobQueue['complete']>[1], now: Date) {
    const c = await this.c();
    const cur = await c.findOne({ _id: id });
    if (!cur) throw new Error(`unknown job ${id}`);
    const sentAt = (cur as Doc<Job>).sentAt;
    const set = clean({ ...patch, completedAt: now, durationMs: sentAt ? now.getTime() - sentAt.getTime() : undefined });
    const d = await c.findOneAndUpdate({ _id: id }, { $set: set as never }, { returnDocument: 'after' });
    return fromDoc<Job>(d as Doc<Job> | null)!;
  }
  async get(id: string) { return fromDoc<Job>(await (await this.c()).findOne({ _id: id })); }
  async list(f: ListFilter) {
    const q: Document = { 'meta.projectId': f.projectId };
    if (f.endUserId) q.endUserId = f.endUserId;
    if (f.state) q.state = f.state;
    if (f.objectType) q['meta.objectType'] = f.objectType;
    if (f.id) q._id = f.id;
    if (f.before) q.$or = [{ createdAt: { $lt: f.before.createdAt } }, { createdAt: f.before.createdAt, _id: { $lt: f.before.id } }];
    const docs = await (await this.c()).find(q).sort({ createdAt: -1, _id: -1 }).limit(f.limit).toArray();
    return docs.map((d) => fromDoc<Job>(d as Doc<Job>)!);
  }
  async purgePayloads(o: { before: Date; projectIds?: string[]; excludeProjectIds?: string[] }, now: Date) {
    const q: Document = { createdAt: { $lt: o.before }, purgedAt: { $exists: false }, state: { $nin: ['queued', 'sent'] } };
    const proj: Document = {};
    if (o.projectIds) proj.$in = o.projectIds;
    if (o.excludeProjectIds?.length) proj.$nin = o.excludeProjectIds;
    if (Object.keys(proj).length) q['meta.projectId'] = proj;
    const r = await (await this.c()).updateMany(q, { $set: { body: {}, purgedAt: now }, $unset: { result: '', rawResponse: '' } });
    return r.modifiedCount;
  }
  async deleteMetadata(o: { before: Date }) {
    const r = await (await this.c()).deleteMany({ createdAt: { $lt: o.before }, state: { $nin: ['queued', 'sent'] } });
    return r.deletedCount;
  }
  async listForUser(endUserId: string, limit: number) {
    const docs = await (await this.c()).find({ endUserId }).sort({ createdAt: -1, _id: -1 }).limit(limit).toArray();
    return docs.map((d) => fromDoc<Job>(d as Doc<Job>)!);
  }
  async expireSent(olderThanMs: number, now: Date) {
    const c = await this.c();
    const stale = await c.find({ state: 'sent', sentAt: { $lt: new Date(now.getTime() - olderThanMs) } }).toArray();
    const out: Job[] = [];
    for (const d of stale) {
      const r = await c.findOneAndUpdate({ _id: d._id, state: 'sent' }, { $set: { state: 'outcome_unknown', completedAt: now } }, { returnDocument: 'after' });
      if (r) out.push(fromDoc<Job>(r as Doc<Job>)!);
    }
    return out;
  }
}

class MongoUsers implements EndUserRepo {
  constructor(private cols: Cols) {}
  private c() { return this.cols<Doc<EndUser>>('endUsers'); }
  async findByUsername(qbwcUsername: string) { return fromDoc<EndUser>(await (await this.c()).findOne({ qbwcUsername })); }
  async get(id: string) { return fromDoc<EndUser>(await (await this.c()).findOne({ _id: id })); }
  async getByExternalId(projectId: string, externalId: string) { return fromDoc<EndUser>(await (await this.c()).findOne({ projectId, externalId })); }
  async list(o: { projectId?: string; limit: number }) {
    const docs = await (await this.c()).find(o.projectId ? { projectId: o.projectId } : {}).sort({ createdAt: -1, _id: -1 }).limit(o.limit).toArray();
    return docs.map((d) => fromDoc<EndUser>(d as Doc<EndUser>)!);
  }
  async update(id: string, patch: Partial<EndUser>) {
    const set: Document = {};
    const unset: Document = {};
    for (const [k, v] of Object.entries(patch)) (v === undefined ? unset : set)[k] = v === undefined ? '' : v;
    const upd: Document = {};
    if (Object.keys(set).length) upd.$set = set;
    if (Object.keys(unset).length) upd.$unset = unset;
    if (Object.keys(upd).length) await (await this.c()).updateOne({ _id: id }, upd);
  }
  async create(u: EndUser) {
    const { id, ...rest } = u;
    await (await this.c()).insertOne({ _id: id, ...rest } as never); // unique indexes reject duplicates
  }
}

class MongoHealth implements HealthLog {
  constructor(private cols: Cols) {}
  private c() { return this.cols<Doc<HealthEvent>>('healthEvents'); }
  async append(e: Omit<HealthEvent, 'id'>) { await (await this.c()).insertOne({ _id: `hev_${uuidv7().replace(/-/g, '')}`, ...e } as never); }
  async list(endUserId: string, limit: number) {
    const docs = await (await this.c()).find({ endUserId }).sort({ at: -1, _id: -1 }).limit(limit).toArray();
    return docs.map((d) => fromDoc<HealthEvent>(d as Doc<HealthEvent>)!);
  }
}

class MongoSessions implements SessionStore {
  constructor(private cols: Cols) {}
  private c() { return this.cols<{ _id: string } & Omit<Session, 'ticket'>>('qbwcSessions'); }
  async create(s: Session) { const { ticket, ...rest } = s; await (await this.c()).insertOne({ _id: ticket, ...rest }); }
  async get(ticket: string) {
    const d = await (await this.c()).findOne({ _id: ticket });
    if (!d || d.expiresAt <= new Date()) return null;
    const { _id, ...rest } = d;
    return { ticket: _id, ...rest };
  }
  async update(ticket: string, patch: Partial<Session>) { await (await this.c()).updateOne({ _id: ticket }, { $set: clean(patch) as never }); }
  async delete(ticket: string) { await (await this.c()).deleteOne({ _id: ticket }); }
}

class MongoIdempotency implements IdempotencyStore {
  constructor(private cols: Cols) {}
  private c() { return this.cols<{ _id: string } & IdempotencyRecord>('idempotencyKeys'); }
  async get(projectId: string, key: string, now: Date) {
    const d = await (await this.c()).findOne({ _id: `${projectId}:${key}` });
    if (!d || d.expiresAt <= now) return null;
    const { _id, ...rest } = d;
    return rest;
  }
  async put(rec: IdempotencyRecord) {
    const c = await this.c();
    const id = `${rec.projectId}:${rec.key}`;
    try {
      // an expired record that TTL has not removed yet is replaced
      await c.deleteOne({ _id: id, expiresAt: { $lte: rec.createdAt } });
      await c.insertOne({ _id: id, ...rec });
      return null;
    } catch (e) {
      if (!isDup(e)) throw e;
      const { _id, ...rest } = (await c.findOne({ _id: id }))!;
      return rest;
    }
  }
}

class MongoLinks implements ConnectLinkStore {
  constructor(private cols: Cols) {}
  private c() { return this.cols<Doc<ConnectLink>>('connectLinks'); }
  async create(l: ConnectLink) { const { id, ...rest } = l; await (await this.c()).insertOne({ _id: id, ...rest } as never); }
  async getByTokenHash(tokenHash: string) { return fromDoc<ConnectLink>(await (await this.c()).findOne({ tokenHash })); }
  async markUsed(id: string, at: Date) { await (await this.c()).updateOne({ _id: id, usedAt: { $exists: false } }, { $set: { usedAt: at } }); }
}

export function createMongoBridge(uri: string, dbName: string): Bridge {
  const cols: Cols = async <T extends Document>(name: string) => (await mongoClient(uri)).db(dbName).collection<T>(name) as unknown as Collection<T>;
  return { queue: new MongoQueue(cols), users: new MongoUsers(cols), sessions: new MongoSessions(cols), idempotency: new MongoIdempotency(cols), links: new MongoLinks(cols), health: new MongoHealth(cols) };
}

/** One-off index creation (scripts/ensure-indexes.ts). The unique partial index on requests is what keeps one job in flight per file. */
export async function ensureBridgeIndexes(uri: string, dbName: string): Promise<void> {
  const db = (await mongoClient(uri)).db(dbName);
  await db.collection('requests').createIndexes([
    { key: { endUserId: 1 }, unique: true, partialFilterExpression: { state: 'sent' }, name: 'one_sent_per_file' },
    { key: { endUserId: 1, state: 1, createdAt: 1 }, name: 'claim' },
    { key: { 'meta.projectId': 1, createdAt: -1, _id: -1 }, name: 'log' },
  ]);
  await db.collection('endUsers').createIndexes([
    { key: { qbwcUsername: 1 }, unique: true },
    { key: { ownerGuid: 1 }, unique: true },
    { key: { fileGuid: 1 }, unique: true },
    { key: { projectId: 1, externalId: 1 }, unique: true, partialFilterExpression: { externalId: { $type: 'string' } } },
  ]);
  await db.collection('healthEvents').createIndexes([{ key: { endUserId: 1, at: -1 }, name: 'by_file' }, { key: { at: 1 }, expireAfterSeconds: 90 * 24 * 3600, name: 'ttl_90d' }]);
  await db.collection('endUsers').createIndex({ projectId: 1, createdAt: -1 });
  await db.collection('requests').createIndex({ createdAt: 1 }, { name: 'purge' });
  await db.collection('qbwcSessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('idempotencyKeys').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await db.collection('connectLinks').createIndexes([{ key: { tokenHash: 1 }, unique: true }, { key: { expiresAt: 1 }, expireAfterSeconds: 7 * 24 * 3600 }]);
}
