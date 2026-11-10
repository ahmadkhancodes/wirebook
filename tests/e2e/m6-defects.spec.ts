import { expect, test } from "@playwright/test";
import { docs } from "../../src/content/docs";

test("/favicon.ico resolves to a 200", async ({ request }) => {
  const res = await request.get("/favicon.ico");
  expect(res.status()).toBe(200);
});

for (const path of ["/", "/pricing", "/compare/conductor"]) {
  test(`${path} head has og:image and twitter:image`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/opengraph-image/);
    expect(html).toMatch(/<meta name="twitter:image" content="https?:\/\/[^"]+\/opengraph-image/);
  });
}

test("docs pages never scroll horizontally at 375px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/docs", ...docs.map((d) => `/docs/${d.slug}`)]) {
    await page.goto(path);
    const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(sw, path).toBeLessThanOrEqual(iw);
  }
});
