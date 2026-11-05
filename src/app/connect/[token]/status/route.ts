import { getBridge } from "@/lib/bridge";
import { finishIfSynced, loadLink, stepsFor } from "@/lib/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the connect page. Reports only what the server has observed; closes the single use link after the first sync. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bridge = await getBridge();
  const l = await loadLink(bridge, token);
  const h = { "content-type": "application/json", "cache-control": "no-store" };
  if (l.state === "unknown") return new Response(JSON.stringify({ state: "unknown" }), { status: 404, headers: h });
  if (l.state !== "ok") return new Response(JSON.stringify({ state: l.state }), { status: 410, headers: h });
  const steps = stepsFor(l.user!);
  await finishIfSynced(bridge, l);
  return new Response(JSON.stringify({ state: "ok", steps, done: steps.every((s) => s.done) }), { headers: h });
}
