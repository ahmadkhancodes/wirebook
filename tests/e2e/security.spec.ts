import { expect, request as pwRequest, test, type APIRequestContext } from "@playwright/test";
import { altchaHeader } from "./altcha";

// Adversarial review (docs/SECURITY-REVIEW.md): two customers in two organisations, then every cross-tenant,
// auth and injection attempt we could think of, against the locally running app (memory DB, outbox mail).

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const ORIGIN = { origin: BASE };
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

async function magicLink(ctx: APIRequestContext, email: string, extra: Record<string, unknown> = {}) {
  const r = await ctx.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app", ...extra }, headers: { ...ORIGIN, "x-altcha": await altchaHeader(ctx) } });
  expect(r.status(), await r.text()).toBe(200);
  const box = await (await ctx.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  return /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0];
}

interface Account { ctx: APIRequestContext; email: string; orgId: string; userId: string }

async function account(label: string, opts: { org?: boolean } = {}): Promise<Account> {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const email = `${label}+${uniq()}@studio.test`;
  const link = await magicLink(ctx, email);
  const v = await ctx.get(link, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(v.status());
  const me = await (await ctx.get("/api/auth/get-session")).json();
  let orgId = "";
  if (opts.org !== false) {
    const org = await ctx.post("/api/auth/organization/create", { data: { name: `${label} org`, slug: `${label}-${uniq()}` }, headers: ORIGIN });
    orgId = (await org.json()).id;
    await ctx.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: ORIGIN });
  }
  return { ctx, email, orgId, userId: me.user.id };
}

async function apiKey(a: Account, environment: "test" | "production" = "test") {
  const r = await a.ctx.post("/api/auth/api-key/create", { data: { name: "k", organizationId: a.orgId, metadata: { environment } }, headers: ORIGIN });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as { key: string; id: string };
}



