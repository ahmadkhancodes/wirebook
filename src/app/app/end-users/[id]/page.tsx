import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { endUserView, eventView, ownsUser, syncView } from "@/lib/health/view";
import { DetailClient } from "./detail-client";

export const metadata = { title: "End user" };
export const dynamic = "force-dynamic";

export default async function EndUserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { id } = await params;
  const bridge = await getBridge();
  const user = await bridge.users.get(id);
  if (!user || !ownsUser(ctx.org.id, user)) notFound();
  const events = (await bridge.health.list(id, 50)).map(eventView);
  const syncs = (await bridge.queue.listForUser(id, 25)).map((j) => syncView(j, user));
  return (
    <>
      <PageHeader title={user.companyName ?? user.externalId ?? user.id} description={<><Link href="/app/end-users" className="underline underline-offset-4">End users</Link> / <span className="figures">{user.id}</span></>} />
      <DetailClient initial={{ endUser: endUserView(user), events, syncs }} canReconnect={can(ctx.role, "data", "write")} />
    </>
  );
}
