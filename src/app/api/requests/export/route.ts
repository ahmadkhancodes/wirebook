import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { csvRow } from "@/lib/csv";
import { projectOf } from "@/lib/health/view";
import { withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;
const PAGE = 500;

/** CSV of the request log (metadata only, never bodies) for the active organization and the chosen environment. */
export const GET = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "read");
  await enforceRateLimit(`export:${ctx.org.id}`, RULES.export);
  const env = new URL(req.url).searchParams.get("env");
  const projectId = projectOf(ctx.org.id, env);
  const bridge = await getBridge();
  const lines = [csvRow(["id", "created_at", "company_file", "operation", "object", "state", "qb_status_code", "duration_ms", "error_code"])];
  let before: { createdAt: Date; id: string } | undefined;
  while (lines.length <= MAX_ROWS) {
    const rows = await bridge.queue.list({ projectId, limit: PAGE, ...(before ? { before } : {}) });
    for (const j of rows) {
      lines.push(csvRow([j.id, j.createdAt, j.endUserId, j.op, j.meta?.objectType, j.state, j.qbStatusCode, j.durationMs, j.error?.code]));
    }
    const last = rows.at(-1);
    if (rows.length < PAGE || !last) break;
    before = { createdAt: new Date(last.createdAt), id: last.id };
  }
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="wirebook-requests-${projectId.endsWith("production") ? "production" : "test"}.csv"`,
      "cache-control": "no-store",
    },
  });
});
