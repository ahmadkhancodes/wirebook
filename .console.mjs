import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const p = await b.newPage();
p.on("console", (m) => { if (["error", "warning"].includes(m.type())) console.log(m.type(), m.text().slice(0, 400)); });
await p.goto("http://localhost:3100" + process.argv[2], { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
await b.close();
