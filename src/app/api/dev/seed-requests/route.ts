import { getOrgContext } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { errorFor } from "@/lib/errors/catalogue";
import { devRoutesEnabled } from "@/lib/env";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: fills the signed-in org's test request log with a realistic mix. 404 unless E2E_OUTBOX=1 (never set on Vercel). */
export async function POST() {
  if (!devRoutesEnabled()) return json({ error: "not_found" }, 404);
  const ctx = await getOrgContext();
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const { queue } = await getBridge();
  const projectId = `${ctx.org.id}__test`;
  const file = "end_demo_acme";
  const plan: { m: string; p: string; o: string; done: "succeeded" | "failed" | "queued" | "sent" | "outcome_unknown"; ms?: number; err?: string; qb?: number }[] = [
    { m: "GET", p: "/v1/qbd/customers", o: "customers", done: "succeeded", ms: 1840 },
    { m: "POST", p: "/v1/qbd/invoices", o: "invoices", done: "succeeded", ms: 2310 },
    { m: "POST", p: "/v1/qbd/invoices", o: "invoices", done: "failed", ms: 1420, err: "invalid_reference", qb: 3140 },
    { m: "GET", p: "/v1/qbd/vendors", o: "vendors", done: "succeeded", ms: 960 },
    { m: "POST", p: "/v1/qbd/bills", o: "bills", done: "succeeded", ms: 2760 },
    { m: "POST", p: "/v1/qbd/customers", o: "customers", done: "failed", ms: 1100, err: "duplicate_name", qb: 3100 },
    { m: "POST", p: "/v1/qbd/payments", o: "payments", done: "outcome_unknown" },
    { m: "GET", p: "/v1/qbd/accounts", o: "accounts", done: "sent" },
    { m: "GET", p: "/v1/qbd/items", o: "items", done: "queued" },
  ];
  for (const r of plan) {
    const job = await queue.enqueue({ endUserId: file, op: "customer.query", body: {}, meta: { projectId, method: r.m, path: r.p, objectType: r.o } });
    if (r.done === "queued") continue;
    // the memory queue allows one job in flight per file, so finish each before the next claim
    await queue.claim(file, new Date());
    if (r.done === "sent") continue;
    if (r.done === "outcome_unknown") { await queue.expireSent(0, new Date(Date.now() + 1)); continue; }
    await queue.complete(job.id, r.done === "failed"
      ? { state: "failed", qbStatusCode: r.qb, error: errorFor(r.err!) }
      : { state: "succeeded", qbStatusCode: 0, result: [] }, new Date(Date.now() + (r.ms ?? 0)));
  }
  return json({ ok: true, projectId });
}
