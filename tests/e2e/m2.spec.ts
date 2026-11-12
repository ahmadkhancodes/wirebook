import { expect, test } from "@playwright/test";
import { altchaHeader } from "./altcha";
import { mkdirSync } from "node:fs";
import { FakeCompanyFile, QbwcSimulator } from "../../tools/simulate-qbwc/simulator";

// Windows user agent: the connect page shows the "open on the QuickBooks computer" notice on anything else
test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

// M2: the hosted connect page and the request log, against the Web Connector simulator (no real QuickBooks).
const OUT = process.env.QA_DIR ?? "docs/qa";

test("connect flow turns green only as the server observes each step; request log renders", async ({ page, request, baseURL }) => {
  const email = `m2+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { ...origin, "x-altcha": await altchaHeader(request) } });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "m2", organizationId: orgId, metadata: { environment: "test" } }, headers: origin })).json()).key as string;
  const auth = { authorization: `Bearer ${key}` };

  // an empty log first: the empty state
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "No test requests yet" })).toBeVisible();

  // connect link, then the hosted page
  const link = await request.post("/v1/connect-links", { headers: auth, data: { externalId: "acme-42", companyName: "Acme Builders" } });
  expect(link.status()).toBe(201);
  const { url, endUserId } = await link.json();
  const token = url.split("/connect/")[1];
  await page.goto(`/connect/${token}`);
  await expect(page.getByRole("heading", { name: "Connect Acme Builders" })).toBeVisible();
  await expect(page.getByText("Seen by Wirebook")).toHaveCount(0);
  await shoot(page, "connect-start");

  // step 1: only the server serving the .qwc turns it green
  const qwc = await request.get(`/connect/${token}/wirebook.qwc`);
  expect(qwc.status()).toBe(200);
  expect(await qwc.text()).toContain("<QBWCXML>");
  await expect(page.getByText("Seen by Wirebook")).toHaveCount(1, { timeout: 10_000 });

  // steps 2 to 4: the simulator speaks real Web Connector SOAP to /qbwc over HTTP
  const qwcText = await (await request.get(`/connect/${token}/wirebook.qwc`)).text();
  const username = /<UserName>(.*)<\/UserName>/.exec(qwcText)![1]!;
  const password = (await page.locator("code").first().textContent())!;
  const sim = new QbwcSimulator(async (xml) => {
    const r = await request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, { user: username, pass: password }, new FakeCompanyFile());
  expect((await sim.runSession()).exchanges).toBe(1);
  await expect(page.getByRole("heading", { name: "You are connected" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Seen by Wirebook")).toHaveCount(4);
  await shoot(page, "connect-done");

  // single use: the link is closed after the first sync
  await page.reload();
  await expect(page.getByRole("heading", { name: "This link was already used" })).toBeVisible();
  expect((await request.get(`/connect/${token}/wirebook.qwc`)).status()).toBe(410);
  expect((await page.goto("/connect/does-not-exist-does-not-exist"))?.status()).toBe(404);

  // request log with a realistic mix, then the detail pane of a failed request
  expect((await page.request.post("/api/dev/seed-requests")).ok()).toBeTruthy();
  await page.goto("/app");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("table").getByText("Outcome unknown")).toBeVisible();
  await page.goto("/app?state=failed");
  const open = page.getByRole("link", { name: /open request/i }).first();
  await open.click();
  await expect(page.getByRole("alert").filter({ hasText: "duplicate_name" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await page.goto("/app?q=req_nothing");
  await expect(page.getByRole("heading", { name: "No requests match" })).toBeVisible();
  await page.goto("/app?env=production");
  await expect(page.getByRole("heading", { name: "No production requests yet" })).toBeVisible();
  await page.goto("/app?state=failed");
  await page.getByRole("link", { name: /open request/i }).first().click();
  await page.waitForURL(/req=/);
  const picked = new URL(page.url()).searchParams.get("req")!;
  await page.goto(`/app?req=${picked}`);
  await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
  await shoot(page, "request-log");

  // REST through the real endpoint: a queued request answers 202 with a request id when async is preferred
  const q = await request.post("/v1/qbd/customers", { headers: { ...auth, "x-end-user-id": endUserId, prefer: "respond-async" }, data: { name: "Async Co" } });
  expect(q.status()).toBe(202);
  expect((await request.get("/errors/3140")).status()).toBe(200);
  void orgId;
});

async function shoot(page: import("@playwright/test").Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.emulateMedia({ colorScheme: theme });
      await page.evaluate((t) => { try { localStorage.setItem("theme", t); document.documentElement.dataset.theme = t; } catch {} }, theme);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} ${width} ${theme} overflow`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}/${name}-${width}-${theme}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
}
