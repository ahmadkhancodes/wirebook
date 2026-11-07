import type Stripe from "stripe";
import { planForLookupKey, product, type Interval, type PlanId } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { log } from "@/lib/logger";
import { effectivePlan } from "./entitlement";
import { periodOf } from "./usage";

/**
 * Billing metering: the meter is ACTIVE COMPANY FILES. A production file is active in a period once a request
 * synced successfully for it in that period (calendar month, UTC). QuickBooks sample company files are free and
 * never counted, in either environment (isBillableFile). Money is integer US cents, computed from product.ts only.
 */

/** Project ids are `${orgId}__${environment}` (see v1 engine projectIdOf). */
export function splitProjectId(projectId: string): { orgId: string; environment: "test" | "production" } {
  const i = projectId.lastIndexOf("__");
  const env = projectId.slice(i + 2);
  return { orgId: projectId.slice(0, i), environment: env === "production" ? "production" : "test" };
}

export interface FileCharge {
  planId: PlanId;
  /** files actually active this period */
  files: number;
  /** the plan's included allowance (Developer 3, Starter Pack 4, Volume floor 50) */
  included: number;
  /** files billed individually on top of the allowance (Production: all of them) */
  extra: number;
  /** quantity Stripe bills for the per-file item */
  billableFiles: number;
  /** cents per month at the plan's rate (annual converted to a monthly equivalent) */
  monthlyCents: number;
  /** cents for one billing interval of the subscription */
  intervalCents: number;
  /** Developer is capped, paid plans are not */
  capped: boolean;
}

const rate = (plan: PlanId, interval: Interval) => product.plans.find((p) => p.id === plan)?.prices.find((x) => x.interval === interval)?.usd ?? 0;
/** per file, per month, in cents (annual price is per file per year) */
const perFileMonthly = (plan: PlanId, interval: Interval) => (interval === "year" ? Math.round(rate(plan, "year") / 12) : rate(plan, "month"));

/** The plan rules: Developer 3 free files; Production per file; Starter Pack 4 for one price then Production's per-file rate; Volume per file with a 50 file floor. */
export function chargeFor(planId: PlanId, interval: Interval | null, files: number): FileCharge {
  const iv: Interval = interval ?? "month";
  const b = product.billing;
  const mult = iv === "year" ? 12 : 1;
  let included = 0;
  let extra = 0;
  let monthly = 0;
  let billable = 0;
  switch (planId) {
    case "free":
      included = b.developerFiles;
      break;
    case "production":
      extra = files;
      billable = files;
      monthly = files * perFileMonthly("production", iv);
      break;
    case "starter_pack": {
      included = b.starterPackFiles;
      extra = Math.max(0, files - b.starterPackFiles);
      billable = extra;
      monthly = perFileMonthly("starter_pack", iv) + extra * perFileMonthly("production", iv);
      break;
    }
    case "volume": {
      billable = Math.max(files, b.volumeMinFiles);
      included = b.volumeMinFiles;
      extra = Math.max(0, files - b.volumeMinFiles);
      monthly = billable * rate("volume", "month");
      break;
    }
  }
  return { planId, files, included, extra, billableFiles: billable, monthlyCents: monthly, intervalCents: monthly * mult, capped: planId === "free" };
}

/** Files a plan lets an org activate in one period. Paid plans are not capped (they are billed per file). */
export function fileAllowance(planId: PlanId): number {
  return planId === "free" ? product.billing.developerFiles : Number.POSITIVE_INFINITY;
}

/**
 * Is this company file billable? QuickBooks sample company files are free in both environments; any other file is
 * metered, whatever the key's environment (a test key on a real company file is not free). Before the Web Connector
 * has told us the file name, the environment decides.
 */
export function isBillableFile(u: { projectId: string; sampleFile?: boolean }): boolean {
  if (u.sampleFile !== undefined) return !u.sampleFile;
  return splitProjectId(u.projectId).environment === "production";
}

/**
 * Count a successful sync. Returns true if this file became active for the period (and so changed the quantity).
 * `billable` defaults to the environment rule; pass isBillableFile(user) when the end user is known.
 * On a capped plan a file over the allowance is not recorded (the admission gate refuses its next requests).
 */
export async function recordActiveFile(db: Db, projectId: string, endUserId: string, now = new Date(), billable?: boolean): Promise<boolean> {
  const { orgId, environment } = splitProjectId(projectId);
  if (!(billable ?? environment === "production")) return false; // sample files are free
  const period = periodOf(now);
  const allowance = fileAllowance(effectivePlan(await db.getEntitlement(orgId), now.getTime()).id);
  if (allowance !== Number.POSITIVE_INFINITY) {
    const active = await db.listActiveFiles(orgId, period);
    if (active.includes(endUserId) || active.length >= allowance) return false;
  }
  const added = await db.markActiveFile(orgId, period, endUserId, now);
  if (added) await db.incUsage(orgId, "files", period, 1);
  return added;
}

