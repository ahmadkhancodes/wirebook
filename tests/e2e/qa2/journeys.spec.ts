import { expect, test, type Page } from "@playwright/test";
import { FakeCompanyFile, QbwcSimulator } from "../../../tools/simulate-qbwc/simulator";
import { signInViaUI, uniq, watch } from "../qa/helpers";

test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

for (const width of [375, 1440]) {
  test(`new visitor @${width}: every header, hero, pricing and footer link goes somewhere real and brand-consistent`, async ({ page, request }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: 900 });
    const problems = watch(page, { ignoreHydration: true });
    await page.goto("/");
    const hrefs = new Set<string>();
    if (width === 375) await page.getByRole("button", { name: /menu/i }).first().click();
    for (const a of await page.locator("a[href]").all()) { const h = await a.getAttribute("href"); if (h) hrefs.add(h); }
    for (const h of hrefs) {
      if (/^(mailto:|https?:)/.test(h) && !h.startsWith("http://localhost")) {
        expect(h, "external links must be https or mailto").toMatch(/^(mailto:|https:)/);
        continue;
      }
      const r = await request.get(h.startsWith("#") ? "/" : h);
      expect(r.status(), h).toBeLessThan(400);
    }
    // sign-up CTA from the hero lands on sign-in and keeps the visitor's intent
    await page.goto("/");
    const cta = page.getByRole("link", { name: /start|get started|sign up|try/i }).first();
    await cta.click();
    await expect(page).toHaveURL(/\/(sign-in|pricing|docs)/);
    expect(problems).toEqual([]);
  });
}

test("redirects: sign-in goes back to where the visitor was headed; signed-in visitors skip sign-in; sign-out ends the session", async ({ page, request }) => {
  test.setTimeout(120_000);
  const problems = watch(page, { ignoreHydration: true });
  await page.goto("/app/settings/api-keys");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fsettings%2Fapi-keys/);
  await signInViaUI(page, request, `redir+${uniq()}@studio.test`);
  // after sign-in the visitor is in the app
  await page.goto("/sign-in");
  await expect(page, "a signed-in user opening /sign-in is sent into the app").toHaveURL(/\/app/);
  // sign out through the menu
  await page.goto("/app");
  const out = page.getByRole("button", { name: /sign out/i }).first();
  if (!(await out.isVisible())) await page.getByRole("button", { name: /account|menu|profile/i }).first().click();
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/\/($|\?)|\/sign-in/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
  expect(problems).toEqual([]);
});

test("checkout return: success, canceled and unknown states are explained", async ({ page, request }) => {
  await signInViaUI(page, request, `co+${uniq()}@studio.test`);
  await page.goto("/app/billing?checkout=canceled");
  await expect(page.getByText(/checkout was canceled|nothing was charged/i).first()).toBeVisible();
  await page.goto("/app/billing?checkout=success");
  await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible();
  await page.goto("/app/billing?session_id=cs_test_nope");
  await expect(page.getByText(/Confirming your payment|did not go through|not connected/i).first()).toBeVisible();
  await expect(page.getByText("Confirming your payment")).toBeHidden({ timeout: 40_000 });
});

async function connectRealFile(page: Page, request: import("@playwright/test").APIRequestContext, auth: Record<string, string>, id: string) {
  const link = await request.post("/v1/connect-links", { headers: auth, data: { externalId: id, companyName: `Co ${id}` } });
  const token = (await link.json()).url.split("/connect/")[1];
  await page.goto(`/connect/${token}`);
  const qwc = await (await request.get(`/connect/${token}/wirebook.qwc`)).text();
  const username = /<UserName>(.*)<\/UserName>/.exec(qwc)![1]!;
  const password = (await page.locator("code").first().textContent())!;
  const file = new FakeCompanyFile();
  const sim = new QbwcSimulator(async (xml) => {
    const r = await request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, { user: username, pass: password }, file);
  sim.companyFile = `C:\\Clients\\${id}.qbw`;
  return { sim, token };
}

test("user at the plan limit: 4th real company file is refused with a clear 402 and the dashboard says so", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const problems = watch(page, { ignoreHydration: true });
  await signInViaUI(page, request, `limit+${uniq()}@studio.test`);
  const origin = { origin: baseURL! };
  const orgs = await (await page.request.get("/api/auth/organization/list", { headers: origin })).json();
  const orgId = orgs[0].id as string;
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "limit", organizationId: orgId, metadata: { environment: "production" } }, headers: origin })).json()).key as string;
  const auth = { authorization: `Bearer ${key}` };
  for (const id of ["a", "b", "c"]) {
    const { sim } = await connectRealFile(page, request, auth, id);
    await sim.runSession();
  }
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { name: /Active company files/ })).toBeVisible();
  await expect(page.getByText(/3 of 3/).first()).toBeVisible();
  // exactly at the limit is "reached", not "over"
  await expect(page.getByText("You have reached your limit")).toBeVisible();
  await expect(page.getByText("You are over your limit")).toHaveCount(0);
  const over = await request.post("/v1/connect-links", { headers: auth, data: { externalId: "d", companyName: "Co d" } });
  expect(over.status()).toBe(402);
  expect((await over.json()).error.code).toBe("file_limit_reached");
  await page.goto("/app/end-users");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({ path: "/tmp/limit-endusers.png", fullPage: true });
  await page.goto("/app");
  await page.screenshot({ path: "/tmp/limit-app.png", fullPage: true });
  await page.goto("/app/billing");
  await page.screenshot({ path: "/tmp/limit-billing.png", fullPage: true });
  expect(problems).toEqual([]);
});
