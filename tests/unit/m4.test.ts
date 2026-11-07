import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { beforeEach, describe, expect, it } from "vitest";
import { product } from "@/config/product";
import { createMemoryBridge } from "@/lib/bridge";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { applyRetentionNow, purgePayloads } from "@/lib/retention";
import { dailyCapFor, dayOf, enforceBadKeyLimit, enforceIpLimit, guardKey, setKeySuspended, setOrgSuspended } from "@/lib/security/abuse";
import { newChallenge } from "@/lib/security/altcha";
import { checkSignup } from "@/lib/security/signup";
import { ApiError } from "@/lib/v1/errors";
import { checkFilesThreshold, checkThreshold, eventPayload, webhookSink } from "@/lib/webhooks/events";
import { replayDelivery, verifySignature } from "@/lib/webhooks/outbound";
import { harness } from "../helpers/harness";

let db: Db;
beforeEach(() => { db = createMemoryDb("wirebook"); });

const recorder = (status = 200) => {
  const seen: { url: string; body: string; headers: Headers }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    seen.push({ url, body: String(init.body), headers: new Headers(init.headers) });
    return new Response("", { status });
  }) as unknown as typeof fetch;
  return { seen, fetchFn };
};

describe("webhook events from the bridge (no network)", () => {
  it("request.completed and company_file.connected are signed and routed per environment", async () => {
    const { seen, fetchFn } = recorder();
    await db.createWebhookEndpoint({ id: "ep_test", orgId: "org_1", url: "https://hooks.test/test", secret: "whsec_t", events: ["*"], enabled: true, environment: "test" });
    await db.createWebhookEndpoint({ id: "ep_prod", orgId: "org_1", url: "https://hooks.test/prod", secret: "whsec_p", events: ["request.completed"], enabled: true, environment: "production" });
    await db.createWebhookEndpoint({ id: "ep_other", orgId: "org_2", url: "https://hooks.test/other", secret: "whsec_o", events: ["*"], enabled: true, environment: "test" });
    const h = harness({ onEvent: webhookSink(db, fetchFn) });
    const { qb } = await h.addUser("end_a");
    qb.seedCustomer("Acme");
    const r = await h.call("GET", "/v1/qbd/customers");
    expect(r.status).toBe(200);

    const types = seen.map((s) => JSON.parse(s.body).type).sort();
    expect(types).toEqual(["company_file.connected", "request.completed"]);
    expect(seen.every((s) => s.url === "https://hooks.test/test")).toBe(true); // production and other-org endpoints stay quiet
    for (const s of seen) expect(await verifySignature("whsec_t", s.body, s.headers.get("x-webhook-signature")!)).toBe(true);
    const done = JSON.parse(seen.find((s) => s.headers.get("x-webhook-event") === "request.completed")!.body);
    expect(done.data).toMatchObject({ state: "succeeded", objectType: "customers", method: "GET", environment: "test", error: null, companyFile: { id: "end_a" } });
    expect(JSON.stringify(done)).not.toContain("Acme"); // ids and statuses only, never QuickBooks data
  });

  it("a failed request is reported with its error code", async () => {
    const { seen, fetchFn } = recorder();
    await db.createWebhookEndpoint({ id: "e", orgId: "org_1", url: "https://hooks.test/x", secret: "s", events: ["request.completed"], enabled: true, environment: "test" });
    const h = harness({ onEvent: webhookSink(db, fetchFn) });
    await h.addUser("end_a");
    const r = await h.call("POST", "/v1/qbd/invoices", { body: { customerRef: { fullName: "Nobody" }, lines: [{ itemRef: { fullName: "X" }, quantity: 1, rate: 1 }] } });
    expect(r.status).toBe(422);
    const body = JSON.parse(seen[0]!.body);
    expect(body.data).toMatchObject({ state: "failed", error: { code: "invalid_reference" } });
  });

  it("company_file.broken payload, and a failing sink never throws into the bridge", async () => {
    const user = { id: "end_z", projectId: "org_9__production", externalId: "acme", companyName: "Acme Co" } as never;
    const p = eventPayload({ type: "company_file.broken", user, at: new Date(0), reason: "no poll" });
    expect(p).toMatchObject({ orgId: "org_9", environment: "production", type: "company_file.broken", data: { status: "broken", reason: "no poll", companyFile: { externalId: "acme" } } });
    const broken = { ...db, listWebhookEndpoints: async () => { throw new Error("db down"); } } as Db;
    await expect(webhookSink(broken)({ type: "company_file.broken", user, at: new Date() })).resolves.toBeUndefined();
  });

  it("usage thresholds fire once at 80% and once at 100% per period", async () => {
    const { seen, fetchFn } = recorder();
    await db.createWebhookEndpoint({ id: "e", orgId: "o1", url: "https://hooks.test/u", secret: "s", events: ["usage.threshold_reached"], enabled: true });
    expect(await checkThreshold(db, "o1", "files", "2026-11", 2, 3, { fetchFn })).toEqual([]);
    expect(await checkThreshold(db, "o1", "files", "2026-11", 3, 3, { fetchFn })).toEqual([80, 100]);
    expect(await checkThreshold(db, "o1", "files", "2026-11", 3, 3, { fetchFn })).toEqual([]);
    expect(await checkThreshold(db, "o1", "files", "2026-12", 3, 3, { fetchFn })).toEqual([80, 100]); // a new period starts over
    expect(seen).toHaveLength(4);
    expect(JSON.parse(seen[0]!.body).data).toEqual({ meter: "files", threshold: 80, used: 3, limit: 3, period: "2026-11" });
    expect(await checkThreshold(db, "o1", "files", "2026-11", 9, Infinity, { fetchFn })).toEqual([]); // plans without a limit never fire
  });

  it("files threshold uses the Developer allowance and ignores the test environment", async () => {
    const { seen, fetchFn } = recorder();
    await db.createWebhookEndpoint({ id: "e", orgId: "o1", url: "https://hooks.test/u", secret: "s", events: ["*"], enabled: true });
    const now = new Date("2026-11-10T00:00:00Z");
    for (const f of ["a", "b", "c"]) await db.markActiveFile("o1", "2026-11", f, now);
    expect(await checkFilesThreshold(db, "o1__test", { fetchFn, now })).toEqual([]);
    expect(await checkFilesThreshold(db, "o1__production", { fetchFn, now })).toEqual([80, 100]);
    expect(seen).toHaveLength(2);
  });

  it("replay sends the same body again with a fresh signature and resets the attempts", async () => {
    await db.createWebhookEndpoint({ id: "e", orgId: "o1", url: "https://hooks.test/r", secret: "whsec_r", events: ["*"], enabled: true });
    const bad = recorder(500);
    const { emitEvent } = await import("@/lib/webhooks/outbound");
    const [d] = await emitEvent("o1", "request.completed", { requestId: "req_1" }, { db, fetchFn: bad.fetchFn });
    expect(d).toMatchObject({ status: "retrying", attempts: 1 });
    const good = recorder(200);
    const again = await replayDelivery("o1", d!.id, { db, fetchFn: good.fetchFn, now: new Date(Date.now() + 5000) });
    expect(again).toMatchObject({ status: "succeeded", attempts: 1, lastError: null });
    expect(good.seen[0]!.body).toBe(bad.seen[0]!.body);
    expect((await db.getDelivery("o1", d!.id))?.status).toBe("succeeded");
    expect(await replayDelivery("o1", "missing", { db })).toBeNull();
    expect(await replayDelivery("other_org", d!.id, { db })).toBeNull();
  });
});

