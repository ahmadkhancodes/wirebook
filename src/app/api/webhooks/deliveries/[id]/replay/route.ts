import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { HttpError, json, withApi } from "@/lib/http";
import { replayDelivery } from "@/lib/webhooks/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Send a logged delivery again (same body, new signature). */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "webhook", "manage");
  const { id } = await params;
  const d = await replayDelivery(ctx.org.id, id);
  if (!d) throw new HttpError(404, "not_found");
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "webhook.replayed", target: id, meta: { event: d.event, status: d.status } });
  const { payload: _p, ...delivery } = d;
  return json({ delivery });
});
