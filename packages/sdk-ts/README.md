# @wirebook/sdk

TypeScript SDK for [Wirebook](https://wirebook.buffersoltech.com): QuickBooks Desktop over REST and JSON.
ESM, zero runtime dependencies (uses the global `fetch`, Node 18+, browsers, edge runtimes).

## Install

```sh
npm install @wirebook/sdk
```

## Quick start

```ts
import { Wirebook } from '@wirebook/sdk';

const wb = new Wirebook({ apiKey: process.env.WIREBOOK_API_KEY! });

// 1. connect a customer's company file
const link = await wb.connectLinks.create({ externalId: 'acme', companyName: 'Acme Builders' });
// send link.url to your customer

// 2. call QuickBooks as that end user
const acme = wb.forUser('acme'); // or pass { endUser: 'acme' } per call
const customer = await acme.qbd.customers.create({ name: 'Northwind' });
const invoice = await acme.qbd.invoices.create({
  customerRef: { fullName: 'Northwind' },
  lines: [{ itemRef: { fullName: 'Labour' }, quantity: 2, rate: 85 }],
});
const one = await acme.qbd.customers.get(customer.listId!);
await acme.qbd.customers.update(one.listId!, { email: 'ap@northwind.test', revisionNumber: one.revisionNumber! });
await acme.qbd.raw('<?xml version="1.0"?>...'); // one raw qbXML request
```

Resources: `customers vendors items accounts invoices bills payments estimates salesOrders salesReceipts creditMemos purchaseOrders classes terms employees`, each with `list create get update iterate listAll`.

## Pagination

```ts
const page = await acme.qbd.customers.list({ limit: 50, name: 'A' });
page.data; page.hasMore; const next = await page.next();

for await (const c of acme.qbd.customers.iterate({ limit: 100 })) console.log(c.name);
const everyone = await acme.qbd.customers.listAll();
```

Cursors last 10 minutes, so page through promptly.

## Retries, idempotency, async

- Writes get an `Idempotency-Key` (uuid) automatically, reused across retries; pass `{ idempotencyKey }` to choose your own.
- Retries (`maxRetries`, default 2) use exponential backoff with jitter on network errors, 429 (honours `Retry-After`), 5xx and `retryable` errors. Other 4xx are never retried.
- A 202 (QuickBooks is slow, or `{ async: true }`) is returned as `{ state: 'queued', id }`:

```ts
const q = await acme.qbd.invoices.create(body, { async: true });
if (isQueued(q)) { const done = await wb.requests.wait(q, { timeoutMs: 120_000 }); }
```

## Errors

All errors extend `WirebookError` (`code`, `type`, `status`, `requestId`, `guideUrl`, `retryable`, `path`):
`AuthenticationError`, `InvalidRequestError`, `NotFoundError`, `ConflictError` (idempotency and revision conflicts),
`RateLimitError` (`retryAfter`), `QuickBooksError`, `ConnectionError`, `ServerError`.

```ts
try { await acme.qbd.customers.update(id, { revisionNumber, email }); }
catch (e) {
  if (e instanceof ConflictError && e.code === 'revision_conflict') { /* reload and retry */ }
  else if (e instanceof WirebookError) console.error(e.code, e.requestId, e.guideUrl);
}
```

## Build

`npm run build -w @wirebook/sdk` compiles with plain `tsc` to `dist/`. MIT licence.
