import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { FakeCompanyFile, QbwcSimulator } from "../../tools/simulate-qbwc/simulator";

test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

// M3: end-user dashboard with live status, the health timeline, the reconnect link, and the billing usage panel. Simulator only.
const OUT = process.env.QA_DIR ?? "docs/qa";

test("end users list polls live, detail shows the health timeline and mints a reconnect link; billing shows files and cost", async ({ page, request, baseURL }) => {
  const email = `m3+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor3-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "m3", organizationId: orgId, metadata: { environment: "test" } }, headers: origin })).json()).key as string;
  const auth = { authorization: `Bearer ${key}` };

  // empty state
  await page.goto("/app/end-users");
  await expect(page.getByRole("heading", { name: "No test company files yet" })).toBeVisible();

  // a live update: the page is open as Pending, then the Web Connector syncs and the row turns Connected without a reload
  const link = await request.post("/v1/connect-links", { headers: auth, data: { externalId: "live-co", companyName: "Live Co" } });
  const { url } = await link.json();
  const token = url.split("/connect/")[1];
  await page.goto("/app/end-users");
  const row = page.getByRole("row", { name: /Live Co/ });
  await expect(row.getByText("Pending")).toBeVisible();
  await page.goto(`/connect/${token}`);
  const qwcText = await (await request.get(`/connect/${token}/wirebook.qwc`)).text();
  const username = /<UserName>(.*)<\/UserName>/.exec(qwcText)![1]!;
  const password = (await page.locator("code").first().textContent())!;
  await page.goto("/app/end-users");
  await expect(row.getByText("Pending")).toBeVisible();
  const sim = new QbwcSimulator(async (xml) => {
    const r = await request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, { user: username, pass: password }, new FakeCompanyFile());
  expect((await sim.runSession()).exchanges).toBe(1);
  await expect(row.getByText("Connected")).toBeVisible({ timeout: 15_000 });

  // one file per status
  expect((await page.request.post("/api/dev/seed-end-users")).ok()).toBeTruthy();
  await page.goto("/app/end-users");
  for (const s of ["Connected", "Asleep", "Broken", "Pending"]) await expect(page.getByRole("table").getByText(s, { exact: true }).first()).toBeVisible();
  await shoot(page, "end-users");

  // detail with the health timeline and the reconnect link
  await page.getByRole("link", { name: "Lumber Yard Co" }).click();
  await expect(page.getByRole("heading", { name: "Health timeline" })).toBeVisible();
  await expect(page.getByText("First sync completed")).toBeVisible();
  await page.getByRole("button", { name: "Send reconnect link" }).click();
  await expect(page.getByText("Reconnect link created")).toBeVisible();
  await expect(page.getByText(/\/connect\/[A-Za-z0-9_-]{20,}/)).toBeVisible();
  await shoot(page, "end-user-detail");

  // billing: usage and cost of active files
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { name: /Active company files/ })).toBeVisible();
  await expect(page.getByTestId("projected-cost")).toHaveText("$0");
  await shoot(page, "billing-files");

  // data retention setting
  await page.goto("/app/settings/data");
  await page.getByLabel("Days to keep payloads").fill("7");
  await page.getByRole("button", { name: "Save retention" }).click();
  await expect(page.getByText("Bodies are now removed after 7 days.")).toBeVisible();
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
