import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { issueLink } from "@/lib/connect";
import { appUrl } from "@/lib/env";
import { ownsUser } from "@/lib/health/view";
import { HttpError, json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Send reconnect link": mints a fresh single use 24 hour link for this company file. The owner shares it with the file's user. */
export const POST = withApi<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const bridge = await getBridge();
  const user = await bridge.users.get(id);
  if (!user || !ownsUser(ctx.org.id, user)) throw new HttpError(404, "not_found");
  const link = await issueLink(bridge, appUrl(), user);
  await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "connect_link.reconnect", target: user.id });
  return json({ url: link.url, expiresAt: link.expiresAt.toISOString() }, 201);
});