const err = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as ApiError; } throw new Error("expected an ApiError"); };

describe("rate limits, daily cap, suspension", () => {
  const now = new Date("2026-11-06T22:00:00Z");

  it("per key: 600 per minute, then a 429 with Retry-After and a clear message", async () => {
    for (let i = 0; i < product.abuse.keyPerMinute; i++) await guardKey(db, { orgId: "o1", keyId: "k1", now });
    const e = await err(guardKey(db, { orgId: "o1", keyId: "k1", now }));
    expect(e.err).toMatchObject({ code: "rate_limited", httpStatusCode: 429 });
    expect(e.err.message).toContain("600 requests per minute per API key");
    expect(e.extra.headers).toMatchObject({ "retry-after": "60", "x-ratelimit-limit": "600", "x-ratelimit-remaining": "0" });
    await guardKey(db, { orgId: "o1", keyId: "k2", now }); // another key is unaffected
  });

  it("per IP and bad keys per IP", async () => {
    const t = now.getTime();
    for (let i = 0; i < product.abuse.ipPerMinute; i++) await enforceIpLimit(db, "1.2.3.4", t);
    expect((await err(enforceIpLimit(db, "1.2.3.4", t))).err.code).toBe("rate_limited");
    await enforceIpLimit(db, "5.6.7.8", t);
    for (let i = 0; i < product.abuse.badKeysPerMinute; i++) await enforceBadKeyLimit(db, "9.9.9.9", t);
    expect((await err(enforceBadKeyLimit(db, "9.9.9.9", t))).extra.headers).toMatchObject({ "retry-after": "60" });
  });

  it("daily cap comes from product.ts per plan; resets at 00:00 UTC", async () => {
    expect(dailyCapFor("free")).toBe(5_000);
    expect(dailyCapFor("volume")).toBeGreaterThan(dailyCapFor("production"));
    await db.incUsage("o1", "requests", dayOf(now), 4_999);
    expect((await guardKey(db, { orgId: "o1", keyId: "k1", now })).used).toBe(5_000);
    const e = await err(guardKey(db, { orgId: "o1", keyId: "k1", now }));
    expect(e.err).toMatchObject({ code: "daily_cap_reached", httpStatusCode: 429 });
    expect(e.extra.headers?.["retry-after"]).toBe(String(2 * 3600)); // 22:00 -> midnight
    expect(e.err.message).toContain("5,000");
    const tomorrow = new Date("2026-11-07T00:00:01Z");
    expect((await guardKey(db, { orgId: "o1", keyId: "k1", now: tomorrow })).used).toBe(1);
  });

  it("a paid plan has the higher cap", async () => {
    await db.setEntitlement("o2", { isPaid: true, status: "active", plan: "production", interval: "month", expiresAt: now.getTime() + 864e5, trialStartedAt: null, cancelAtPeriodEnd: false, checkedAt: now.getTime(), trialUsed: false, subscriptionId: "sub_1", lifetimePaymentIntentId: null, pastDueSince: null });
    await db.incUsage("o2", "requests", dayOf(now), 100_000);
    expect((await guardKey(db, { orgId: "o2", keyId: "k", now })).cap).toBe(250_000);
  });

  it("the cap fires usage.threshold_reached at 80% and 100%", async () => {
    const { seen, fetchFn } = recorder();
    await db.createWebhookEndpoint({ id: "e", orgId: "o1", url: "https://hooks.test/c", secret: "s", events: ["usage.threshold_reached"], enabled: true });
    await db.incUsage("o1", "requests", dayOf(now), 3_999);
    await guardKey(db, { orgId: "o1", keyId: "k1", now, fetchFn });
    expect(seen).toHaveLength(1);
    expect(JSON.parse(seen[0]!.body).data).toMatchObject({ meter: "requests", threshold: 80, used: 4000, limit: 5000 });
  });

  it("a suspended org or key gets 403, and restoring works", async () => {
    await setOrgSuspended(db, "o1", true, "chargeback");
    expect((await err(guardKey(db, { orgId: "o1", keyId: "k1", now }))).err).toMatchObject({ code: "org_suspended", httpStatusCode: 403 });
    await setOrgSuspended(db, "o1", false);
    await guardKey(db, { orgId: "o1", keyId: "k1", now });
    await setKeySuspended(db, "o1", "k1", true);
    expect((await err(guardKey(db, { orgId: "o1", keyId: "k1", now }))).err.code).toBe("key_suspended");
    await guardKey(db, { orgId: "o1", keyId: "k2", now });
    expect(await db.listSuspended()).toEqual([{ orgId: "o1", suspended: false, reason: "", suspendedKeys: ["k1"] }]);
    await setKeySuspended(db, "o1", "k1", false);
    expect(await db.listSuspended()).toEqual([]);
  });
});