/** True when this org may put one more production file into use this period. Throws nothing: the caller maps it to the 402 error. */
export async function canActivateFile(db: Db, projectId: string, endUserId: string | null, now = new Date(), billable?: boolean): Promise<boolean> {
  const { orgId, environment } = splitProjectId(projectId);
  if (!(billable ?? environment === "production")) return true;
  const plan = effectivePlan(await db.getEntitlement(orgId), now.getTime());
  const allowance = fileAllowance(plan.id);
  if (allowance === Number.POSITIVE_INFINITY) return true;
  const active = await db.listActiveFiles(orgId, periodOf(now));
  if (endUserId && active.includes(endUserId)) return true;
  return active.length < allowance;
}

export async function usageSummary(db: Db, orgId: string, now = new Date()) {
  const ent = await db.getEntitlement(orgId);
  const plan = effectivePlan(ent, now.getTime());
  const files = (await db.listActiveFiles(orgId, periodOf(now))).length;
  return { period: periodOf(now), plan, interval: ent?.interval ?? null, ...chargeFor(plan.id, ent?.interval ?? null, files) };
}

/** The Stripe surface the quantity sync uses. */
export type MeterStripe = Pick<Stripe, "subscriptions" | "subscriptionItems" | "prices">;

/**
 * Report the billable quantity to Stripe as the subscription item quantity (Production and Volume: the file item;
 * Starter Pack: the extra files ride on a Production priced item added to the same subscription, quantity 0 when none).
 * Returns what it set, or null when there is nothing to report (free plan, no subscription, lifetime).
 */
export async function syncStripeQuantity(stripe: MeterStripe, db: Db, orgId: string, now = new Date()): Promise<{ subscriptionId: string; quantity: number; extraQuantity?: number } | null> {
  const ent = await db.getEntitlement(orgId);
  if (!ent?.isPaid || !ent.subscriptionId || ent.status === "lifetime") return null;
  const plan = effectivePlan(ent, now.getTime());
  if (plan.id === "free") return null;
  const files = (await db.listActiveFiles(orgId, periodOf(now))).length;
  const charge = chargeFor(plan.id, ent.interval, files);
  const sub = await stripe.subscriptions.retrieve(ent.subscriptionId);
  if (sub.metadata?.app !== db.app) return null; // never touch another app's subscription
  const items = sub.items.data;
  const main = items.find((i) => planForLookupKey(i.price.lookup_key)?.plan.id === plan.id);
  if (!main) return null;
  const proration = "create_prorations" as const;
  if (plan.id === "starter_pack") {
    // the pack item stays at 1; extra files use the Production price of the same interval
    const key = `${product.slug}_production_${ent.interval === "year" ? "annual" : "monthly"}`;
    let extraItem = items.find((i) => i.price.lookup_key === key);
    if (!extraItem && charge.extra > 0) {
      const price = (await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 })).data[0];
      if (!price || price.metadata?.app !== db.app) return null;
      extraItem = await stripe.subscriptionItems.create({ subscription: sub.id, price: price.id, quantity: charge.extra, proration_behavior: proration });
    } else if (extraItem && extraItem.quantity !== charge.extra) {
      await stripe.subscriptionItems.update(extraItem.id, { quantity: charge.extra, proration_behavior: proration });
    }
    return { subscriptionId: sub.id, quantity: 1, extraQuantity: charge.extra };
  }
  if (main.quantity !== charge.billableFiles) await stripe.subscriptionItems.update(main.id, { quantity: Math.max(charge.billableFiles, 1), proration_behavior: proration });
  return { subscriptionId: sub.id, quantity: Math.max(charge.billableFiles, 1) };
}

/** Hook for the /qbwc route: count the file, and when the quantity changed, tell Stripe. Never throws (the SOAP reply must not fail on billing). */
export async function onFileSynced(db: Db, stripe: MeterStripe | null, projectId: string, endUserId: string, now = new Date(), billable?: boolean): Promise<void> {
  try {
    if (!(await recordActiveFile(db, projectId, endUserId, now, billable))) return;
    if (stripe) await syncStripeQuantity(stripe, db, splitProjectId(projectId).orgId, now);
  } catch (e) {
    log.error("metering_failed", { message: (e as Error).message });
  }
}