test("tenant isolation: org B cannot read, change, replay or delete anything of org A", async () => {
  const a = await account("alice");
  const b = await account("bob");

  // A owns a webhook endpoint, a delivery, a company file and a request.
  const ep = await a.ctx.post("/api/webhooks", { data: { url: "https://example.com/hook", events: ["*"] }, headers: ORIGIN });
  expect(ep.status(), await ep.text()).toBe(201);
  const epId = (await ep.json()).endpoint.id as string;
  const ping = await a.ctx.post(`/api/webhooks/${epId}/test`, { headers: ORIGIN });
  const deliveryId = (await ping.json()).delivery.id as string;
  const seeded = await (await a.ctx.post("/api/dev/seed-end-users", { headers: ORIGIN })).json();
  const endUserId = seeded.ids[0] as string;
  const keyA = await apiKey(a);
  const link = await a.ctx.post("/v1/connect-links", { headers: { authorization: `Bearer ${keyA.key}` }, data: { externalId: "acme" } });
  expect(link.status()).toBe(201);
  const { endUserId: linkedId } = await link.json();
  const job = await a.ctx.post("/v1/qbd/customers", { headers: { authorization: `Bearer ${keyA.key}`, "x-end-user-id": linkedId, prefer: "respond-async" }, data: { name: "Secret Customer" } });
  const jobBody = await job.json().catch(() => ({}));
  const requestId = (jobBody.requestId ?? jobBody.id ?? "") as string;

  const keyB = await apiKey(b);
  const asB = { authorization: `Bearer ${keyB.key}` };
  const notOk = (s: number) => s === 401 || s === 403 || s === 404 || s === 400;

  // Dashboard API with B's cookie and A's ids.
  for (const [m, path] of [
    ["patch", `/api/webhooks/${epId}`], ["post", `/api/webhooks/${epId}/test`], ["get", `/api/webhooks/deliveries/${deliveryId}`],
    ["post", `/api/webhooks/deliveries/${deliveryId}/replay`], ["get", `/api/end-users/${endUserId}`], ["post", `/api/end-users/${endUserId}/reconnect`],
    ["delete", `/api/end-users/${endUserId}`], ["get", `/api/end-users/${linkedId}`],
  ] as const) {
    const r = await b.ctx.fetch(path, { method: m.toUpperCase(), headers: ORIGIN, data: m === "patch" ? { url: "https://attacker.example/x" } : undefined });
    expect(notOk(r.status()), `${m} ${path} -> ${r.status()}`).toBe(true);
  }
  // S3: deleting another org's endpoint used to answer {deleted:true} and log a false "webhook.deleted" in B's audit log
  expect((await b.ctx.delete(`/api/webhooks/${epId}`, { headers: ORIGIN })).status()).toBe(404);
  const stillThere = await (await a.ctx.get("/api/webhooks")).json();
  expect(stillThere.endpoints.map((e: { id: string; url: string }) => e.id)).toContain(epId);
  expect(stillThere.endpoints.find((e: { id: string }) => e.id === epId).url).toBe("https://example.com/hook");

  // Lists and exports from B never contain A's rows.
  for (const path of ["/api/webhooks", "/api/webhooks/deliveries", `/api/webhooks/deliveries?endpointId=${epId}`, "/api/audit", "/api/end-users", "/api/requests/export?env=test", "/api/account/export"]) {
    const text = await (await b.ctx.get(path)).text();
    for (const secret of [epId, deliveryId, endUserId, linkedId, a.orgId, "Secret Customer"]) expect(text, `${path} leaks ${secret}`).not.toContain(secret);
  }

  // Public API with B's key and A's ids.
  for (const [m, path, headers] of [
    ["GET", `/v1/requests/${requestId || "req_x"}`, {}], ["DELETE", `/v1/end-users/${linkedId}`, {}],
    ["GET", "/v1/qbd/customers", { "x-end-user-id": linkedId }], ["POST", "/v1/connect-links", {}],
  ] as const) {
    const r = await b.ctx.fetch(path, { method: m, headers: { ...asB, ...headers }, data: m === "POST" ? { externalId: "acme" } : undefined });
    if (path === "/v1/connect-links") {
      // same externalId in another org is a different file, never A's
      expect((await r.json()).endUserId).not.toBe(linkedId);
    } else expect(notOk(r.status()), `${m} ${path} -> ${r.status()}`).toBe(true);
  }

  // Better Auth org endpoints with A's org id.
  for (const [path, data] of [
    ["/api/auth/organization/set-active", { organizationId: a.orgId }],
    ["/api/auth/api-key/create", { name: "x", organizationId: a.orgId, metadata: { environment: "production" } }],
    ["/api/auth/organization/invite-member", { email: `evil+${uniq()}@studio.test`, role: "owner", organizationId: a.orgId }],
    ["/api/auth/organization/update", { data: { name: "pwned" }, organizationId: a.orgId }],
    ["/api/auth/api-key/delete", { keyId: keyA.id }],
    ["/api/auth/organization/delete", { organizationId: a.orgId }],
  ] as const) {
    const r = await b.ctx.post(path, { data, headers: ORIGIN });
    expect(r.status(), `${path} -> ${r.status()} ${await r.text()}`).toBeGreaterThanOrEqual(400);
  }
  const full = await b.ctx.get(`/api/auth/organization/get-full-organization?organizationId=${a.orgId}`);
  expect(await full.text()).not.toContain(a.email);
  const keys = await b.ctx.get(`/api/auth/api-key/list?organizationId=${a.orgId}`);
  expect(await keys.text()).not.toContain(keyA.id);
  // A's key still works.
  expect((await a.ctx.get("/v1/qbd/customers", { headers: { authorization: `Bearer ${keyA.key}`, "x-end-user-id": linkedId, prefer: "respond-async" } })).status()).toBeLessThan(500);
});

test("roles: a viewer or member cannot escalate, mint keys, manage webhooks or billing", async () => {
  const owner = await account("owner");
  const invitee = await account("member", { org: false });
  const inv = await owner.ctx.post("/api/auth/organization/invite-member", { data: { email: invitee.email, role: "member", organizationId: owner.orgId }, headers: ORIGIN });
  expect(inv.status(), await inv.text()).toBe(200);
  const invitationId = (await inv.json()).id as string;
  const acc = await invitee.ctx.post("/api/auth/organization/accept-invitation", { data: { invitationId }, headers: ORIGIN });
  expect(acc.status(), await acc.text()).toBe(200);
  await invitee.ctx.post("/api/auth/organization/set-active", { data: { organizationId: owner.orgId }, headers: ORIGIN });
  const members = (await (await owner.ctx.get("/api/auth/organization/get-full-organization")).json()).members as { id: string; userId: string; role: string }[];
  const self = members.find((m) => m.userId === invitee.userId)!;
  const ownerMember = members.find((m) => m.userId === owner.userId)!;

  for (const [path, data] of [
    ["/api/auth/organization/update-member-role", { memberId: self.id, role: "owner" }],
    ["/api/auth/organization/update-member-role", { memberId: self.id, role: "admin" }],
    ["/api/auth/organization/remove-member", { memberIdOrEmail: ownerMember.id }],
    ["/api/auth/api-key/create", { name: "x", organizationId: owner.orgId, metadata: { environment: "production" } }],
    ["/api/auth/organization/invite-member", { email: `x+${uniq()}@studio.test`, role: "owner" }],
    ["/api/webhooks", { url: "https://example.com/x", events: ["*"] }],
    ["/api/billing/checkout", { plan: "volume", interval: "month" }],
    ["/api/billing/portal", {}],
    ["/api/settings/retention", { days: 1 }],
    ["/api/admin/suspend", { kind: "org", orgId: owner.orgId, suspended: true }],
  ] as const) {
    const r = await invitee.ctx.post(path, { data, headers: ORIGIN });
    expect(r.status(), `${path} -> ${r.status()} ${await r.text()}`).toBeGreaterThanOrEqual(400);
  }
  const after = (await (await owner.ctx.get("/api/auth/organization/get-full-organization")).json()).members as { userId: string; role: string }[];
  expect(after.find((m) => m.userId === invitee.userId)!.role).toBe("member");
  // Founder admin pages are invisible to customers.
  for (const p of ["/api/admin/overview", "/api/admin/suspend"]) expect([401, 403, 404]).toContain((await invitee.ctx.get(p)).status());
});

