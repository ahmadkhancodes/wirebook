import { getBridge } from "@/lib/bridge";
import { appUrl } from "@/lib/env";
import { getStripe } from "@/lib/billing/stripe";
import { canActivateFile, isBillableFile, onFileSynced } from "@/lib/billing/metering";
import { errorFor } from "@/lib/errors/catalogue";
import { getDb } from "@/lib/db";
import { handleSoap, wsdl } from "@/lib/qbwc";
import { suspendedRefusal } from "@/lib/security/abuse";
import { checkFilesThreshold, webhookSink } from "@/lib/webhooks/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Web Connector SOAP 1.1 endpoint: stateless, every call loads its state from the bridge store. */
export async function POST(req: Request) {
  const xml = await req.text();
  if (xml.length > 5_000_000) return new Response("payload too large", { status: 413 });
  const bridge = await getBridge();
  const db = await getDb();
  const r = await handleSoap(xml, {
    ...bridge,
    onEvent: webhookSink(db),
    // plan gate when the Web Connector asks for work: the Developer cap holds even for files whose requests were queued before the cap was reached
    admit: async (u) => (await suspendedRefusal(db, u.projectId)) ?? ((await canActivateFile(db, u.projectId, u.id, new Date(), isBillableFile(u))) ? null : errorFor("file_limit_reached")),
    onSuccess: async (u, at) => { await onFileSynced(db, getStripe(), u.projectId, u.id, at, isBillableFile(u)); await checkFilesThreshold(db, u.projectId, { now: at }); },
    holdMs: Number(process.env.QBWC_HOLD_MS) || 0,
  });
  return new Response(r.body, { status: r.status, headers: { ...r.headers, "cache-control": "no-store" } });
}

/** GET /qbwc?wsdl */
export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.has("wsdl")) return new Response("Wirebook Web Connector endpoint. POST SOAP 1.1 here.", { status: 200, headers: { "content-type": "text/plain" } });
  return new Response(wsdl(`${appUrl()}/qbwc`), { headers: { "content-type": "text/xml; charset=utf-8" } });
}
