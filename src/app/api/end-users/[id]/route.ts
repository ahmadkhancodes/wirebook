import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { endUserView, eventView, ownsUser } from "@/lib/health/view";
import { HttpError, json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const { id } = await params;
  const bridge = await getBridge();
  const user = await bridge.users.get(id);
  if (!user || !ownsUser(ctx.org.id, user)) throw new HttpError(404, "not_found");
  return json({ endUser: endUserView(user), events: (await bridge.health.list(id, 50)).map(eventView) });
});
