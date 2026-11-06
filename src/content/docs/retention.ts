import { product as p } from "@/config/product";
import { IDEMPOTENCY_TTL_MS } from "@/lib/bridge/store";
import { DELIVERY_TTL_DAYS } from "@/lib/db/types";
import type { DocPage } from "./types";

export const retention: DocPage = {
  slug: "retention",
  title: "Data retention",
  description: `How long ${p.name} keeps request bodies, parsed results, request metadata, idempotency keys and webhook logs.`,
  sections: [
    {
      heading: "Summary",
      body: [
        `Request and response bodies, parsed results and raw qBXML are deleted after ${p.retention.payloadDays} days. Request metadata is deleted after ${p.retention.metadataDays} days. Idempotency keys are kept for ${IDEMPOTENCY_TTL_MS / 864e5} days. Webhook delivery logs are kept for ${DELIVERY_TTL_DAYS} days. The same periods are in our privacy policy. All behaviour on this page is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.`,
      ],
    },
    {
      heading: "Payloads",
      body: [
        `We store the request body, the parsed result we return and the raw qBXML response with each request, so you can read a late answer and replay it. A daily job deletes them after ${p.retention.payloadDays} days. The request row stays, without its payload.`,
        "Payloads are QuickBooks data. We do not read them, sell them or use them to train a model.",
      ],
    },
    {
      heading: "Shorten the period",
      body: [
        `Under Settings, then Data retention, an organization can shorten the payload period to any whole number of days from ${p.retention.minPayloadDays} to ${p.retention.payloadDays}. It cannot be made longer. Saving a shorter period applies immediately to what is already stored, in both environments, and writes an audit entry with the count of removed payloads and never their content.`,
      ],
    },
    {
      heading: "Metadata",
      body: [
        `Request metadata is the request id, operation, state, timestamps and error codes. It is deleted after ${p.retention.metadataDays} days and the deletion is written to the audit log as a count.`,
      ],
    },
    {
      heading: "Idempotency keys and webhook logs",
      body: [
        `Idempotency keys, and the result stored with them, are kept for ${IDEMPOTENCY_TTL_MS / 864e5} days. Webhook delivery logs, which hold the payloads we sent (ids and statuses only), are kept for ${DELIVERY_TTL_DAYS} days.`,
      ],
    },
    {
      heading: "Audit log and account deletion",
      body: [
        "The audit log records account and settings changes and retention runs. It stays with your organization while the account is open. After you delete your account we remove your data within 30 days, except billing records the law requires us to keep, and backups roll off within 35 days after deletion. See the privacy policy.",
      ],
    },
  ],
};
