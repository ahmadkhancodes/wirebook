import { expect, test, type Page } from "@playwright/test";
import { signInViaUI, uniq, watch } from "../qa/helpers";

// Post-redesign regression audit: every sitemap page plus 404 and every app page, at 375 and 1440.
const PALETTE = new Set([
  "251,253,251", "241,247,242", "226,238,229", "185,207,192", "138,168,151", "106,132,117", "70,96,79", "18,53,36",
  "216,234,221", "169,212,182", "26,92,60", "18,70,45", "255,255,255", "22,104,63", "227,242,231", "122,78,0",
  "251,241,214", "163,36,43", "251,232,231", "244,231,161", "0,0,0",
]);

async function audit(page: Page, tag: string): Promise<string[]> {
  return page.evaluate((palette) => {
    const out: string[] = [];
    const ok = new Set(palette);
    const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3).join(","), a: p[3] ?? 1 }; };
    const seen = new Set<string>();
    if (document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark") out.push("dark class on <html>");
    if (document.documentElement.scrollWidth > window.innerWidth) out.push(`horizontal scroll ${document.documentElement.scrollWidth}>${window.innerWidth}`);
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const label = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
      for (const prop of ["color", "backgroundColor", "borderTopColor", "borderBottomColor"] as const) {
        if (prop.startsWith("border") && cs[prop === "borderTopColor" ? "borderTopWidth" : "borderBottomWidth"] === "0px") continue;
        const c = parse(cs[prop]); if (!c || c.a === 0) continue;
        if (!ok.has(c.rgb)) { const k = `${prop}:${c.rgb}`; if (!seen.has(k)) { seen.add(k); out.push(`off-palette ${prop} rgb(${c.rgb}) on ${label}`); } }
      }
      const ff = cs.fontFamily.toLowerCase();
      if (/inter|geist|roboto|spectral|public sans|archivo|plex/.test(ff)) out.push(`old font ${cs.fontFamily} on ${label}`);
      const direct = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (direct) {
        if (!/\bsr-only\b/.test(String(el.className)) && el.scrollWidth > el.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && !cs.textOverflow.includes("ellipsis")) out.push(`text cut off (overflow hidden) ${label} "${el.textContent!.trim().slice(0, 30)}"`);
        const fs = parseFloat(cs.fontSize); if (fs < 10) out.push(`tiny text ${fs}px ${label}`);
      }
      if (direct && !/\bsr-only\b/.test(String(el.className))) {
        const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]!) + 0.7152 * f(c[1]!) + 0.0722 * f(c[2]!); };
        const fg = parse(cs.color);
        let bg: { rgb: string; a: number } | null = null;
        for (let n: HTMLElement | null = el; n; n = n.parentElement) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b.a > 0.9) { bg = b; break; } }
        if (fg && bg) {
          const a = lum(fg.rgb.split(",").map(Number)), b = lum(bg.rgb.split(",").map(Number));
          const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          const fs = parseFloat(cs.fontSize);
          if (ratio < (fs >= 24 ? 3 : 4.5) && !el.closest("[aria-hidden=true]")) out.push(`low contrast ${ratio.toFixed(2)} (${fg.rgb} on ${bg.rgb}) ${label} "${el.textContent!.trim().slice(0, 25)}"`);
        }
      }
      if (el.matches("button,a[href],[role=button],summary,select,input[type=checkbox],input[type=radio]")) {
        const dis = (el as HTMLButtonElement).disabled;
        if (!dis && cs.cursor !== "pointer") out.push(`no pointer cursor on ${label} "${(el.textContent ?? "").trim().slice(0, 25)}"`);
      }
      if (el.matches("button,a[href],input:not([type=hidden]),select,textarea")) {
        const name = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || (el.textContent ?? "").trim() || (el as HTMLInputElement).labels?.[0]?.textContent || el.getAttribute("title") || el.getAttribute("placeholder");
        if (!name) out.push(`unlabelled ${label}`);
        if ((el as HTMLButtonElement).disabled && !el.getAttribute("aria-describedby") && !el.getAttribute("title") && el.tagName === "BUTTON" && (el as HTMLButtonElement).type !== "submit" /* pristine save buttons are disabled until the form changes */) out.push(`disabled button without reason "${(el.textContent ?? "").trim().slice(0, 30)}"`);
      }
    }
    for (const img of Array.from(document.images)) if (!img.hasAttribute("alt")) out.push(`img without alt ${img.src}`);
    return out;
  }, [...PALETTE]).then((r) => r.map((x) => `${tag}: ${x}`));
}

test("every sitemap page, the 404 and error index: clean at 375 and 1440", async ({ page, request }) => {
  test.setTimeout(600_000);
  const xml = await (await request.get("/sitemap.xml")).text();
  const paths = [...xml.matchAll(/<loc>https?:\/\/[^/]+([^<]*)<\/loc>/g)].map((m) => m[1] || "/");
  paths.push("/nope-not-a-page", "/docs/does-not-exist", "/errors/nope", "/connect/not-a-token", "/sign-in");
  const problems = watch(page, { ignoreHydration: true });
  const issues: string[] = [];
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of paths) {
      const res = await page.goto(p);
      const st = res?.status() ?? 0;
      if (st >= 500) issues.push(`${p}: status ${st}`);
      issues.push(...(await audit(page, `${p} @${width}`)));
    }
  }
  console.log(issues.join("\n"));
  console.log(problems.join("\n"));
  expect(issues).toEqual([]);
  expect(problems).toEqual([]);
});

test("every app page: clean at 375 and 1440", async ({ page, request }) => {
  test.setTimeout(300_000);
  const problems = watch(page);
  await signInViaUI(page, request, `qa2+${uniq()}@studio.test`);
  const issues: string[] = [];
  const paths = ["/app", "/app/end-users", "/app/usage", "/app/billing", "/app/settings/profile", "/app/settings/security", "/app/settings/members", "/app/settings/api-keys", "/app/settings/webhooks", "/app/settings/data", "/app/settings/audit", "/app/requests/req_nope", "/app/end-users/nope", "/onboarding"];
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      issues.push(...(await audit(page, `${p} @${width}`)));
    }
  }
  console.log(issues.join("\n"));
  expect(issues).toEqual([]);
  expect(problems).toEqual([]);
});
