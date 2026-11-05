import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const api: DocPage = {
  slug: "api",
  title: "API reference",
  description: `The ${p.name} REST API: authentication, request lifecycle, idempotency, errors and rate limits.`,
  sections: [
    {
      heading: "Base URL and authentication",
      body: [
        `All requests go to ${p.url}/api/v1 over HTTPS and need an x-api-key header. Bodies and responses are JSON. The /v1/qbd/* resource endpoints are the contract for the next milestone; /v1/me is live.`,
      ],
    },
    {
      heading: "GET /api/v1/me",
      body: ["Returns the organization the API key belongs to. Use it to check that a key works."],
      code: { lang: "json", code: `{\n  "orgId": "org_123"\n}` },
    },
    {
      heading: "Request lifecycle",
      body: [
        "Every request to a company file has one of five states: queued, sent, succeeded, failed or outcome_unknown. A request is queued until QuickBooks next polls. If a write times out after it was sent, it becomes outcome_unknown, and we reconcile by RefNumber before you retry.",
        "Only one request is in flight per company file at a time. The rest wait in order.",
      ],
    },
    {
      heading: "Idempotency",
      body: [
        "Send an Idempotency-Key header on every write. We replay the first result for 7 days. The same key with a different body returns 409.",
      ],
      code: { lang: "bash", code: `curl -X POST ${p.url}/api/v1/qbd/invoices \\\n  -H "x-api-key: YOUR_API_KEY" \\\n  -H "Idempotency-Key: acme-inv-1042" \\\n  -d @invoice.json` },
    },
    {
      heading: "Errors",
      body: [
        "Errors use a matching HTTP status and one JSON object. Match on code, not on the status text. The same input always gives the same message, because no AI model is involved.",
      ],
      code: {
        lang: "json",
        code: `{\n  "type": "invalid_reference",\n  "code": "3140",\n  "userFacingMessage": "CustomerRef does not match a customer.",\n  "guideUrl": "/docs/errors",\n  "retryable": false,\n  "requestId": "req_01JC9P8"\n}`,
      },
    },
    {
      heading: "Rate limits",
      body: [
        "Each API key can make 600 requests per minute. Beyond that you get a 429 status with the error code rate_limited. Wait for the next minute and retry with exponential backoff.",
      ],
    },
    {
      heading: "Coming in v1",
      body: ["Webhooks, a C# SDK, and a hosted MCP server with read only mode. These are roadmap items and are not available yet."],
    },
    {
      heading: "Account export and deletion",
      body: [
        "GET /api/account/export returns a JSON copy of your account data. DELETE /api/account permanently deletes your account and organization. Both require a signed in session and are also available in Settings, then Account.",
      ],
    },
  ],
};
