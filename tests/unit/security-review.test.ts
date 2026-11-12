import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { afterSignIn, safeNext } from "../../src/components/app/redirect";
import { devRoutesEnabled } from "../../src/lib/env";
import { guardedLookup, isPrivateAddress, postPinned } from "../../src/lib/webhooks/outbound";

// Regression tests for docs/SECURITY-REVIEW.md. Each one failed against the code before the fix.

describe("S1 open redirect through ?next", () => {
  const base = "https://wirebook.buffersoltech.com";
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/ /evil.example", "/\u000b/evil.example", "//evil.example", "/\\evil.example", "https://evil.example"])(
    "%j never leaves the origin",
    (next) => {
      const out = safeNext(next);
      expect(new URL(out, base).origin).toBe(base);
      expect(out).toBe("/app");
      expect(new URL(afterSignIn({ next }), base).origin).toBe(base);
    },
  );
  it("keeps ordinary same-origin paths, query and hash", () => {
    expect(safeNext("/app/billing?plan=volume#x")).toBe("/app/billing?plan=volume#x");
    expect(safeNext("/accept-invite/abc")).toBe("/accept-invite/abc");
  });
});

/** A plain resolver (no guard) that sends every name to the local test server, in both shapes Node asks for. */
const loopbackLookup = ((_h: string, o: { all?: boolean }, cb: (e: null, a: unknown, f?: number) => void) =>
  o?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4)) as never;

describe("S2 webhook SSRF: the address is checked in the connection that is made", () => {
  let server: Server;
  let hits = 0;
  let port = 0;
  beforeAll(async () => {
    server = createServer((_req, res) => { hits++; res.statusCode = 204; res.end(); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("refuses a public name that resolves to loopback (rebinding) and never reaches the server", async () => {
    let calls = 0;
    // first answer public (what a pre-check would see), every later answer loopback
    const rebinding = (_h: string, _o: { all: true }, cb: (e: NodeJS.ErrnoException | null, a: { address: string; family: number }[]) => void) =>
      cb(null, [calls++ === 0 ? { address: "93.184.216.34", family: 4 } : { address: "127.0.0.1", family: 4 }]);
    calls = 1; // the connection's own lookup is the one that counts
    const before = hits;
    await expect(postPinned(`http://rebind.example:${port}/hook`, {}, "{}", { lookup: guardedLookup(rebinding) })).rejects.toMatchObject({ name: "BlockedAddress" });
    expect(hits).toBe(before);
  });

  it.each(["http://127.0.0.1:1/x", "http://[::1]:1/x", "http://100.64.0.1/x", "http://169.254.169.254/latest/meta-data", "http://0.0.0.0/x", "http://198.18.0.1/x", "ftp://example.com/x"])("refuses %s before connecting", async (url) => {
    await expect(postPinned(url, {}, "{}")).rejects.toMatchObject({ name: "BlockedAddress" });
  });

  it("delivers normally when the name resolves to an allowed address", async () => {
    const allow = loopbackLookup;
    expect(await postPinned(`http://hooks.example:${port}/x`, { "x-test": "1" }, "{}", { lookup: allow })).toBe(204);
  });

  it("gives up on a receiver that never answers", async () => {
    const slow = createServer(() => { /* never responds */ });
    await new Promise<void>((r) => slow.listen(0, "127.0.0.1", () => r()));
    const p = (slow.address() as AddressInfo).port;
    const allow = loopbackLookup;
    await expect(postPinned(`http://slow.example:${p}/x`, {}, "{}", { lookup: allow, timeoutMs: 300 })).rejects.toMatchObject({ name: "TimeoutError" });
    slow.closeAllConnections();
    await new Promise<void>((r) => slow.close(() => r()));
  });

  it("knows the benchmark, IETF and NAT64 ranges are not public", () => {
    for (const ip of ["198.18.0.1", "198.19.255.1", "192.0.0.8", "64:ff9b::7f00:1", "2002:7f00:1::1"]) expect(isPrivateAddress(ip), ip).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });
});

describe("S5 dev routes (mail outbox with sign-in links) never run on Vercel production", () => {
  it("stays off in production even if E2E_OUTBOX is set by mistake", () => {
    const old = { e: process.env.E2E_OUTBOX, v: process.env.VERCEL_ENV };
    process.env.E2E_OUTBOX = "1";
    process.env.VERCEL_ENV = "production";
    expect(devRoutesEnabled()).toBe(false);
    process.env.VERCEL_ENV = "preview";
    expect(devRoutesEnabled()).toBe(true);
    if (old.e === undefined) delete process.env.E2E_OUTBOX; else process.env.E2E_OUTBOX = old.e;
    if (old.v === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = old.v;
  });
});
