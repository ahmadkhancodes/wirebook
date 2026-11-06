import { z } from "zod";
import { product } from "@/config/product";
import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, readJson, withApi } from "@/lib/http";
import { getBridge } from "@/lib/bridge";
import { applyRetentionNow, clampRetention, retentionFor } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ retentionDays: z.number().int().min(product.retention.minPayloadDays).max(product.retention.payloadDays) });

export const GET = withApi(async () => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  return json({ retentionDays: await retentionFor(await getDb(), ctx.org.id), defaultDays: product.retention.payloadDays, minDays: product.retention.minPayloadDays });
});

/** An org can only shorten the default; owners and admins (apiKey:manage) change it, and the change is audited. */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "apiKey", "manage");
  const { retentionDays } = await readJson(req, Body);
  const db = await getDb();
  const days = clampRetention(retentionDays);
  await db.setOrgSettings(ctx.org.id, { retentionDays: days });
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "retention.changed", meta: { retentionDays: days } });
  const purged = await applyRetentionNow(db, await getBridge(), ctx.org.id, days, ctx.user.id);
  return json({ retentionDays: days, purged });
});
