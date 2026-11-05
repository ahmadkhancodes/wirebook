import type { Bridge } from "@/lib/bridge";
import { evaluate } from "./evaluate";
import { splitProjectId } from "@/lib/billing/metering";
import { brokenConnectionEmail } from "@/lib/mail/templates";

export interface HealthDeps {
  bridge: Bridge;
  /** the owner's address, or null when unknown (no email is sent, the incident is still recorded) */
  ownerEmail(orgId: string): Promise<string | null>;
  send(msg: { to: string; subject: string; text: string; html?: string; category?: "notification" }): Promise<unknown>;
  now?: () => Date;
  baseUrl: string;
  limit?: number;
}

export interface HealthResult { checked: number; asleep: number; broken: number; emailed: number }

/** The `health-tick` cron job. Idempotent: running it twice in a row changes nothing the second time. */
export async function healthTick(d: HealthDeps): Promise<HealthResult> {
  const now = (d.now ?? (() => new Date()))();
  const users = await d.bridge.users.list({ limit: d.limit ?? 5000 });
  const r: HealthResult = { checked: users.length, asleep: 0, broken: 0, emailed: 0 };
  for (const u of users) {
    let cur = u;
    const t = evaluate(u, now);
    if (t) {
      await d.bridge.users.update(u.id, { status: t.status, ...(t.status === "broken" ? { lastError: t.reason } : {}) });
      await d.bridge.health.append({ endUserId: u.id, projectId: u.projectId, at: now, status: t.status, reason: t.reason });
      cur = { ...u, status: t.status };
      if (t.status === "asleep") r.asleep++;
    }
    // One email per incident: brokenNotifiedAt stays set until the file recovers (the bridge clears it).
    if (cur.status === "broken" && !cur.brokenNotifiedAt && splitProjectId(cur.projectId).environment === "production") {
      r.broken++;
      const { orgId } = splitProjectId(cur.projectId);
      const to = await d.ownerEmail(orgId);
      if (to) {
        const mail = brokenConnectionEmail({ company: cur.companyName ?? cur.externalId ?? cur.id, reason: cur.lastError ?? "unknown", url: `${d.baseUrl}/app/end-users/${cur.id}` });
        await d.send({ to, ...mail, category: "notification" });
        r.emailed++;
      }
      await d.bridge.users.update(cur.id, { brokenNotifiedAt: now });
    }
  }
  return r;
}

/** Owner of an org: Mongo `member`/`user` collections in production, the in-memory auth store in stub mode. */
export async function ownerEmailFor(orgId: string): Promise<string | null> {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { mongoClient } = await import("@/lib/db/mongo");
    const db = (await mongoClient(uri)).db(process.env.MONGODB_DB ?? "wirebook");
    const owner = await db.collection("member").findOne({ organizationId: orgId, role: /owner/ });
    if (!owner) return null;
    const { ObjectId } = await import("mongodb");
    const id = String(owner.userId);
    const user = (await db.collection("user").findOne({ id })) ?? (ObjectId.isValid(id) ? await db.collection("user").findOne({ _id: new ObjectId(id) }) : null);
    return typeof user?.email === "string" ? user.email : null;
  }
  const mem = globalThis.__kitAuthMemory as Record<string, { id?: string; userId?: string; organizationId?: string; role?: string; email?: string }[]> | undefined;
  const owner = mem?.member?.find((m) => m.organizationId === orgId && m.role?.includes("owner"));
  return mem?.user?.find((u) => u.id === owner?.userId)?.email ?? null;
}

export { evaluate, type Transition } from "./evaluate";
