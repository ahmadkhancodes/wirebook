import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { altchaHeader } from "./altcha";

test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

// M4: the new dashboard pages (request detail with copy as curl, company file sync history, usage charts, webhooks)
// and the sign-in form with its ALTCHA check. Simulator only, no deploy.
const OUT = process.env.QA_DIR ?? "docs/qa";

test("sign-in form solves ALTCHA and refuses a throwaway address", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("someone@mailinator.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Throwaway email domains are not accepted/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Email").fill(`m4+${Date.now()}@studio.test`);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Check your inbox at/)).toBeVisible({ timeout: 30_000 });
});

test("request detail, company file history, usage charts and webhooks", async ({ page, request, baseURL }) => {
  const email = `m4b+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  const sent = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { ...origin, "x-altcha": await altchaHeader(request) } });
  expect(sent.status(), await sent.text()).toBe(200);
  const outbox = async () => ((await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages ?? []) as { text: string }[];
  await expect.poll(async () => (await outbox()).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const box = { messages: await outbox() };
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)!.text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor4-${Date.now()}` }, headers: origin });
  const orgId = (await org.json()).id;
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: orgId }, headers: origin });

  // request detail: copy as curl, body and result
  expect((await page.request.post("/api/dev/seed-requests")).ok()).toBeTruthy();
  await page.goto("/app");
  await page.getByRole("link", { name: /open request/i }).first().click();
  await expect(page.getByRole("button", { name: "Copy as curl" })).toBeVisible();
  await expect(page.getByText("Copy request id")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open company file" })).toBeVisible();
  await shoot(page, "request-detail");

  // company file page with its sync history
  await page.request.post("/api/dev/seed-end-users");
  await page.goto("/app/end-users");
  await page.getByRole("link", { name: "Lumber Yard Co" }).click();
  await expect(page.getByRole("heading", { name: "Sync history" })).toBeVisible();
  await shoot(page, "company-file");

  // usage: SVG charts (no chart library) with the numbers as a table
  await page.goto("/app/usage");
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Requests per day/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Active files per month/ })).toBeVisible();
  await page.getByText("Show the numbers").first().click();
  await expect(page.getByRole("table", { name: "Requests per day" })).toBeVisible();
  await shoot(page, "usage");

  // webhooks: environment, events with descriptions, a test delivery with its body and replay
  await page.goto("/app/settings/webhooks");
  await expect(page.getByLabel("Environment")).toBeVisible();
  await expect(page.getByText("request.completed")).toBeVisible();
  await expect(page.getByText("company_file.broken")).toBeVisible();
  await expect(page.getByText("usage.threshold_reached")).toBeVisible();
  await page.getByLabel("Endpoint URL").fill("https://example.com/hooks/wirebook");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText("example.com/hooks/wirebook").first()).toBeVisible();
  await shoot(page, "webhooks");
});

async function shoot(page: import("@playwright/test").Page, name: string) {
  mkdirSync(OUT, { recursive: true });
  {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${name} ${width} overflow`).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
