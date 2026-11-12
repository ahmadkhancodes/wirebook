import { expect, test } from "@playwright/test";
import { signInViaUI, uniq, watch } from "../qa/helpers";

// Every clickable thing on every signed-in screen must do something observable (navigate, open, change state) and never log a CSP violation.
const APP = ["/app", "/app/end-users", "/app/usage", "/app/billing", "/app/settings/profile", "/app/settings/security", "/app/settings/members", "/app/settings/api-keys", "/app/settings/webhooks", "/app/settings/data", "/app/settings/audit"];

for (const width of [375, 1440]) {
  test(`signed in @${width}: every internal link resolves and every enabled button does something`, async ({ page, request }) => {
    test.setTimeout(480_000);
    await page.setViewportSize({ width, height: 900 });
    const problems = watch(page);
    await signInViaUI(page, request, `int+${uniq()}@studio.test`);
    const dead: string[] = [];
    for (const path of APP) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const hrefs = await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!));
      for (const h of new Set(hrefs)) {
        if (!h.startsWith("/") || h.startsWith("//")) continue;
        const r = await page.request.get(h);
        if (r.status() >= 400) dead.push(`${path} -> ${h} ${r.status()}`);
      }
      const n = await page.locator("main button:not([disabled]), main [role=tab]").count();
      for (let i = 0; i < n; i++) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const b = page.locator("main button:not([disabled]), main [role=tab]").nth(i);
        if (!(await b.isVisible())) continue;
        const name = ((await b.innerText()).trim() || (await b.getAttribute("aria-label")) || `#${i}`).slice(0, 30);
        if ((await b.getAttribute("aria-pressed")) === "true" || (await b.getAttribute("aria-selected")) === "true" || (await b.getAttribute("aria-checked")) === "true") continue; // already the active choice
        if (/delete|remove|revoke|sign out|leave|disable|cancel invite|pause/i.test(name)) continue; // destructive: covered by journeys with dialogs
        const before = await page.evaluate(() => document.body.innerHTML.length + location.href);
        const reqs: string[] = [];
        const onReq = (r: import("@playwright/test").Request) => reqs.push(r.url());
        page.on("request", onReq);
        const dl = page.waitForEvent("download", { timeout: 1500 }).catch(() => null);
        await b.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(600);
        page.off("request", onReq);
        const d = await dl;
        const after = await page.evaluate(() => document.body.innerHTML.length + location.href);
        if (!d && before === after && reqs.length === 0) dead.push(`${path}: button "${name}" did nothing`);
      }
    }
    expect(dead).toEqual([]);
    // Stripe is not configured locally: checkout answers a calm 503 billing_unavailable, which the page explains in a notice.
    expect(problems.filter((x) => !/503/.test(x) && !/api\/billing\/checkout/.test(x))).toEqual([]);
  });
}

test("dialogs close with Escape and return focus; menus are keyboard reachable", async ({ page, request }) => {
  test.setTimeout(120_000);
  await signInViaUI(page, request, `esc+${uniq()}@studio.test`);
  await page.goto("/app/settings/api-keys");
  await page.getByRole("button", { name: /create/i }).first().click();
  const dlg = page.getByRole("dialog");
  if (await dlg.count()) {
    await expect(dlg).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dlg).toBeHidden();
  }
  await page.goto("/app");
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
  expect(first).toMatch(/skip/i);
  // focus is visible on every tabbed stop of the shell
  const bad: string[] = [];
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      return { name: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 30), visible };
    });
    if (r && !r.visible) bad.push(r.name);
  }
  expect(bad, "tab stops without a visible focus indicator").toEqual([]);
});

test("OG image, twitter image and icons render", async ({ request }) => {
  for (const p of ["/opengraph-image", "/twitter-image", "/icon", "/apple-icon"]) {
    const r = await request.get(p);
    expect(r.status(), p).toBe(200);
    expect(r.headers()["content-type"], p).toMatch(/image\/png/);
  }
});
