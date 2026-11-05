import { getRequest } from "@/lib/v1/engine";
import { withV1 } from "@/lib/v1/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withV1(req, (deps) => getRequest(deps, req, id));
}
