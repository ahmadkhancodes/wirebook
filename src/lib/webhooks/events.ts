import { product } from "@/config/product";
import type { BridgeEvent, EndUser } from "@/lib/qbwc";
import { splitProjectId, usageSummary } from "@/lib/billing/metering";
import type { Db } from "@/lib/db/types";
import { emitEvent } from "./outbound";

/** The events a Wirebook endpoint can subscribe to. Payloads carry ids and statuses only, never QuickBooks data. */
export const WEBHOOK_EVENTS = [
  { type: "request.completed", description: "A request to a company file finished (succeeded or failed)." },
  { type: "company_file.connected", description: "A company file connected, or recovered after being Asleep or Broken." },
  { type: "company_file.broken", description: "A company file stopped being reachable (connection error or 72 hours without a poll)." },
  { type: "usage.threshold_reached", description: "Active files or the daily request cap reached 80% or 100% of the plan limit." },
] as const;
export const EVENT_TYPES: string[] = WEBHOOK_EVENTS.map((e) => e.type);

const fileRef = (u: EndUser) => ({ id: u.id, externalId: u.externalId ?? null, companyName: u.companyName ?? null });

/** Turn a bridge event into the payload we send. Exposed for tests and the docs. */
export function eventPayload(e: BridgeEvent): { orgId: string; environment: "test" | "production"; type: string; data: Record<string, unknown> } {
  const { orgId, environment } = splitProjectId(e.user.projectId);
  if (e.type === "request.completed") {
    const j = e.job;
    return {
      orgId, environment, type: e.type,
      data: {
        requestId: j.id, state: j.state, objectType: j.meta?.objectType ?? null, method: j.meta?.method ?? null, path: j.meta?.path ?? null,
        durationMs: j.durationMs ?? null, environment, companyFile: fileRef(e.user),
        error: j.error ? { code: j.error.code, message: j.error.message } : null,
        links: { self: `${product.url}/v1/requests/${j.id}` },
      },
    };
  }
  return {
    orgId, environment, type: e.type,
    data: { environment, companyFile: fileRef(e.user), status: e.type === "company_file.connected" ? "connected" : "broken", reason: e.reason ?? null, at: e.at.toISOString() },
  };
}

/** The `onEvent` hook for the bridge. Never throws into the SOAP reply. */
export function webhookSink(db: Db, fetchFn?: typeof fetch) {
  return async (e: BridgeEvent): Promise<void> => {
    try {
      const p = eventPayload(e);
      await emitEvent(p.orgId, p.type, p.data, { db, fetchFn, environment: p.environment, now: e.at });
    } catch {
      /* delivery problems are logged per delivery; they must never break the bridge */
    }
  };
}

/**
 * Fire `usage.threshold_reached` once per meter, threshold and period when used/limit first crosses 80% and 100%.
 * Dedupes with a counter in the usage collection (the first increment wins).
 */
export async function checkThreshold(db: Db, orgId: string, meter: "files" | "requests", period: string, used: number, limit: number, opts: { fetchFn?: typeof fetch; now?: Date } = {}): Promise<number[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  const fired: number[] = [];
  for (const pct of [80, 100]) {
    if (used * 100 < limit * pct) continue;
    if ((await db.incUsage(orgId, `threshold_${meter}_${pct}`, period, 1)) !== 1) continue;
    fired.push(pct);
    await emitEvent(orgId, "usage.threshold_reached", { meter, threshold: pct, used, limit, period }, { db, ...opts });
  }
  return fired;
}

/** After a production file became active: 80% / 100% of the plan's included files (Developer 3, Starter Pack 4, Volume 50). */
export async function checkFilesThreshold(db: Db, projectId: string, opts: { fetchFn?: typeof fetch; now?: Date } = {}): Promise<number[]> {
  const { orgId, environment } = splitProjectId(projectId);
  if (environment !== "production") return [];
  const now = opts.now ?? new Date();
  const s = await usageSummary(db, orgId, now);
  return checkThreshold(db, orgId, "files", s.period, s.files, s.included, { ...opts, now });
}
