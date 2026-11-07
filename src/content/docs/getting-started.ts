import { product as p } from "@/config/product";
import { money, rates } from "@/lib/pricing";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Create a ${p.name} account, make a key and send your first request against a sample company file.`,
  sections: [
    {
      heading: "Status",
      body: [
        `${p.fullName} is in build. Accounts, API keys and billing work today. The QuickBooks request endpoints (/v1/qbd/*), the hosted connect flow and the request log are built and validated against a Web Connector simulator, not yet a real QuickBooks install. Nothing here claims real world parity yet.`,
      ],
    },
    {
      heading: "Create your account",
      body: [
        `Go to ${p.url} and sign in with your email. We send a magic link, so there is no password to set. Your first sign in creates an organization that holds your end users, keys and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Developer"} plan: unlimited sample company files, no card, and a fair-use cap of ${p.abuse.dailyRequests.free.toLocaleString("en-US")} API requests a day. Production is ${money(rates.perFile)} per active file per month.`,
      ],
    },
    {
      heading: "Create an API key",
      body: [
        "Open Settings, then API keys, and create a key. Test keys start with sk_test_ and are meant for QuickBooks sample company files, which are free. A real company file counts as an active file whichever key you use. The full key is shown once, so copy it into your secrets manager straight away. Keys are stored as SHA-256 hashes and cannot be recovered.",
      ],
    },
    {
      heading: "Make your first request",
      body: ["Send the key in the x-api-key header. This call returns the organization the key belongs to, and proves the key works."],
      code: { lang: "bash", code: `curl ${p.url}/api/v1/me \\\n  -H "x-api-key: YOUR_API_KEY"` },
    },
    {
      heading: "Next steps",
      body: [
        "Read the connect flow guide to see what your customer does on the QuickBooks PC. Read the API reference for request states and idempotency, and the errors guide for what each status means.",
      ],
    },
  ],
};
