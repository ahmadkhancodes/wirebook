import { product as p } from "@/config/product";
import { money, rates } from "@/lib/pricing";
import { connectLinkCurl, exportKey, keyHeader, listCustomersCurl } from "@/lib/snippets";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Create a ${p.name} account, connect a QuickBooks sample company file and list its customers, in about ten minutes.`,
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
        "Open Settings, then API keys, and create a Test key. The full key is shown once, together with the two lines below filled in with your key, so you can copy them straight into a terminal. Keys are stored as SHA-256 hashes and cannot be recovered, so also put the key in your secrets manager.",
        "Test keys are meant for QuickBooks sample company files, which are free. A real company file counts as an active file whichever key you use. Every command on this page reads the key from WIREBOOK_API_KEY.",
      ],
      code: { lang: "bash", code: `${exportKey()}\n${`curl '${p.url}/api/v1/me' \\\n  ${keyHeader}`}` },
    },
    {
      heading: "Create a connect link",
      body: [
        "An end user is one of your customers' company files. Create a connect link for it with your own id for that customer as externalId. In the dashboard, End users has an Add company file form that does the same without a terminal.",
        "The answer has the link (url), valid for 24 hours, and the endUserId. You can use either the endUserId or your externalId as X-End-User-Id from now on.",
      ],
      code: { lang: "bash", code: connectLinkCurl(p.url) },
    },
    {
      heading: "Connect the company file",
      body: [
        "Open the link on the Windows PC that runs QuickBooks Desktop, with a sample company file open (on the No Company Open screen, choose Open a sample file). The page walks through four steps: download the .qwc file, add it in the Web Connector, allow access in QuickBooks, and the first sync. Each step turns green only when we have seen it happen.",
        "Sample company files are free and never billed. The connect flow guide explains each step and what the person at the PC sees.",
      ],
    },
    {
      heading: "List its customers",
      body: [
        `Send X-End-User-Id with your externalId. The call waits up to ${p.abuse.syncWaitMs / 1000} seconds for QuickBooks to answer through the Web Connector and returns the customers as JSON. If QuickBooks has not answered by then you get 202 with a request id; it finishes on the next poll and GET /v1/requests/{id} returns the result.`,
      ],
      code: { lang: "bash", code: listCustomersCurl(p.url) },
    },
    {
      heading: "See it in the request log",
      body: [
        "Open Requests in the dashboard. Every call is there with its state (queued, sent, succeeded, failed or outcome_unknown), its timeline and, for a failure, the reason and a link to the fix guide. Copy as curl rebuilds any request so you can replay it.",
      ],
    },
    {
      heading: "Next steps",
      body: [
        "Read the connect flow guide to see what your customer does on the QuickBooks PC. Read the API reference for request states and idempotency, the SDKs page for TypeScript and Python, and the errors guide for what each status means.",
      ],
    },
  ],
};
