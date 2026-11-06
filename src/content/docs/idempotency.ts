import { product as p } from "@/config/product";
import { IDEMPOTENCY_TTL_MS } from "@/lib/bridge/store";
import type { DocPage } from "./types";

const days = IDEMPOTENCY_TTL_MS / (24 * 60 * 60 * 1000);

export const idempotency: DocPage = {
  slug: "idempotency",
  title: "Idempotency",
  description: `How the Idempotency-Key header makes writes to QuickBooks safe to retry in the ${p.name} API.`,
  sections: [
    {
      heading: "Why it matters",
      body: [
        "A write that times out may or may not have reached QuickBooks. If you send it again without a key, you can create the same invoice twice. QuickBooks Desktop does not stop duplicates on its own. All behaviour on this page is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.",
      ],
    },
    {
      heading: "How it works",
      body: [
        `Send an Idempotency-Key header on every POST write. A key is 1 to 255 printable characters. We store the first result for ${days} days. Sending the same key with the same method, path and body again returns that first result, and the response carries Idempotent-Replayed: true. No second request reaches QuickBooks.`,
        "Sending the same key with a different method, path or body returns 409 with the error code idempotency_conflict. Use a new key for a new request, and the same key only to retry the identical request.",
      ],
      code: { lang: "bash", code: `curl -X POST ${p.url}/v1/qbd/invoices \\\n  -H "Authorization: Bearer sk_test_..." \\\n  -H "X-End-User-Id: acme-42" \\\n  -H "Idempotency-Key: acme-inv-1042" \\\n  -d @invoice.json` },
    },
    {
      heading: "Choosing a key",
      body: [
        "Derive the key from something in your system that identifies the business action, such as an order id or your invoice number, not from a random value made on each attempt. A random key made inside the retry loop defeats the purpose.",
      ],
    },
    {
      heading: "SDKs",
      body: [
        "The TypeScript and Python SDKs add an Idempotency-Key to every write for you and reuse the same key across their automatic retries. Pass your own with idempotencyKey (TypeScript) or idempotency_key (Python) when you want the key to survive a restart of your own process.",
      ],
    },
    {
      heading: "When the outcome is unknown",
      body: [
        "If a write was sent to QuickBooks and the answer never came back, the request becomes outcome_unknown. A key does not resolve that on its own. Query the object by RefNumber to see whether it exists, and only then decide to write again. See Troubleshooting.",
      ],
    },
  ],
};
