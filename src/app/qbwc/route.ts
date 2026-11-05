import { getBridge } from "@/lib/bridge";
import { appUrl } from "@/lib/env";
import { handleSoap, wsdl } from "@/lib/qbwc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Web Connector SOAP 1.1 endpoint: stateless, every call loads its state from the bridge store. */
export async function POST(req: Request) {
  const xml = await req.text();
  if (xml.length > 5_000_000) return new Response("payload too large", { status: 413 });
  const bridge = await getBridge();
  const r = await handleSoap(xml, { ...bridge, holdMs: Number(process.env.QBWC_HOLD_MS) || 0 });
  return new Response(r.body, { status: r.status, headers: { ...r.headers, "cache-control": "no-store" } });
}

/** GET /qbwc?wsdl */
export async function GET(req: Request) {
  if (!new URL(req.url).searchParams.has("wsdl")) return new Response("Wirebook Web Connector endpoint. POST SOAP 1.1 here.", { status: 200, headers: { "content-type": "text/plain" } });
  return new Response(wsdl(`${appUrl()}/qbwc`), { headers: { "content-type": "text/xml; charset=utf-8" } });
}
