import { PageHeader } from "@/components/app/page-header";
import { product } from "@/config/product";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { retentionFor } from "@/lib/retention";
import { RetentionClient } from "./retention-client";

export const metadata = { title: "Data retention" };
export const dynamic = "force-dynamic";

export default async function DataPage() {
  const ctx = await requireOrg({ page: true });
  const days = await retentionFor(await getDb(), ctx.org.id);
  return (
    <>
      <PageHeader title="Data retention" description="How long Wirebook keeps the bodies of your requests and responses. Request metadata (time, object, status) is kept for 90 days." />
      <RetentionClient days={days} max={product.retention.payloadDays} min={product.retention.minPayloadDays} canEdit={can(ctx.role, "apiKey", "manage")} />
    </>
  );
}
