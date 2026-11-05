import { rawQbxml } from "@/lib/v1/engine";
import { withV1 } from "@/lib/v1/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return withV1(req, (deps) => rawQbxml(deps, req));
}
