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
        `Requests go to ${p.url}/v1/qbd over HTTPS with Authorization: Bearer YOUR_KEY (or x-api-key). Bodies and responses are JSON. A key belongs to the test or the production environment; test keys only see test end users and requests, and the two never mix.`,
        "Name the company file with the X-End-User-Id header: the end user id from POST /v1/connect-links, or the external id you gave it. These endpoints are validated against a Web Connector simulator, not yet a real QuickBooks install.",
      ],
    },
    {
      heading: "Objects",
      body: [
        "customers, vendors, items, accounts, invoices, bills, payments, estimates, sales-orders, sales-receipts, credit-memos, purchase-orders, classes, terms and employees. GET /v1/qbd/{object} lists, GET /v1/qbd/{object}/{id} retrieves, POST /v1/qbd/{object} creates and returns 201 with the created object. POST /v1/qbd/{object}/{id} updates every object except payments, which returns 405 not_supported; send the revisionNumber you read, and a stale one returns 409. Terms are standard terms. Items are created as service items for now. Payments are customer payments (ReceivePayment).",
        "If QuickBooks has not answered within the wait (55 seconds), you get 202 with a request id and a Location header. Poll GET /v1/requests/{id}. Send Prefer: respond-async to get the 202 straight away.",
      ],
      code: { lang: "bash", code: `curl ${p.url}/v1/qbd/customers?limit=25 \
  -H "Authorization: Bearer sk_test_..." \
  -H "X-End-User-Id: acme-42"` },
    },
    {
      heading: "Pagination",
      body: [
        "Lists return data, hasMore, nextCursor and cursorExpiresAt. Pass nextCursor back as the cursor query parameter with the same filters. Cursors last 10 minutes, then the API answers 410 cursor_expired; start again without a cursor. limit is 1 to 100 and defaults to 25. Filters: name, active, modifiedSince, modifiedUntil (and customer or vendor, refNumber, includeLines on transactions).",
      ],
      code: { lang: "json", code: `{\n  "data": [{ "listId": "80000001-1", "name": "Acme Builders", "revisionNumber": "1700000000" }],\n  "hasMore": true,\n  "nextCursor": "eyJvIjoiY3VzdG9tZXJzIi4uLg",\n  "cursorExpiresAt": "2026-11-05T10:10:00.000Z"\n}` },
    },
    {
      heading: "Raw qbXML",
      body: [
        "POST /v1/qbd/raw takes one valid qbXML request, as JSON {\"qbxml\": \"...\"} or an XML body, and returns the raw QuickBooks response and a parsed copy. Malformed XML returns 400 with the line and column. A QuickBooks error still returns 200 here, with its statusCode in the parsed output.",
      ],
    },
    {
      heading: "Connect links",
      body: [
        "POST /v1/connect-links with an externalId (and an optional companyName) creates the end user and returns a single use link that is valid for 24 hours. Send your customer to the link. See the connect flow guide.",
      ],
    },
    {
      heading: "Request lifecycle",
      body: [
        "Every request to a company file has one of five states: queued, sent, succeeded, failed or outcome_unknown. A request is queued until QuickBooks next polls. If a write times out after it was sent, it becomes outcome_unknown and is never retried for you. Look it up by RefNumber before you send it again.",
        "Only one request is in flight per company file at a time. The rest wait in order.",
      ],
    },
    {
      heading: "Idempotency",
      body: [
        "Send an Idempotency-Key header on every write. We replay the first result for 7 days and mark the response with Idempotent-Replayed: true. The same key with a different method, path or body returns 409 idempotency_conflict.",
      ],
      code: { lang: "bash", code: `curl -X POST ${p.url}/v1/qbd/invoices \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "X-End-User-Id: acme-42" \\\n  -H "Idempotency-Key: acme-inv-1042" \\\n  -d @invoice.json` },
    },
    {
      heading: "Errors",
      body: [
        "Errors use a matching HTTP status and one JSON object. Match on code, not on the status text. Input problems also carry a path, such as lines[0].itemRef. Every code has a guide at /errors. The same input always gives the same message, because no AI model is involved.",
      ],
      code: {
        lang: "json",
        code: `{\n  "error": {\n    "code": "invalid_reference",\n    "type": "quickbooks",\n    "message": "A referenced list item does not exist in this company file (3140).",\n    "userFacingMessage": "A name or item in this request was not found in QuickBooks.",\n    "guideUrl": "${p.url}/errors/3140",\n    "retryable": false,\n    "requestId": "req_01JC9P8"\n  }\n}`,
      },
    },
    {
      heading: "Rate limits",
      body: [
        `Each API key can make ${p.abuse.keyPerMinute} requests per minute and each source address ${p.abuse.ipPerMinute}. Each organization also has a daily cap on requests (UTC day, test and production together): ${p.abuse.dailyRequests.free.toLocaleString("en-US")} on the Developer plan. Beyond a limit you get 429 with rate_limited or daily_cap_reached and a Retry-After header. See the limits guide.`,
      ],
    },
    {
      heading: "More guides",
      body: [
        "Each object has its own page of fields, starting at the resources guide. Webhooks, idempotency, the SDKs, limits, data retention and troubleshooting have their own guides. A C# SDK and a hosted MCP server with read only mode are roadmap items and are not available yet.",
      ],
    },
    {
      heading: "Account export and deletion",
      body: [
        "GET /api/account/export returns a JSON copy of your account data. DELETE /api/account permanently deletes your account and organization. Both require a signed in session and are also available in Settings, then Account.",
      ],
    },
  ],
};
