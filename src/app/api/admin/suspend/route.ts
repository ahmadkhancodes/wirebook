import { z } from "zod";
import { audit } from "@/lib/audit";
import { isFounderAdmin, requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { setKeySuspended, setOrgSuspended } from "@/lib/security/abuse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("org"), orgId: z.string().min(1).max(128), suspended: z.boolean(), reason: z.string().max(300).optional() }),
  z.object({ kind: z.literal("key"), orgId: z.string().min(1).max(128), keyId: z.string().min(1).max(128), suspended: z.boolean(), reason: z.string().max(300).optional() }),
]);

async function admin() {
  const { user } = await requireUser();
  if (!isFounderAdmin(user.email)) throw new HttpError(404, "not_found");
  return user;
}

/** Everything currently suspended. */
export const GET = withApi(async () => {
  await admin();
  return json({ suspended: await (await getDb()).listSuspended() });
});

/** Suspend or restore an organization (all its API traffic) or one API key. Always audited with the actor. */
export const POST = withApi(async (req) => {
  const user = await admin();
  const b = await readJson(req, Body);
  const db = await getDb();
  if (b.kind === "org") {
    await setOrgSuspended(db, b.orgId, b.suspended, b.reason);
    await audit({ orgId: b.orgId, actorId: user.id, action: b.suspended ? "admin.org_suspended" : "admin.org_restored", target: b.orgId, meta: { reason: b.reason ?? "" } });
  } else {
    await setKeySuspended(db, b.orgId, b.keyId, b.suspended);
    await audit({ orgId: b.orgId, actorId: user.id, action: b.suspended ? "admin.key_suspended" : "admin.key_restored", target: b.keyId, meta: { reason: b.reason ?? "" } });
  }
  return json({ suspended: await db.listSuspended() });
});
