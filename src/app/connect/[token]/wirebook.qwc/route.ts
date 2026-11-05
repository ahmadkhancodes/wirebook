import { getBridge } from "@/lib/bridge";
import { appUrl } from "@/lib/env";
import { loadLink, qwcFor } from "@/lib/connect";
import { errorBody } from "@/lib/v1/errors";
import { errorFor } from "@/lib/errors/catalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The .qwc for this link's end user. Serving it is what turns step 1 green. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bridge = await getBridge();
  const l = await loadLink(bridge, token);
  if (l.state === "unknown") return new Response("Not found", { status: 404 });
  if (l.state !== "ok") {
    const err = errorFor(l.state === "used" ? "connect_link_used" : "connect_link_expired");
    return new Response(JSON.stringify(errorBody(err, appUrl())), { status: 410, headers: { "content-type": "application/json" } });
  }
  const user = l.user!;
  if (!user.qwcDownloadedAt) await bridge.users.update(user.id, { qwcDownloadedAt: new Date() });
  return new Response(qwcFor(user, appUrl()), {
    headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": 'attachment; filename="wirebook.qwc"', "cache-control": "no-store" },
  });
}
