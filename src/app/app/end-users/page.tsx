import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { endUserView, projectOf, type EndUserView } from "@/lib/health/view";
import { EndUsersClient } from "./end-users-client";

export const metadata = { title: "End users" };
export const dynamic = "force-dynamic";

export default async function EndUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrg({ page: true });
  const sp = await searchParams;
  const env = (Array.isArray(sp.env) ? sp.env[0] : sp.env) === "production" ? "production" : "test";
  let initial: EndUserView[] | null = null;
  try {
    const now = new Date();
    initial = (await (await getBridge()).users.list({ projectId: projectOf(ctx.org.id, env), limit: 200 })).map((u) => endUserView(u, now));
  } catch {
    initial = null;
  }
  return (
    <>
      <PageHeader title="End users" description="Every company file your customers have connected, with its live status. The list refreshes by itself." />
      <EndUsersClient env={env} initial={initial} />
    </>
  );
}
