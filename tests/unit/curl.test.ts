import { describe, expect, it } from "vitest";
import { curlFor } from "@/lib/curl";

const base = { id: "req_1", endUserId: "end_a", op: "customer.add" as const, body: { name: "O'Neil & Sons" }, meta: { projectId: "o__test", method: "POST", path: "/v1/qbd/customers", objectType: "customers", idempotencyKey: "k-1" } };

describe("copy as curl", () => {
  it("rebuilds a write with headers, idempotency key and an escaped body", () => {
    const c = curlFor(base, "https://wirebook.test/");
    expect(c).toContain("curl -X POST 'https://wirebook.test/v1/qbd/customers'");
    expect(c).toContain('-H "Authorization: Bearer $WIREBOOK_API_KEY"');
    expect(c).toContain("-H 'X-End-User-Id: end_a'");
    expect(c).toContain("-H 'Idempotency-Key: k-1'");
    expect(c).toContain(`-d '{"name":"O'\\''Neil & Sons"}'`);
    expect(c).not.toMatch(/sk_|sk:/);
  });
  it("a read has no body and no idempotency key", () => {
    const c = curlFor({ ...base, op: "customer.query", body: {}, meta: { ...base.meta, method: "GET", idempotencyKey: undefined } }, "https://wirebook.test");
    expect(c).not.toContain("-d ");
    expect(c).not.toContain("Idempotency-Key");
  });
  it("raw passthrough sends the qbXML; a purged body is flagged instead of invented", () => {
    const raw = curlFor({ ...base, op: "raw", body: { qbxml: "<QBXML/>" }, meta: { ...base.meta, path: "/v1/qbd/raw" } }, "https://x.test");
    expect(raw).toContain(`-d '{"qbxml":"<QBXML/>"}'`);
    const gone = curlFor({ ...base, body: {}, purgedAt: new Date() }, "https://x.test");
    expect(gone.startsWith("# The request body was deleted")).toBe(true);
    expect(gone).not.toContain("-d ");
  });
});
