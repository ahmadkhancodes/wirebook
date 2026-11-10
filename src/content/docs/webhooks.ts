import { product as p } from "@/config/product";
import { MAX_ATTEMPTS } from "@/lib/webhooks/outbound";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { DELIVERY_TTL_DAYS } from "@/lib/db/types";
import type { DocPage } from "./types";


const DATA: Record<string, string> = {
  "request.completed": `{ "requestId": "req_01JC9P8", "state": "succeeded", "objectType": "invoices", "method": "POST", "path": "/v1/qbd/invoices", "durationMs": 4200, "environment": "production", "companyFile": { "id": "end_01JC...", "externalId": "acme-42", "companyName": "Acme Builders" }, "error": null, "links": { "self": "${p.url}/v1/requests/req_01JC9P8" } }`,
  "company_file.connected": `{ "environment": "production", "companyFile": { "id": "end_01JC...", "externalId": "acme-42", "companyName": "Acme Builders" }, "status": "connected", "reason": null, "at": "2026-11-05T10:00:00.000Z" }`,
  "company_file.broken": `{ "environment": "production", "companyFile": { "id": "end_01JC...", "externalId": "acme-42", "companyName": "Acme Builders" }, "status": "broken", "reason": "no poll for 72 hours", "at": "2026-11-05T10:00:00.000Z" }`,
  "usage.threshold_reached": `{ "meter": "requests", "threshold": 80, "used": 4000, "limit": 5000, "period": "2026-11-05" }`,
  "test.ping": `{ "message": "Test event" }`,
};

const nodeSnippet = `import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody must be the exact bytes you received, before JSON.parse.
export function verify(secret: string, rawBody: string, header: string, toleranceS = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceS) return false;
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}`;

const pySnippet = `import hashlib
import hmac
import time


def verify(secret: str, raw_body: bytes, header: str, tolerance_s: int = 300) -> bool:
    parts = dict(kv.split("=", 1) for kv in header.split(","))
    t = int(parts.get("t", "0"))
    if not t or abs(time.time() - t) > tolerance_s:
        return False
    signed = f"{t}.".encode() + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))`;

export const webhooks: DocPage = {
  slug: "webhooks",
  title: "Webhooks",
  description: `Events ${p.name} sends to your server, how to verify the signature, and how failed deliveries are retried.`,
  sections: [
    {
      heading: "Overview",
      body: [
        "Add an endpoint under Settings, then Webhooks, and choose the events it receives. Each endpoint listens to one environment, test or production, so test traffic never reaches your production handler. Use the Send test button to deliver a test.ping. All behaviour on this page is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.",
        "Endpoint URLs must use https and must not point at localhost or a private address (10.x, 172.16 to 172.31, 192.168.x, 169.254.x, .local and .internal names). Payloads carry ids and statuses only, never QuickBooks data. Fetch the data with the API.",
      ],
    },
    {
      heading: "Events",
      body: [
        ...WEBHOOK_EVENTS.map((e) =>
          e.type === "usage.threshold_reached"
            ? `${e.type}: ${e.description} It fires once per meter and period, at 80% and at 100%.`
            : `${e.type}: ${e.description}`,
        ),
        "test.ping: Sent when you press Send test on an endpoint.",
      ],
    },
    {
      heading: "Payload envelope",
      body: [
        "Every delivery is a POST with a JSON body {id, type, created, data}. id is the delivery id, type is the event name, created is a Unix time in seconds, and data depends on the event. Treat id as the key for deduplication, because a delivery can arrive more than once.",
      ],
      code: { lang: "json", code: `{\n  "id": "0192f3c4-7a10-7e4b-9d52-3c8a1f6b2e11",\n  "type": "request.completed",\n  "created": 1762336800,\n  "data": ${DATA["request.completed"]}\n}` },
    },
    {
      heading: "Event data",
      body: [
        "request.completed carries the request id, its state, the object type, method and path, the duration, the company file and an error code and message when it failed. The company_file events carry the company file, a status of connected or broken, a reason and the time. usage.threshold_reached carries the meter (files or requests), the threshold (80 or 100), used, limit and period. Examples of data for each event follow.",
      ],
      code: { lang: "json", code: [...WEBHOOK_EVENTS.map((e) => e.type), "test.ping"].map((t) => `// ${t}\n${DATA[t]}`).join("\n\n") },
    },
    {
      heading: "Headers and signature",
      body: [
        "Each delivery has X-Webhook-Id (the delivery id), X-Webhook-Event (the event type) and X-Webhook-Signature. The signature header looks like t=<unix>,v1=<hex>, where v1 is the hex HMAC-SHA256 of the string t, a dot, and the raw request body, keyed with the endpoint secret shown when you create it.",
        "Verify against the raw body, compare in constant time, and reject a timestamp more than 5 minutes from your clock. Respond with any 2xx status to acknowledge.",
      ],
    },
    { heading: "Verify in Node", body: ["Standard library only."], code: { lang: "ts", code: nodeSnippet } },
    { heading: "Verify in Python", body: ["Standard library only."], code: { lang: "python", code: pySnippet } },
    {
      heading: "Retries",
      body: [
        `A delivery that does not get a 2xx answer is tried again, up to ${MAX_ATTEMPTS} attempts in total. Retries run in our ${p.cadence.word} job, which tries every delivery that is due, so a failed delivery is tried again ${p.cadence.within}. After the last attempt the delivery is marked failed.`,
      ],
    },
    {
      heading: "Delivery log and replay",
      body: [
        `Settings, then Webhooks, lists each delivery with its status, attempts, last status code and last error. Delivery logs are kept for ${DELIVERY_TTL_DAYS} days. Press Replay to send an existing delivery again from scratch: same body, a fresh signature, attempts reset.`,
      ],
    },
  ],
};
