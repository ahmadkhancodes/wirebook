import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const sdks: DocPage = {
  slug: "sdks",
  title: "SDKs",
  description: `The TypeScript and Python SDKs for the ${p.name} API: install, client, typed models, waiting and pagination.`,
  sections: [
    {
      heading: "Status",
      body: [
        "The SDKs live in the repository as packages/sdk-ts (@wirebook/sdk) and packages/sdk-py (wirebook). They are not published to npm or PyPI yet, because the registry accounts and tokens are still a manual launch step. Until then, build them from the repository. All behaviour is validated against the QuickBooks Web Connector simulator and not yet against a real QuickBooks Desktop install. The acceptance run on a Windows rig is a launch step.",
      ],
    },
    {
      heading: "Install",
      body: ["Once published, the install commands are these. Node 18 or newer, and Python 3.9 or newer."],
      code: { lang: "bash", code: "npm install @wirebook/sdk\npip install wirebook" },
    },
    {
      heading: "TypeScript client",
      body: [
        "Create one client per API key. forUser returns a client whose calls all carry X-End-User-Id for that end user. Resources are on qbd, for example qbd.customers, qbd.salesOrders and qbd.creditMemos. Each has list, iterate, listAll, get, create and update.",
      ],
      code: { lang: "ts", code: `import { Wirebook, isQueued } from "@wirebook/sdk";\n\nconst wb = new Wirebook({ apiKey: process.env.WIREBOOK_API_KEY! });\nconst acme = wb.forUser("acme-42");\n\nconst customer = await acme.qbd.customers.create({ name: "Acme Builders" });\nconst invoice = await acme.qbd.invoices.get("<txnId>");` },
    },
    {
      heading: "Python client",
      body: [
        "The Python SDK has the same shape with snake_case names: for_user, qbd.sales_orders, list_all, idempotency_key and async_. AsyncWirebook offers the same methods as coroutines.",
      ],
      code: { lang: "python", code: `import os\nfrom wirebook import Wirebook\n\nwb = Wirebook(os.environ["WIREBOOK_API_KEY"])\nacme = wb.for_user("acme-42")\n\ncustomer = acme.qbd.customers.create({"name": "Acme Builders"})` },
    },
    {
      heading: "Typed models",
      body: [
        "Request bodies and records are typed with models generated from the same field specs the API uses to build qBXML (src/lib/qbxml/spec.ts). Run npm run gen:sdk in the repository to regenerate them, so the types cannot drift from the API. The Python models are typed dictionaries with the same camelCase keys the API takes.",
      ],
    },
    {
      heading: "Queued and wait",
      body: [
        `If QuickBooks has not answered within ${p.abuse.syncWaitMs / 1000} seconds, create and update return a Queued marker (the id of a 202 response) instead of the record. Pass the marker to requests.wait, which polls GET /v1/requests/{id} until the request succeeds, and throws the typed error if it failed or its outcome is unknown. Pass async: true (async_=True in Python) to get a Queued marker straight away.`,
      ],
      code: { lang: "ts", code: `const r = await acme.qbd.invoices.create(body, { async: true });\nif (isQueued(r)) {\n  const done = await acme.requests.wait(r, { timeoutMs: 120_000 });\n  console.log(done.state);\n}` },
    },
    {
      heading: "Pagination",
      body: [
        "iterate follows nextCursor for you and yields every record. list returns one page with a next() helper. Cursors last 10 minutes, so iterate promptly. listAll collects every record in memory, so use it for small lists.",
      ],
      code: { lang: "ts", code: `for await (const customer of acme.qbd.customers.iterate({ active: true, limit: 100 })) {\n  console.log(customer);\n}` },
    },
    {
      heading: "Errors and retries",
      body: [
        "Failures throw a subclass of WirebookError with code, type, message, requestId, retryable and guideUrl: AuthenticationError, InvalidRequestError, NotFoundError, ConflictError, RateLimitError (with retryAfter), QuickBooksError, ConnectionError and ServerError. The SDKs retry twice by default on network errors, 429 and 5xx, honour Retry-After, and reuse the same Idempotency-Key for every retry of a write.",
      ],
    },
  ],
};
