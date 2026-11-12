import { expect, test } from "@playwright/test";
import { altchaHeader } from "./altcha";

// End to end on the memory driver: magic link -> session -> org -> entitlement -> API key -> cron guard.
test("magic link sign-in, org, billing state, api key, cron guard", async ({ page, request, baseURL }) => {
  const email = `e2e+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };

  const start = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { ...origin, "x-altcha": await altchaHeader(request) } });
  expect(start.ok()).toBeTruthy();

  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  expect(link).toBeTruthy();
  await page.goto(link!);

  const session = await (await page.request.get("/api/auth/get-session")).json();
  expect(session.user.email).toBe(email);

  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor-${Date.now()}` }, headers: origin });
  expect(org.ok()).toBeTruthy();
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });

  const ent = await (await page.request.get("/api/billing/entitlement")).json();
  expect(ent.plan.id).toBe("free");

  // CSRF: a cookie-authenticated POST from a foreign origin is refused
  const csrf = await page.request.post("/api/billing/portal", { headers: { origin: "https://evil.test" } });
  expect(csrf.status()).toBe(403);

  // Stub mode: checkout without Stripe answers 503 billing_unavailable (calm UI notice), never 500
  const co = await page.request.post("/api/billing/checkout", { data: { plan: "production", interval: "year" }, headers: origin });
  expect([200, 503]).toContain(co.status());

  const key = await page.request.post("/api/auth/api-key/create", { data: { name: "ci", organizationId: orgId }, headers: origin });
  expect(key.ok()).toBeTruthy();
  const apiKey = (await key.json()).key as string;
  const me = await request.get("/api/v1/me", { headers: { "x-api-key": apiKey } });
  expect(await me.json()).toEqual({ orgId });
  expect((await request.get("/api/v1/me", { headers: { "x-api-key": "nope" } })).status()).toBe(401);

  expect((await request.post("/api/cron/heartbeat")).status()).toBe(401);
  expect((await request.post("/api/cron/heartbeat", { headers: { authorization: "Bearer e2e-cron" } })).ok()).toBeTruthy();

  const exp = await page.request.get("/api/account/export");
  expect((await exp.json()).user.email).toBe(email);
});

test("public pages render with metadata and no horizontal overflow at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/pricing", "/compare/conductor", "/docs", "/docs/errors", "/legal/privacy", "/sign-in"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("title")).not.toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
  expect((await page.goto("/nope-404"))?.status()).toBe(404);
  expect((await page.request.get("/api/health")).ok()).toBeTruthy();
  expect(await (await page.request.get("/llms.txt")).text()).toContain("Wirebook");
});

test("landing shows the request log ledger, the dated benchmark and the Intuit notice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("QuickBooks Desktop");
  const log = page.getByRole("group", { name: "Example request log" });
  await expect(log).toContainText("example");
  await expect(log).toContainText("outcome unknown");
  await expect(page.getByText("checked 3 Nov 2026").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a free API key" }).first()).toHaveAttribute("href", "/sign-in");
  await expect(page.getByRole("contentinfo")).toContainText("not affiliated with or endorsed by Intuit");
  expect((await page.goto("/compare/web3forms"))?.status()).toBe(404);
});

test("pricing derives every figure from the plan config", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByText("$19.99").first()).toBeVisible();
  await page.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByText("$24.99").first()).toBeVisible();
  await expect(page.getByText("$97.99").first()).toBeVisible();
  await expect(page.getByText("$249.90").first()).toBeVisible();
});
