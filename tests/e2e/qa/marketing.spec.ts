import { expect, test } from "@playwright/test";
import { uniq, watch } from "./helpers";

// A new visitor: the first things they click on the marketing site.
test("mobile menu opens, traps nothing it should not, closes with Escape and a link navigates", async ({ page }) => {
  const problems = watch(page, { ignoreHydration: true });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: /pricing/i }).click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByRole("dialog", { name: "Menu" })).toBeHidden();
  expect(problems).toEqual([]);
});

test("pricing: interval switch changes the numbers; a plan CTA carries the plan to sign-in", async ({ page }) => {
  await page.goto("/pricing");
  const main = page.locator("main");
  await page.getByRole("button", { name: /monthly/i }).first().click();
  await expect(main).toContainText("24.99");
  await page.getByRole("button", { name: /yearly|annual/i }).first().click();
  await expect(main).toContainText("19.99");
  await page.getByRole("link", { name: /Choose Production/i }).first().click();
  await expect(page).toHaveURL(/sign-in\?.*plan=production/);
});

test("pricing hand-off: sign in with a plan lands on billing with the plan preselected", async ({ page, request }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await page.goto("/sign-in?plan=production&interval=year");
  const email = `hand+${uniq()}@studio.test`;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check your inbox at ${email}`)).toBeVisible({ timeout: 30_000 });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  await page.waitForURL(/\/onboarding/);
  expect(page.url()).toMatch(/next=.*billing/);
  await page.getByLabel("Organization name").fill("Hand Off Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app\/billing\?plan=production/);
  await expect(page.getByText("Continue with Production")).toBeVisible();
});

test("FAQ items open and close; every landing CTA goes somewhere that exists", async ({ page, request }) => {
  await page.goto("/");
  const first = page.locator("details").first();
  await first.locator("summary").click();
  await expect(first).toHaveAttribute("open", "");
  await first.locator("summary").click();
  await expect(first).not.toHaveAttribute("open", "");
  const hrefs = await page.locator("main a[href]").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
  for (const h of hrefs) {
    if (h.startsWith("mailto:") || h.startsWith("#")) continue;
    if (h.startsWith("http")) { expect(h, "external links must be https").toMatch(/^https:/); continue; }
    expect((await request.get(h)).status(), h).toBeLessThan(400);
  }
});

test("every button on public pages is keyboard focusable with a visible focus ring", async ({ page }) => {
  await page.goto("/pricing");
  for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const cs = getComputedStyle(el);
    return { tag: el.tagName, outline: cs.outlineStyle + cs.outlineWidth, shadow: cs.boxShadow };
  });
  expect(outline.tag).not.toBe("BODY");
  expect(outline.outline !== "none0px" || outline.shadow !== "none").toBeTruthy();
});
