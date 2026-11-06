import { product } from "@/config/product";
import type { Bridge } from "@/lib/bridge";
import type { Db } from "@/lib/db/types";

const DAY = 864e5;

/** Effective payload retention for an org: the product default, or the org's shorter setting. An org can only shorten it. */
export const clampRetention = (days: number | undefined): number =>
  days === undefined || !Number.isFinite(days) ? product.retention.payloadDays : Math.min(product.retention.payloadDays, Math.max(product.retention.minPayloadDays, Math.floor(days)));

export const retentionFor = async (db: Db, orgId: string): Promise<number> => clampRetention((await db.getOrgSettings(orgId)).retentionDays);

export interface PurgeResult { purged: number; orgs: number; defaultDays: number; metadataDeleted: number }

/**
 * The `purge` cron job: removes request bodies, parsed results and raw passthrough responses older than the retention
 * (request metadata stays for metadataDays). Orgs with a shorter setting are purged at their own age.
 * Every sweep that removed something writes an audit entry (counts only, never content).
 */
export async function purgePayloads(db: Db, bridge: Bridge, now = new Date()): Promise<PurgeResult> {
  const custom = (await db.listOrgsWithRetention()).map((o) => ({ orgId: o.orgId, days: clampRetention(o.retentionDays) }));
  let total = 0;
  for (const o of custom) {
    const projectIds = [`${o.orgId}__test`, `${o.orgId}__production`];
    const n = await bridge.queue.purgePayloads({ before: new Date(now.getTime() - o.days * DAY), projectIds }, now);
    if (n > 0) await db.appendAudit({ orgId: o.orgId, actorId: null, action: "retention.purged", meta: { count: n, retentionDays: o.days }, at: now });
    total += n;
  }
  const exclude = custom.flatMap((o) => [`${o.orgId}__test`, `${o.orgId}__production`]);
  const n = await bridge.queue.purgePayloads({ before: new Date(now.getTime() - product.retention.payloadDays * DAY), excludeProjectIds: exclude }, now);
  if (n > 0) await db.appendAudit({ orgId: null, actorId: null, action: "retention.purged", meta: { count: n, retentionDays: product.retention.payloadDays }, at: now });
  // request rows themselves go after metadataDays (90), for every org
  const gone = await bridge.queue.deleteMetadata({ before: new Date(now.getTime() - product.retention.metadataDays * DAY) });
  if (gone > 0) await db.appendAudit({ orgId: null, actorId: null, action: "retention.metadata_deleted", meta: { count: gone, retentionDays: product.retention.metadataDays }, at: now });
  return { purged: total + n, orgs: custom.length, defaultDays: product.retention.payloadDays, metadataDeleted: gone };
}

/**
 * Saving a shorter retention applies at once to what is already stored (bodies, parsed results and raw responses of
 * both environments), instead of waiting for the daily job. Writes an audit entry when something was removed.
 */
export async function applyRetentionNow(db: Db, bridge: Bridge, orgId: string, days: number, actorId: string | null, now = new Date()): Promise<number> {
  const d = clampRetention(days);
  const n = await bridge.queue.purgePayloads({ before: new Date(now.getTime() - d * DAY), projectIds: [`${orgId}__test`, `${orgId}__production`] }, now);
  if (n > 0) await db.appendAudit({ orgId, actorId, action: "retention.purged", meta: { count: n, retentionDays: d, trigger: "setting_changed" }, at: now });
  return n;
}
