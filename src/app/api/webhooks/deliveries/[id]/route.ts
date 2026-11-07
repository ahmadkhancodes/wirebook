import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One delivery with the exact body we signed and sent. */
export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "read");
  const { id } = await params;
  const d = await (await getDb()).getDelivery(ctx.org.id, id);
  if (!d) throw new HttpError(404, "not_found");
  return json({ delivery: d });
});
