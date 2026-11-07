import type { Job } from "@/lib/qbwc";

const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * The call a logged request made, as a curl command you can paste into a terminal.
 * The API key is never stored, so it is a placeholder; the body comes back only while retention still holds it.
 */
export function curlFor(job: Pick<Job, "id" | "endUserId" | "op" | "body" | "purgedAt" | "meta">, baseUrl: string): string {
  const method = job.meta?.method ?? "GET";
  const path = job.meta?.path ?? "/v1/qbd/raw";
  const lines = [`curl -X ${method} ${q(`${baseUrl.replace(/\/$/, "")}${path}`)}`, `  -H "Authorization: Bearer $WIREBOOK_API_KEY"`, `  -H ${q(`X-End-User-Id: ${job.endUserId}`)}`];
  const writes = method !== "GET";
  if (writes && job.meta?.idempotencyKey) lines.push(`  -H ${q(`Idempotency-Key: ${job.meta.idempotencyKey}`)}`);
  let note = "";
  if (writes) {
    if (job.purgedAt) note = "# The request body was deleted by your retention setting, so add it back before you run this.\n";
    else {
      const raw = job.op === "raw" ? { qbxml: (job.body as { qbxml?: string } | undefined)?.qbxml ?? "" } : job.body;
      lines.push(`  -H 'Content-Type: application/json'`, `  -d ${q(JSON.stringify(raw))}`);
    }
  }
  return `${note}${lines.join(" \\\n")}`;
}
