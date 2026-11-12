import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { FakeCompanyFile, QbwcSimulator } from "../../tools/simulate-qbwc/simulator";
import { signInViaUI, uniq, watch } from "./qa/helpers";

// Persona walk-throughs (docs/QA-REPORT.md "Usefulness pass"), through the real UI of the production build.
// Priya: founding engineer at a field-service SaaS, day 1 to first value with a click budget.
// Marcus: integrations PM at a spend platform, day 2 invites a teammate who has no account yet.
// Dana: engineering lead moving off legacy middleware, day 7 hits the Developer file limit and goes to pay.

test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

/** Counts the clicks a persona makes, so "fewer steps to first value" is a number the test holds us to. */
function clicks(page: Page) {
  let n = 0;
  const click = async (name: string | RegExp, role: "link" | "button" = "button") => {
    n++;
    await page.getByRole(role, { name }).first().click();
  };
  return { click, count: () => n };
}

function bash(script: string, env: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn("bash", ["-c", `set -euo pipefail\n${script}`], { env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (c) => (c === 0 ? resolve(out) : reject(new Error(`${script}\n${err}`))));
  });
}

async function simulatorFor(page: Page, request: APIRequestContext, connectUrl: string, file = new FakeCompanyFile(), companyFile?: string) {
  await page.goto(connectUrl);
  const qwc = await (await request.get(`${connectUrl}/wirebook.qwc`)).text();
  const user = /<UserName>(.*)<\/UserName>/.exec(qwc)![1]!;
  const pass = (await page.locator("code").first().textContent())!.trim();
  const sim = new QbwcSimulator(async (xml) => {
    const r = await request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, { user, pass }, file);
  if (companyFile) sim.companyFile = companyFile;
  return sim;
}

test("Priya, day 1: from sign-up to listing a sample file's customers in at most 6 clicks, with commands that run as shown", async ({ page, request }) => {
  test.setTimeout(240_000);
  const problems = watch(page, { ignoreHydration: true });
  await signInViaUI(page, request, `priya+${uniq()}@fieldops.test`, "FieldOps");
  const c = clicks(page);

  const checklist = page.getByRole("region", { name: "Getting started" });
  await expect(checklist.getByText("0 of 3 done")).toBeVisible();

  // Step 1: a key, and the first command is ready to paste with that key in it
  await c.click("Create key", "link");
  await page.getByLabel("Name").fill("Local dev");
  await c.click("Create key");
  const me = (await page.getByTestId("try-me").textContent())!;
  const key = /export WIREBOOK_API_KEY='(sk_[^']+)'/.exec(me)?.[1];
  expect(key, me).toBeTruthy();
  expect(JSON.parse(await bash(me.replace(/\\\n/g, " ").replace(/^curl /m, "curl -sS ")))).toHaveProperty("orgId");

  // the checklist now knows about the key
  await c.click("Requests", "link");
  await expect(checklist.getByText("1 of 3 done")).toBeVisible();

  // Step 2: a company file from the dashboard, no terminal needed
  await c.click("Add company file", "link");
  await expect(page).toHaveURL(/\/app\/end-users\?env=test#add/);
  await page.getByLabel("Your id for this customer").fill("acme-42");
  await page.getByLabel("Company name (optional)").fill("Acme Builders");
  await c.click("Create connect link");
  const url = (await page.getByTestId("connect-url").textContent())!;
  expect(url).toMatch(/\/connect\/[A-Za-z0-9_-]{20,}$/);
  await expect(page.getByRole("cell", { name: /Acme Builders/ })).toBeVisible(); // the list picked it up without a reload
  const listCmd = (await page.getByTestId("first-request").textContent())!;
  expect(listCmd).toContain("X-End-User-Id: acme-42");
  expect(c.count()).toBeLessThanOrEqual(6);

  // The bookkeeper connects the sample file on the QuickBooks PC (simulated Web Connector), then Priya runs the command.
  const file = new FakeCompanyFile();
  file.seedCustomer("Acme Builders");
  const sim = await simulatorFor(page, request, url, file);
  await sim.runSession();
  let done = false;
  const run = bash(listCmd.replace(/^curl /, "curl -sS "), { WIREBOOK_API_KEY: key! }).finally(() => { done = true; });
  while (!done) { await sim.runSession(); await page.waitForTimeout(200); }
  expect(JSON.parse(await run).data[0].name).toBe("Acme Builders");

  // and it is in the request log; the checklist is gone because there is real data
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /open request/ }).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("Marcus, day 2: a teammate without an account accepts the invitation without creating a stray organization", async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  await signInViaUI(page, request, `marcus+${uniq()}@spend.test`, "Spendwise");
  await page.goto("/app/settings/members");
  const mate = `lee+${uniq()}@spend.test`;
  await page.getByLabel("Email").fill(mate);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("cell", { name: mate })).toBeVisible();
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(mate)}`)).json();
  const invite = /https?:\/\/\S+\/accept-invite\/[A-Za-z0-9_-]+/.exec(box.messages.at(-1).text)![0];

  const ctx = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
  const lee = await ctx.newPage();
  const problems = watch(lee, { ignoreHydration: true });
  await lee.goto(invite);
  await lee.waitForURL(/\/sign-in/);
  await lee.getByLabel("Email").fill(mate);
  await lee.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(lee.getByText(`Check your inbox at ${mate}`)).toBeVisible({ timeout: 30_000 });
  const mail = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(mate)}`)).json();
  await lee.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(mail.messages.at(-1).text)![0]);
  // straight to the invitation, no "Name your organization" detour
  await expect(lee.getByRole("heading", { name: /Join Spendwise/ })).toBeVisible();
  await lee.getByRole("button", { name: "Accept invitation" }).click();
  await lee.waitForURL(/\/app/);
  const orgs = await (await lee.request.get("/api/auth/organization/list", { headers: { origin: new URL(lee.url()).origin } })).json();
  expect(orgs.map((o: { name: string }) => o.name)).toEqual(["Spendwise"]);
  expect(problems).toEqual([]);
  await ctx.close();
});

