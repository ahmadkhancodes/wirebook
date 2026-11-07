import { PageHeader } from "@/components/app/page-header";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { WebhooksClient } from "./webhooks-client";

export const metadata = { title: "Webhooks" };

import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";

/** Event names offered in the create form. */
const EVENTS = [{ type: "*", description: "Every event below" }, ...WEBHOOK_EVENTS];

export default async function WebhooksPage() {
  const ctx = await requireOrg({ page: true });
  return (
    <>
      <PageHeader title="Webhooks" description="We POST signed JSON to your URL when a request finishes, a company file connects or breaks, or usage nears its limit. Each endpoint listens to one environment. Failed deliveries retry with backoff, and every attempt is logged below." />
      <WebhooksClient canManage={can(ctx.role, "webhook", "manage")} events={EVENTS} />
    </>
  );
}
