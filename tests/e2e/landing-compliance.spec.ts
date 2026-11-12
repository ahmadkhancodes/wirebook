import { expect, test } from "@playwright/test";

// Landing page against the design library (B5 hero measure, B11 tagline reveal, B10 390px check).

test("hero heading and subheading stay within 680px and the heading reads with its space", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const h1 = page.locator("#hero-title");
  await expect(h1).toHaveText("QuickBooks Desktop, as a normal API");
  for (const el of [h1, page.locator("#hero-title + p")]) {
    const box = await el.boundingBox();
    expect(box!.width).toBeLessThanOrEqual(680);
  }
});

test("tagline words start muted and light up one by one on scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const colours = () => page.$$eval("[data-word]", (els) => els.map((e) => getComputedStyle(e).color));
  const muted = (c: string) => /\/ 0\.3\)|, 0\.3\)/.test(c);
  expect((await colours()).every(muted)).toBe(true);
  // Bring the first line just over the trigger line: some words lit, later ones still muted.
  await page.locator("[data-word]").first().evaluate((e) => {
    const top = e.getBoundingClientRect().top + window.scrollY;
    window.scrollTo(0, top - window.innerHeight * 0.55);
  });
  await page.waitForTimeout(150);
  const partial = await colours();
  expect(partial.some((c) => !muted(c))).toBe(true);
  expect(partial.some(muted)).toBe(true);
  await page.evaluate(() => window.scrollBy(0, 1200));
  await expect.poll(async () => (await colours()).every((c) => c === "rgb(255, 255, 255)")).toBe(true);
});

test("tagline is fully lit at once under reduced motion", async ({ browser }) => {
  const page = await browser.newPage({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  await page.goto("/");
  await expect.poll(() => page.$$eval("[data-word]", (els) => els.every((e) => getComputedStyle(e).color === "rgb(255, 255, 255)"))).toBe(true);
  await page.close();
});

test("no horizontal overflow at 390px on the home, pricing and 404 pages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/pricing", "/no-such-page"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(390);
  }
});
