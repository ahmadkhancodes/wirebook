import { buildOpenApi } from "@/lib/openapi/document";
import { appUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const revalidate = 300;

/** Public OpenAPI 3.1 document, generated from the qbXML specs and the object registry. */
export async function GET() {
  return new Response(JSON.stringify(buildOpenApi(appUrl())), {
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
      "access-control-allow-origin": "*",
    },
  });
}
