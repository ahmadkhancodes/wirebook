import { audit } from "@/lib/audit";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { createConnectLink } from "@/lib/connect";
import { getDb } from "@/lib/db";
import { endUserView, projectOf } from "@/lib/health/view";
import { json, withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";
import { defaultDeps } from "@/lib/v1/deps";

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

/**
 * "Add company file" in the dashboard: the same connect link as POST /v1/connect-links (same validation, plan gate and
 * error object), signed in with the session instead of an API key, so a first file needs no key and no terminal.
 */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  await enforceRateLimit(`connect-link:${ctx.user.id}`, RULES.billing, await getDb());
  const environment = new URL(req.url).searchParams.get("env") === "production" ? "production" : "test";
  const deps = { ...(await defaultDeps(req)), authenticate: async () => ({ orgId: ctx.org.id, keyId: `session:${ctx.user.id}`, environment } as const) };
  const res = await createConnectLink(deps, req);
  if (res.status === 201) {
    const body = (await res.clone().json()) as { endUserId: string };
    await audit({ orgId: ctx.org.id, actorId: ctx.user.id, action: "connect_link.created", target: body.endUserId });
  }
  return res;
});