test("auth: magic links are single use, bound to expiry, and sign-out kills the session", async () => {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const email = `replay+${uniq()}@studio.test`;
  const link = await magicLink(ctx, email);
  expect([302, 303, 307]).toContain((await ctx.get(link, { maxRedirects: 0 })).status());
  const cookies = (await ctx.storageState()).cookies;
  const session = cookies.find((c) => c.name.endsWith(".session_token"))!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");

  // Replay of the same link from a fresh browser: no session.
  const other = await pwRequest.newContext({ baseURL: BASE });
  await other.get(link, { maxRedirects: 0 });
  expect(await (await other.get("/api/auth/get-session")).json()).toBeNull();

  // Sign out, then reuse the old cookie: no session.
  const stolen = `${session.name}=${session.value}`;
  await ctx.post("/api/auth/sign-out", { headers: ORIGIN, data: {} });
  const replay = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { cookie: stolen } });
  expect(await (await replay.get("/api/auth/get-session")).json()).toBeNull();
});

test("auth: callback and next parameters never redirect off-site", async () => {
  const a = await account("redir");
  for (const next of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/%09/evil.example", "/\n/evil.example", "https://evil.example", "/%5Cevil.example", "/%2F%2Fevil.example"]) {
    for (const page of ["/sign-in", "/onboarding?new=0"]) {
      const sep = page.includes("?") ? "&" : "?";
      const r = await a.ctx.get(`${page}${sep}next=${next.startsWith("/%") ? next : encodeURIComponent(next)}`, { maxRedirects: 0 });
      const loc = r.headers()["location"];
      if (loc) expect(new URL(loc, BASE).origin, `${page} next=${JSON.stringify(next)} -> ${loc}`).toBe(new URL(BASE).origin);
    }
  }
  // Better Auth's own callbackURL check.
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  for (const cb of ["https://evil.example/x", "//evil.example", "/\t/evil.example"]) {
    const email = `cb+${uniq()}@studio.test`;
    const r = await ctx.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: cb }, headers: { ...ORIGIN, "x-altcha": await altchaHeader(ctx) } });
    if (r.status() === 200) {
      const box = await (await ctx.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
      const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0];
      const v = await ctx.get(link, { maxRedirects: 0 });
      const loc = v.headers()["location"] ?? "";
      expect(new URL(loc, BASE).origin, `callbackURL ${JSON.stringify(cb)} -> ${loc}`).toBe(new URL(BASE).origin);
    }
  }
});

