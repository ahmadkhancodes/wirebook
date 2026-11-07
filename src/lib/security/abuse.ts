import { product, type PlanId } from "@/config/product";
import { effectivePlan } from "@/lib/billing/entitlement";
import type { Db } from "@/lib/db/types";
import { apiError } from "@/lib/v1/errors";
import { checkThreshold } from "@/lib/webhooks/events";
import { rateLimit } from "./ratelimit";

/**
 * Abuse controls for the public API: per source address and per key rate limits, a daily request cap per plan
 * (product.abuse.dailyRequests) and admin suspension of an organization or a key. Every refusal is a 429 or 403
 * with the unified error object and a Retry-After header where waiting helps.
 */

export const dailyCapFor = (plan: PlanId): number => product.abuse.dailyRequests[plan];
export const dayOf = (now: Date) => now.toISOString().slice(0, 10);
const secondsToMidnightUtc = (now: Date) => Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000));

const limited = (scope: string, limit: number, windowMs: number) => {
  const s = Math.ceil(windowMs / 1000);
  return apiError(
    "rate_limited",
    { headers: { "retry-after": String(s), "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(s) } },
    { message: `Rate limit of ${limit} requests per minute ${scope} exceeded. Retry after ${s} seconds.` },
  );
};

/** Per source address, before the key is even looked at (so a flood of bad keys is cut off cheaply). */
export async function enforceIpLimit(db: Db, ip: string, now = Date.now()) {
  const rule = { limit: product.abuse.ipPerMinute, windowMs: 60_000 };
  if (!(await rateLimit(`ip:${ip}`, rule, db, now)).ok) throw limited("per IP address", rule.limit, rule.windowMs);
}

/** After a bad key: 10 per minute per address, then 429 for the rest of the minute. */
export async function enforceBadKeyLimit(db: Db, ip: string, now = Date.now()) {
  const rule = { limit: product.abuse.badKeysPerMinute, windowMs: 60_000 };
  if (!(await rateLimit(`badkey:${ip}`, rule, db, now)).ok) throw limited("of invalid API keys from one address", rule.limit, rule.windowMs);
}

export interface GuardInput { orgId: string; keyId: string; now?: Date; fetchFn?: typeof fetch }

/** For an authenticated key: suspension, per key rate limit, then the daily cap. Returns the cap state for headers and tests. */
export async function guardKey(db: Db, g: GuardInput): Promise<{ used: number; cap: number }> {
  const now = g.now ?? new Date();
  const settings = await db.getOrgSettings(g.orgId);
  if (settings.suspended) throw apiError("org_suspended");
  if (settings.suspendedKeys?.includes(g.keyId)) throw apiError("key_suspended");

  const rule = { limit: product.abuse.keyPerMinute, windowMs: 60_000 };
  if (!(await rateLimit(`api:${g.keyId}`, rule, db, now.getTime())).ok) throw limited("per API key", rule.limit, rule.windowMs);

  const plan = effectivePlan(await db.getEntitlement(g.orgId), now.getTime());
  const cap = dailyCapFor(plan.id);
  const day = dayOf(now);
  const used = await db.incUsage(g.orgId, "requests", day);
  if (used > cap) {
    throw apiError("daily_cap_reached", { headers: { "retry-after": String(secondsToMidnightUtc(now)), "x-ratelimit-limit": String(cap), "x-ratelimit-remaining": "0" } }, { message: `This organization used its ${cap.toLocaleString("en-US")} requests for today (${day} UTC). It resets at 00:00 UTC.` });
  }
  await checkThreshold(db, g.orgId, "requests", day, used, cap, { now, fetchFn: g.fetchFn }).catch(() => undefined);
  return { used, cap };
}

/** Admin actions. Each one is audited by the caller with the actor id. */
export async function setOrgSuspended(db: Db, orgId: string, suspended: boolean, reason?: string) {
  return db.setOrgSettings(orgId, { suspended, suspendedReason: suspended ? reason ?? "" : "" });
}
export async function setKeySuspended(db: Db, orgId: string, keyId: string, suspended: boolean) {
  const cur = (await db.getOrgSettings(orgId)).suspendedKeys ?? [];
  const next = suspended ? [...new Set([...cur, keyId])] : cur.filter((k) => k !== keyId);
  return db.setOrgSettings(orgId, { suspendedKeys: next });
}