describe("sign-up abuse checks", () => {
  const solved = async () => {
    const challenge = await newChallenge();
    const solution = await solveChallenge({ challenge, deriveKey } as never);
    return btoa(JSON.stringify({ challenge, solution }));
  };
  const flags = { signups_enabled: "on" };

  it("refuses disposable and malformed addresses before spending the challenge", async () => {
    expect(await checkSignup({ email: "x@mailinator.com", altcha: null, ip: "1.1.1.1", db, flags })).toMatchObject({ ok: false, code: "disposable_email", status: 400 });
    expect(await checkSignup({ email: "nope", altcha: null, ip: "1.1.1.1", db, flags })).toMatchObject({ ok: false, code: "invalid_email" });
  });

  it("needs a solved ALTCHA challenge, once", async () => {
    expect(await checkSignup({ email: "a@acme.test", altcha: null, ip: "1.1.1.2", db, flags })).toMatchObject({ ok: false, code: "altcha_failed" });
    const proof = await solved();
    expect(await checkSignup({ email: "A@Acme.test", altcha: proof, ip: "1.1.1.2", db, flags })).toEqual({ ok: true, email: "a@acme.test" });
    expect(await checkSignup({ email: "a@acme.test", altcha: proof, ip: "1.1.1.2", db, flags })).toMatchObject({ ok: false, code: "altcha_failed" }); // replay
  }, 30_000);

  it("limits per address and per IP, and honours the sign-ups switch", async () => {
    for (let i = 0; i < 5; i++) await checkSignup({ email: "b@acme.test", altcha: null, ip: `2.2.2.${i}`, db, flags });
    expect(await checkSignup({ email: "b@acme.test", altcha: null, ip: "2.2.2.9", db, flags })).toMatchObject({ ok: false, code: "rate_limited", status: 429 });
    for (let i = 0; i < 20; i++) await checkSignup({ email: `u${i}@acme.test`, altcha: null, ip: "3.3.3.3", db, flags });
    expect(await checkSignup({ email: "z@acme.test", altcha: null, ip: "3.3.3.3", db, flags })).toMatchObject({ ok: false, code: "rate_limited" });
    expect(await checkSignup({ email: "z@acme.test", altcha: null, ip: "4.4.4.4", db, flags: { signups_enabled: "off" } })).toMatchObject({ ok: false, code: "signups_closed", status: 403 });
  });
});

