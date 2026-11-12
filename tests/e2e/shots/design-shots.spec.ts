import { test, type Page } from "@playwright/test";
import { signInViaUI, uniq } from "../qa/helpers";

// Design review shots (docs/qa/design/), light only. Run on demand:
// SHOTS=1 npx playwright test tests/e2e/shots   (SHOTS_DIR to write elsewhere, SHOTS_PARTS=1 for 1000px slices)
test.skip(!process.env.SHOTS, "design shots run on demand");
const widths = [1440, 375];
const out = process.env.SHOTS_DIR ?? "docs/qa/design";
const nameOf = (path: string) => (path === "/" ? "home" : path.slice(1).replaceAll("/", "_"));

async function shoot(page: Page, path: string, name = nameOf(path)) {
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.goto(path);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Walk the page once so every scroll reveal has fired before the full-page shot.
    for (let y = 0; y < 30_000; y += 500) {
      await page.evaluate((v) => window.scrollTo(0, v), y);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: true });
    if (process.env.SHOTS_PARTS) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const step = w > 800 ? 1000 : 1400;
      for (let y = 0, i = 0; y < h; y += step, i++) await page.screenshot({ path: `${out}/parts/${name}-${w}-${i}.png`, fullPage: true, clip: { x: 0, y, width: w, height: Math.min(step, h - y) } });
    }
  }
}

for (const path of ["/", "/pricing", "/compare/conductor", "/docs", "/docs/getting-started", "/errors/3140", "/sign-in"]) {
  test(`shot ${path}`, async ({ page }) => shoot(page, path));
}

test("shot signed-in screens", async ({ page, request }) => {
  test.setTimeout(180_000);
  await signInViaUI(page, request, `shots-${uniq()}@example.com`);
  await shoot(page, "/app", "app-requests");
  for (const path of ["/app/end-users", "/app/usage", "/app/billing", "/app/settings/api-keys", "/app/settings/members", "/app/settings/webhooks"]) await shoot(page, path);
});
