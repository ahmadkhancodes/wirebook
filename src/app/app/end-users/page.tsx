import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { appUrl } from "@/lib/env";
import { endUserView, projectOf, type EndUserView } from "@/lib/health/view";
import { EndUsersClient } from "./end-users-client";

export const metadata = { title: "End users" };
export const dynamic = "force-dynamic";

export default async function EndUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrg({ page: true });
  const sp = await searchParams;
  const asked = Array.isArray(sp.env) ? sp.env[0] : sp.env;
  let env: "test" | "production" = asked === "production" ? "production" : "test";
  let initial: EndUserView[] | null = null;
  try {
    const now = new Date();
    const bridge = await getBridge();
    const list = async (e: "test" | "production") => (await bridge.users.list({ projectId: projectOf(ctx.org.id, e), limit: 200 })).map((u) => endUserView(u, now));
    initial = await list(env);
    // No environment chosen and no test files: open on production when that is where the files are.
    if (!asked && initial.length === 0) {
      const prod = await list("production");
      if (prod.length > 0) { env = "production"; initial = prod; }
    }
  } catch {
    initial = null;
  }
  return (
    <>
      <PageHeader title="End users" description="Every company file your customers have connected, with its live status. The list refreshes by itself." />
      <EndUsersClient env={env} initial={initial} baseUrl={appUrl()} canWrite={can(ctx.role, "data", "write")} />
    </>
  );
}
