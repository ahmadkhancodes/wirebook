import { getObject, updateObject } from "@/lib/v1/engine";
import { withV1 } from "@/lib/v1/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ object: string; id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { object, id } = await params;
  return withV1(req, (deps) => getObject(deps, req, object, id));
}
export async function POST(req: Request, { params }: Ctx) {
  const { object, id } = await params;
  return withV1(req, (deps) => updateObject(deps, req, object, id));
}
