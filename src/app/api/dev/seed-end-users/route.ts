import { randomUUID } from "node:crypto";
import { getOrgContext } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { json } from "@/lib/http";
import { hashPassword } from "@/lib/qbwc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: four demo company files in the signed-in org's test project, one per status, with a health timeline. 404 unless E2E_OUTBOX=1. */
export async function POST() {
  if (process.env.E2E_OUTBOX !== "1") return json({ error: "not_found" }, 404);
  const ctx = await getOrgContext();
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const { users, health } = await getBridge();
  const projectId = `${ctx.org.id}__test`;
  const now = Date.now();
  const mk = (name: string, status: "connected" | "asleep" | "broken" | "pending", pollMs: number | null, extra: object = {}) => ({
    id: `end_seed_${randomUUID().replace(/-/g, "").slice(0, 12)}`, projectId, externalId: name.toLowerCase().replace(/\s+/g, "-"), companyName: name,
    qbwcUsername: `wb_${randomUUID().replace(/-/g, "").slice(0, 16)}`, qbwcPasswordHash: hashPassword(randomUUID()), ownerGuid: randomUUID(), fileGuid: randomUUID(),
    status, failedAuth: { count: 0, windowStart: new Date(now) }, createdAt: new Date(now - 9 * 864e5),
    ...(pollMs !== null ? { lastPollAt: new Date(now - pollMs), lastSuccessAt: new Date(now - pollMs), firstSyncAt: new Date(now - 8 * 864e5) } : {}), ...extra,
  });
  const rows = [
    mk("Acme Builders", "connected", 60_000),
    mk("Harbor Dental", "asleep", 5 * 36e5),
    mk("Lumber Yard Co", "broken", 80 * 36e5, { lastError: "0x80040408 Could not start QuickBooks." }),
    mk("Northwind Traders", "pending", null),
  ];
  for (const u of rows) await users.create(u);
  const broken = rows[2]!;
  const at = (h: number) => new Date(now - h * 36e5);
  for (const e of [
    { at: at(8 * 24), status: "connected" as const, reason: "First sync completed" },
    { at: at(80 - 8), status: "asleep" as const, reason: "No poll from the Web Connector for 2 hours" },
    { at: at(80 - 72 - 8 + 8), status: "broken" as const, reason: "0x80040408 Could not start QuickBooks." },
  ]) await health.append({ endUserId: broken.id, projectId, ...e });
  return json({ ok: true, ids: rows.map((r) => r.id) });
}
