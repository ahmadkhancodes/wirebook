import { expect, test } from "@playwright/test";
import { signInViaUI, uniq } from "./qa/helpers";

// Marketing pages are static; a signed-in visitor sees the app entry instead of Sign in / signup CTAs.
test("signed out marketing pages show Sign in; signed in pages show Open dashboard and billing CTAs", async ({ page, request }) => {
  const header = page.getByRole("banner");
  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Open dashboard" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" })).toBeVisible();

  await signInViaUI(page, request, `session+${uniq()}@studio.test`);

  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header.getByRole("link", { name: "Open dashboard" })).toHaveAttribute("href", "/app");
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open dashboard" }).nth(1)).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a free API key" })).toHaveCount(0);

  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Choose Production" })).toHaveAttribute("href", /\/app\/billing\?plan=production/);
});