test("Dana, day 7: the 4th real company file is refused in the dashboard with a way to pay, and End users opens where the files are", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const problems = watch(page, { ignoreHydration: true });
  await signInViaUI(page, request, `dana+${uniq()}@movers.test`, "Movers");
  for (const id of ["north", "south", "east"]) {
    await page.goto("/app/end-users?env=production");
    await page.getByLabel("Your id for this customer").fill(id);
    await page.getByRole("button", { name: "Create connect link" }).click();
    const url = (await page.getByTestId("connect-url").textContent())!;
    const sim = await simulatorFor(page, request, url, new FakeCompanyFile(), `C:\\Clients\\${id}.qbw`);
    await sim.runSession();
  }
  // no env in the URL: production is where Dana's files are, so that is what opens
  await page.goto("/app/end-users");
  await expect(page.getByRole("link", { name: "production" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("cell", { name: /north/ })).toBeVisible();

  await page.getByLabel("Your id for this customer").fill("west");
  await page.getByRole("button", { name: "Create connect link" }).click();
  const alert = page.getByRole("alert").filter({ hasText: /does not include another active company file/ });
  await expect(alert).toBeVisible();
  await alert.getByRole("link", { name: "Choose a plan" }).click();
  await expect(page).toHaveURL(/\/app\/billing/);
  await expect(page.getByText("You have reached your limit")).toBeVisible();
  // choosing a plan here starts checkout; without Stripe keys in this run the page says so instead of failing silently
  await page.getByRole("button", { name: "Choose Production" }).click();
  await expect(page.getByText(/Billing is not connected yet|That did not go through/i).first()).toBeVisible();
  expect(baseURL).toBeTruthy();
  // expected here and only here: the refused 4th file (402) and checkout without Stripe keys in this run (503)
  const expected = (p: string) => /end-users: .*status of 402/.test(p) || /^http 503: \S+\/api\/billing\/checkout$/.test(p) || /billing.*status of 503/.test(p);
  expect(problems.filter((p) => !expected(p))).toEqual([]);
});
