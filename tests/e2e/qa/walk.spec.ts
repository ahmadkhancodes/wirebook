import { expect, test } from "@playwright/test";
import { signInViaUI, uniq, watch } from "./helpers";

const PUBLIC = ["/", "/pricing", "/docs", "/docs/errors", "/errors", "/compare/conductor", "/legal/privacy", "/legal/terms", "/sign-in"];
const APP = [
  "/app", "/app/end-users", "/app/usage", "/app/billing", "/app/settings/profile", "/app/settings/security",
  "/app/settings/members", "/app/settings/api-keys", "/app/settings/webhooks", "/app/settings/data", "/app/settings/audit",
];

{
  for (const width of [375, 1440]) {
    test(`signed out: every public page is clean, no overflow, links resolve (${width})`, async ({ page, request }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      const problems = watch(page, { ignoreHydration: true });
      const hrefs = new Set<string>();
      for (const path of PUBLIC) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBeLessThan(400);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow ${path}`).toBeLessThanOrEqual(0);
        for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
          if (h.startsWith("/") && !h.startsWith("//")) hrefs.add(h.split("#")[0]!);
        }
      }
      for (const h of hrefs) {
        if (!h) continue;
        const r = await request.get(h, { maxRedirects: 5 });
        expect(r.status(), `link ${h}`).toBeLessThan(400);
      }
      expect(problems).toEqual([]);
    });
  }
}

test("signed out: /app and settings redirect to sign-in with a way back", async ({ page }) => {
  for (const p of APP) {
    await page.goto(p);
    await expect(page, p).toHaveURL(/\/sign-in/);
  }
  const r = await page.request.get("/api/account/export");
  expect([401, 403]).toContain(r.status());
});

test("signed in: every app page is clean, labelled, 44px targets, no overflow (mobile + desktop, light)", async ({ page, request }) => {
  test.setTimeout(240_000);
  const problems = watch(page);
  await signInViaUI(page, request, `walk+${uniq()}@studio.test`);
  const issues: string[] = [];
  {
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of APP) {
        const res = await page.goto(path);
        expect(res?.status(), path).toBeLessThan(400);
        await expect(page.locator("h1").first()).toBeVisible();
        const tag = `${path} ${width}`;
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 0) issues.push(`overflow ${tag}`);
        const bad = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>("button, a[href], [role=button], input:not([type=hidden]), select, textarea")) {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || r.width <= 1 || r.height <= 1 && el.matches("[class*=sr-only], [href^=\"#\"]")) continue;
            const name = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute("title") || "").trim();
            const labelled = (el as HTMLInputElement).labels?.length || el.getAttribute("aria-labelledby");
            if (!name && !labelled) out.push(`unlabelled <${el.tagName.toLowerCase()}>`);
            const inline = el.tagName === "A" && el.closest("p, li, span, td") && !el.closest("nav");
            if (window.innerWidth < 500 && !inline && (el as HTMLInputElement).type !== "checkbox" && r.height < 43.5) out.push(`small(${Math.round(r.height)}px) ${name.slice(0, 30)}`);
            if (el.tagName !== "INPUT" && cs.cursor !== "pointer" && !(el as HTMLButtonElement).disabled && el.tagName !== "TEXTAREA" && el.tagName !== "SELECT") out.push(`cursor ${cs.cursor} ${name.slice(0, 30)}`);
          }
          return out;
        });
        for (const b of new Set(bad)) issues.push(`${b} @ ${tag}`);
      }
    }
  }
  expect(issues).toEqual([]);
  expect(problems).toEqual([]);
});
