import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { endUserView, projectOf } from "@/lib/health/view";
import { json, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the dashboard every few seconds. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  const env = new URL(req.url).searchParams.get("env");
  const users = await (await getBridge()).users.list({ projectId: projectOf(ctx.org.id, env), limit: 200 });
  const now = new Date();
  return json({ endUsers: users.map((u) => endUserView(u, now)), at: now.toISOString() });
});
