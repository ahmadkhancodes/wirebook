// usage: node .shot.mjs <outdir> <width> <path> [slices] [cookie]
import { chromium } from "playwright";
const [out, w, path, slices = "1", cookie] = process.argv.slice(2);
const width = +w, h = width < 800 ? 812 : 900;
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const ctx = await b.newContext({ viewport: { width, height: h } });
if (cookie) await ctx.addCookies(JSON.parse(cookie));
const p = await ctx.newPage();
await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); } window.scrollTo(0, 0); });
await p.waitForTimeout(500);
const name = path === "/" ? "home" : path.slice(1).replace(/\//g, "_");
const total = await p.evaluate(() => document.documentElement.scrollHeight);
const n = slices === "all" ? Math.ceil(total / h) : +slices;
for (let i = 0; i < n; i++) {
  await p.evaluate((y) => window.scrollTo(0, y), i * h); await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/${name}-${width}-${i}.png` });
}
console.log(name, width, "height", total, "slices", n);
await b.close();