describe("retention change", () => {
  const finished = async (bridge: ReturnType<typeof createMemoryBridge>, projectId: string, at: Date) => {
    const j = await bridge.queue.enqueue({ endUserId: "end_x", op: "customer.query", body: {}, meta: { projectId, method: "GET", path: "/v1/qbd/customers", objectType: "customers" } });
    await bridge.queue.claim("end_x", at);
    await bridge.queue.complete(j.id, { state: "succeeded", result: [{ name: "Secret Co" }] }, at);
    return j.id;
  };

  it("shortening applies at once to stored results in both environments, with an audit entry", async () => {
    const bridge = createMemoryBridge();
    const t0 = new Date();
    const a = await finished(bridge, "org_1__test", t0);
    const b = await finished(bridge, "org_1__production", t0);
    const other = await finished(bridge, "org_2__production", t0);
    const in4Days = new Date(t0.getTime() + 4 * 864e5);
    expect(await applyRetentionNow(db, bridge, "org_1", 3, "user_1", in4Days)).toBe(2);
    expect((await bridge.queue.get(a))?.result).toBeUndefined();
    expect((await bridge.queue.get(b))?.result).toBeUndefined();
    expect((await bridge.queue.get(b))?.state).toBe("succeeded"); // metadata stays
    expect((await bridge.queue.get(other))?.result).toBeDefined(); // another org is untouched
    const [entry] = await db.listAudit("org_1");
    expect(entry).toMatchObject({ action: "retention.purged", actorId: "user_1", meta: { count: 2, retentionDays: 3, trigger: "setting_changed" } });
    expect(await applyRetentionNow(db, bridge, "org_1", 3, "user_1", in4Days)).toBe(0); // nothing left, no new entry
    expect(await db.listAudit("org_1")).toHaveLength(1);
  });

  it("request rows are deleted after 90 days (metadata), with an audit entry; queued work stays", async () => {
    const bridge = createMemoryBridge();
    const done = await finished(bridge, "org_1__production", new Date());
    const queued = (await bridge.queue.enqueue({ endUserId: "end_y", op: "customer.query", body: {}, meta: { projectId: "org_1__production", method: "GET", path: "/x", objectType: "customers" } })).id;
    expect((await purgePayloads(db, bridge)).metadataDeleted).toBe(0); // fresh rows stay
    expect(await bridge.queue.get(done)).not.toBeNull();
    const r = await purgePayloads(db, bridge, new Date(Date.now() + 91 * 864e5));
    expect(r.metadataDeleted).toBe(1);
    expect(await bridge.queue.get(done)).toBeNull();
    expect(await bridge.queue.get(queued)).not.toBeNull();
    expect((await purgePayloads(db, bridge, new Date(Date.now() + 92 * 864e5))).metadataDeleted).toBe(0); // idempotent
  });
});
