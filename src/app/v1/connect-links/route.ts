import { createConnectLink } from "@/lib/connect";
import { withV1 } from "@/lib/v1/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return withV1(req, (deps) => createConnectLink(deps, req));
}
