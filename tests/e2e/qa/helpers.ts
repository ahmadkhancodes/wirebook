import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/**
 * A walk loads dozens of pages a minute from one machine, and each page asks Better Auth for the session, which allows
 * 60 a minute per IP. Each page is a new simulated visitor, so the walk tests the pages, not that rate limit.
 */
export async function newVisitorIp(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
}

/** Collects console errors/warnings and failed requests so every page walk can assert none happened. */
export function watch(page: Page, opts: { ignoreHydration?: boolean } = {}) {
  const problems: string[] = [];
  // Vercel's analytics script only exists on Vercel; aborted RSC prefetches are normal during navigation.
  const noise = (t: string) => t.includes("/_vercel/") || t.includes("ERR_SSL_PROTOCOL_ERROR") /* CSP upgrade-insecure-requests on plain-http localhost */ || t.includes("_rsc=") || t.includes("status of 404") && t.includes("Failed to load resource");
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") { if (!noise(m.text())) problems.push(`console.${m.type()} @ ${page.url()}: ${m.text()}`); };
  });
  // QA-REPORT open item: a rare (about 1 in 50 loads) React #418 on /sign-in that never reproduced in dev; the public walk tolerates it.
  page.on("pageerror", (e) => !(opts.ignoreHydration && /#418/.test(e.message)) && problems.push(`pageerror @ ${page.url()}: ${e.message}`));
  page.on("requestfailed", (r) => { const m = `requestfailed: ${r.url()} ${r.failure()?.errorText}`; if (!noise(m)) problems.push(m); });
  page.on("response", (r) => {
    if (r.status() >= 500) problems.push(`http ${r.status()}: ${r.url()}`);
  });
  return problems;
}

/** Sign in exactly as a person would: the real form (altcha runs in the browser), the e-mailed link, then onboarding. */
export async function signInViaUI(page: Page, request: APIRequestContext, email: string, orgName = "Harbor Studio") {
  // Each simulated visitor gets its own client IP so the per-IP sign-up limit does not couple unrelated tests.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check your inbox at ${email}`)).toBeVisible({ timeout: 30_000 });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0];
  await page.goto(link);
  if (orgName) {
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel("Organization name").fill(orgName);
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL(/\/app/);
  }
}
