// usage: node .appshot.mjs <outdir> [seed=1|0] routes...
import { chromium } from "playwright";
const [out, seed, ...routes] = process.argv.slice(2);
const BASE = "http://localhost:3100";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}` } });
const page = await ctx.newPage();
const FULL = process.env.FULL === "1";
const email = `shot${Date.now().toString(36)}@example.com`;
await page.goto("/sign-in");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Email me a sign-in link" }).click();
await page.getByText(`Check your inbox at ${email}`).waitFor({ timeout: 60000 });
const box = await (await ctx.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)[0];
await page.goto(link);
await page.waitForURL(/\/onboarding/);
if (routes.includes("/onboarding")) { await page.screenshot({ path: `${out}/onboarding-1440.png` }); }
await page.getByLabel("Organization name").fill("Harlan Mechanical Software");
await page.getByRole("button", { name: "Create organization" }).click();
await page.waitForURL(/\/app/);
if (routes.includes("/app-empty")) { await page.waitForTimeout(800); await page.screenshot({ path: `${out}/app-empty-1440.png` }); await page.setViewportSize({ width: 375, height: 812 }); await page.waitForTimeout(400); await page.screenshot({ path: `${out}/app-empty-375.png` }); await page.setViewportSize({ width: 1440, height: 900 }); }
if (seed === "1") { await page.request.post("/api/dev/seed-requests"); await page.request.post("/api/dev/seed-end-users"); }
for (const r of routes.filter((x) => !["/onboarding", "/app-empty"].includes(x))) {
  for (const w of [1440, 375]) {
    await page.setViewportSize({ width: w, height: w < 800 ? 812 : 900 });
    if (r === "/app-detail") { await page.goto("/app", { waitUntil: "networkidle" }); await page.locator("tbody a").nth(3).click(); await page.waitForURL(/req=/); await page.waitForLoadState("networkidle"); }
    else await page.goto(r, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const name = r.replace(/^\//, "").replace(/\//g, "_") || "root";
    await page.screenshot({ path: `${out}/app-${name}-${w}.png`, fullPage: FULL });
  }
}
console.log("ok");
await b.close();