test("auth: the magic-link abuse checks cannot be skipped through path tricks", async () => {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  for (const path of ["/api/auth/sign-in/magic-link/", "/api/auth/sign-in/magic%2Dlink", "/api/auth/sign-in/MAGIC-LINK", "/api/auth//sign-in/magic-link", "/api/auth/sign-in/./magic-link", "/api/auth/sign-in/magic-link;x"]) {
    const email = `skip+${uniq()}@studio.test`;
    const r = await ctx.post(path, { data: { email, callbackURL: "/app" }, headers: ORIGIN, maxRedirects: 0 });
    const box = await (await ctx.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    expect(box.messages.length, `${path} -> ${r.status()} sent a link without ALTCHA`).toBe(0);
  }
});

test("CSRF: cookie requests from another origin are refused on every state-changing app route", async () => {
  const a = await account("csrf");
  const evil = { origin: "https://evil.example" };
  for (const [m, path, data] of [
    ["POST", "/api/webhooks", { url: "https://evil.example/x", events: ["*"] }],
    ["DELETE", "/api/account", { confirm: "delete my account" }],
    ["POST", "/api/settings/retention", { days: 7 }],
    ["POST", "/api/billing/portal", {}],
    ["POST", "/api/auth/api-key/create", { name: "x", organizationId: a.orgId }],
    ["POST", "/api/auth/organization/invite-member", { email: `x+${uniq()}@studio.test`, role: "admin" }],
  ] as const) {
    const r = await a.ctx.fetch(path, { method: m, data, headers: evil });
    expect(r.status(), `${m} ${path} -> ${r.status()}`).toBeGreaterThanOrEqual(400);
  }
  expect(await (await a.ctx.get("/api/auth/get-session")).json()).not.toBeNull();
});

test("errors and probes: no stack traces, no internals, no dev endpoints leaking data across users", async () => {
  const anon = await pwRequest.newContext({ baseURL: BASE });
  const h = await (await anon.get("/api/health")).json();
  expect(JSON.stringify(h)).not.toMatch(/mongodb|password|secret|sk_|re_/i);
  for (const p of ["/.env", "/.git/config", "/_next/static/../../.env", "/api/auth/list-sessions", "/api/account/export"]) {
    const r = await anon.get(p);
    expect(r.status(), p).not.toBe(200);
    expect(await r.text(), p).not.toMatch(/BETTER_AUTH_SECRET|at Object\.|node_modules/);
  }
  const bad = await anon.post("/v1/qbd/customers", { headers: { authorization: "Bearer x" }, data: "{" });
  expect(await bad.text()).not.toMatch(/at \w+ \(|node_modules/);
});

test("founder pages: a customer cannot pull the admin page segment with a forged RSC router state", async () => {
  const a = await account("notadmin");
  for (const path of ["/admin", "/admin/abuse"]) {
    const segs = path.split("/").filter(Boolean);
    let tree: unknown = ["__PAGE__", {}];
    for (const s of [...segs].reverse()) tree = [s, { children: tree }];
    const state = JSON.stringify(["", { children: tree }, null, null, true]);
    for (const headers of <Record<string, string>[]>[
      { rsc: "1", "next-router-state-tree": encodeURIComponent(state) },
      { rsc: "1", "next-router-state-tree": encodeURIComponent(state), "next-router-prefetch": "1" },
      { rsc: "1", "next-router-state-tree": encodeURIComponent(state), "next-router-segment-prefetch": `/${segs.join("/")}/__PAGE__` },
    ]) {
      const r = await a.ctx.get(path, { headers, maxRedirects: 0 });
      const text = await r.text();
      expect(text, `${path} ${JSON.stringify(headers)}`).not.toMatch(/Paid organizations|Feature flags|Suspend an organization/);
    }
  }
});

test("invitations: only the invited address can accept, and NoSQL operators in bodies are rejected", async () => {
  const owner = await account("inviter");
  const intended = `intended+${uniq()}@studio.test`;
  const inv = await owner.ctx.post("/api/auth/organization/invite-member", { data: { email: intended, role: "admin", organizationId: owner.orgId }, headers: ORIGIN });
  const invitationId = (await inv.json()).id as string;
  const thief = await account("thief", { org: false });
  const r = await thief.ctx.post("/api/auth/organization/accept-invitation", { data: { invitationId }, headers: ORIGIN });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect((await thief.ctx.post("/api/auth/organization/set-active", { data: { organizationId: owner.orgId }, headers: ORIGIN })).status()).toBeGreaterThanOrEqual(400);

  const key = await apiKey(owner);
  const auth = { authorization: `Bearer ${key.key}` };
  for (const raw of ['{"externalId":{"$ne":null}}', '{"externalId":"x","companyName":{"$gt":""}}', '{"externalId":"x","__proto__":{"admin":true}}', '{"externalId":"x","constructor":{"prototype":{"admin":true}}}']) {
    const res = await owner.ctx.post("/v1/connect-links", { headers: { ...auth, "content-type": "application/json" }, data: raw });
    expect(res.status(), raw).toBe(400);
  }
  for (const data of [{ url: { $ne: "" }, events: ["*"] }, { url: "https://example.com/a", events: [{ $where: "1" }] }]) {
    expect((await owner.ctx.post("/api/webhooks", { data, headers: ORIGIN })).status()).toBe(400);
  }
  expect((await owner.ctx.get(`/v1/requests/${encodeURIComponent('{"$ne":null}')}`, { headers: auth })).status()).toBe(404);
});
