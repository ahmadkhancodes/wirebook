/**
 * Copy-paste commands shared by the docs and the dashboard, so the quickstart and the "try it" boxes are the same text.
 * The key is read from $WIREBOOK_API_KEY (never pasted into a command), shell values are single quoted.
 * tests/e2e/docs-run.spec.ts runs every one of them with curl against the app.
 */
const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const trim = (base: string) => base.replace(/\/+$/, "");

export const keyHeader = `-H "Authorization: Bearer $WIREBOOK_API_KEY"`;

/** Line one of the quickstart, with the real key when the dashboard has just shown it. */
export const exportKey = (key = "sk_test_...") => `export WIREBOOK_API_KEY=${q(key)}`;

export const meCurl = (base: string) => `curl ${q(`${trim(base)}/api/v1/me`)} \\\n  ${keyHeader}`;

export const connectLinkCurl = (base: string, externalId = "acme-42", companyName = "Acme Builders") =>
  `curl -X POST ${q(`${trim(base)}/v1/connect-links`)} \\\n  ${keyHeader} \\\n  -H 'Content-Type: application/json' \\\n  -d ${q(JSON.stringify({ externalId, companyName }))}`;

export const listCustomersCurl = (base: string, endUser = "acme-42", limit = 5) =>
  `curl ${q(`${trim(base)}/v1/qbd/customers?limit=${limit}`)} \\\n  ${keyHeader} \\\n  -H ${q(`X-End-User-Id: ${endUser}`)}`;

/** The invoice used by the API reference and the idempotency guide: one service line for a customer that exists. */
export const exampleInvoice = { customerRef: { fullName: "Acme Builders" }, refNumber: "1042", lines: [{ itemRef: { fullName: "Consulting" }, quantity: 2, rate: 150 }] };

export const createInvoiceCurl = (base: string, endUser = "acme-42", key = "acme-inv-1042") =>
  `curl -X POST ${q(`${trim(base)}/v1/qbd/invoices`)} \\\n  ${keyHeader} \\\n  -H ${q(`X-End-User-Id: ${endUser}`)} \\\n  -H ${q(`Idempotency-Key: ${key}`)} \\\n  -H 'Content-Type: application/json' \\\n  -d ${q(JSON.stringify(exampleInvoice))}`;

/** Create one record of a resource (the resource reference pages). */
export const createCurl = (base: string, segment: string, body: unknown, endUser = "acme-42") =>
  `curl -X POST ${q(`${trim(base)}/v1/qbd/${segment}`)} \\\n  ${keyHeader} \\\n  -H ${q(`X-End-User-Id: ${endUser}`)} \\\n  -H ${q(`Idempotency-Key: ${segment}-create-1`)} \\\n  -H 'Content-Type: application/json' \\\n  -d ${q(JSON.stringify(body))}`;
