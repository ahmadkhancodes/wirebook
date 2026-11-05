import { createObject, listObjects } from "@/lib/v1/engine";
import { withV1 } from "@/lib/v1/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ object: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { object } = await params;
  return withV1(req, (deps) => listObjects(deps, req, object));
}
export async function POST(req: Request, { params }: Ctx) {
  const { object } = await params;
  return withV1(req, (deps) => createObject(deps, req, object));
}
