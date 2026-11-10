import { revokeEndUser } from "@/lib/connect";
import { withV1 } from "@/lib/v1/deps";
import { apiError } from "@/lib/v1/errors";
import { projectIdOf } from "@/lib/v1/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /v1/end-users/{id}: revokes the company file (login stops, queued requests fail). Idempotent. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withV1(req, async (deps) => {
    const auth = await deps.authenticate(req);
    const user = await deps.bridge.users.get(id);
    if (!user || user.projectId !== projectIdOf(auth)) throw apiError("not_found");
    const { failedJobs } = await revokeEndUser(deps.bridge, user, (deps.now ?? (() => new Date()))());
    return new Response(JSON.stringify({ id: user.id, object: "end_user", revoked: true, failedRequests: failedJobs }), {
      status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  });
}
