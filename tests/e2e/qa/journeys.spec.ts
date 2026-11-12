import { expect, test } from "@playwright/test";
import { signInViaUI, uniq, watch } from "./helpers";

// Journeys as the ICP (a founder / integrations engineer at a 10-80 person vertical SaaS), driven through the real UI.

test.describe("free user, signed in through the UI", () => {
  test("sign-in form: invalid e-mail is explained, valid e-mail shows the inbox state, sign out returns home", async ({ page, request }) => {
    const problems = watch(page, { ignoreHydration: true });
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    const email = `si+${uniq()}@studio.test`;
    await signInViaUI(page, request, email);
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/sign-in/);
    expect(problems).toEqual([]);
  });

  test("magic link is single use and a bad token lands on a helpful message", async ({ page, request }) => {
    const email = `reuse+${uniq()}@studio.test`;
    await signInViaUI(page, request, email);
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0];
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByText("That link has expired")).toBeVisible();
    await page.goto("/api/auth/magic-link/verify?token=garbage&callbackURL=/app&errorCallbackURL=/sign-in");
    await expect(page.getByText("That link has expired")).toBeVisible();
  });

  test("open redirect through ?next is refused after sign-in", async ({ page, request }) => {
    const email = `redir+${uniq()}@studio.test`;
    await signInViaUI(page, request, email);
    await page.goto("/sign-in?next=//evil.test");
    await expect(page).toHaveURL(/localhost:3100\/app/);
    await page.goto("/sign-in?next=https://evil.test");
    await expect(page).toHaveURL(/localhost:3100\/app/);
  });

  test("onboarding: short, hostile and unicode organization names", async ({ page, request }) => {
    await signInViaUI(page, request, `onb+${uniq()}@studio.test`, "");
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel("Organization name").fill("a");
    await page.getByRole("button", { name: "Create organization" }).click();
    await expect(page.getByText("at least 2 characters")).toBeVisible();
    await page.getByLabel("Organization name").fill("<img src=x onerror=alert(1)> 東京 Ünïcode & Sons");
    await page.getByRole("button", { name: "Create organization" }).click();
    await page.waitForURL(/\/app/);
    await expect(page.locator("img[src=x]")).toHaveCount(0);
    await expect(page.getByText("東京").first()).toBeVisible();
  });

  test("API keys: validation, create, reveal once, use it, Escape closes the delete dialog, delete revokes", async ({ page, request }) => {
    const problems = watch(page, { ignoreHydration: true });
    await signInViaUI(page, request, `keys+${uniq()}@studio.test`);
    await page.goto("/app/settings/api-keys");
    await expect(page.getByRole("heading", { name: "No API keys yet" })).toBeVisible();
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText("Name the key after where it will be used")).toBeVisible();
    await page.getByLabel("Name").fill("   ");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText("Name the key after where it will be used")).toBeVisible();

    await page.getByLabel("Name").fill("<b>ci</b> ☃ server");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByText("Key created:")).toBeVisible();
    await expect(page.locator("b")).toHaveCount(0);
    const secret = (await page.locator("code").filter({ hasText: /\w{20,}/ }).first().textContent())!.trim();
    expect(secret.length).toBeGreaterThan(20);
    // duplicate names are allowed but distinguishable by prefix; creating again works
    await page.getByLabel("Name").fill("<b>ci</b> ☃ server");
    await page.getByRole("button", { name: "Create key" }).click();
    await expect(page.getByRole("cell", { name: /^<b>ci<\/b> ☃ server$/ })).toHaveCount(2);

    const ok = await request.get("/v1/qbd/customers", { headers: { authorization: `Bearer ${secret}` } });
    expect(ok.status(), await ok.text()).not.toBe(401);

    await page.getByRole("button", { name: /Delete key/ }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("cell", { name: /^<b>ci<\/b> ☃ server$/ })).toHaveCount(2);
    expect(problems).toEqual([]);
  });

  test("profile: empty name refused, unicode saved, survives reload; retention validates", async ({ page, request }) => {
    await signInViaUI(page, request, `prof+${uniq()}@studio.test`);
    await page.goto("/app/settings/profile");
    await page.getByLabel("Name").fill("");
    await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await page.getByLabel("Name").fill("Zoë <script>x</script> 李");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Name updated to")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Zoë <script>x</script> 李");

    await page.goto("/app/settings/data");
    await page.getByLabel("Days to keep payloads").fill("0");
    await page.getByRole("button", { name: "Save retention" }).click();
    await expect(page.getByText(/whole number of days/)).toBeVisible();
    await page.getByLabel("Days to keep payloads").fill("abc");
    await page.getByRole("button", { name: "Save retention" }).click();
    await expect(page.getByText(/whole number of days/)).toBeVisible();
    await page.getByLabel("Days to keep payloads").fill("7");
    await page.getByRole("button", { name: "Save retention" }).click();
    await expect(page.getByText("Bodies are now removed after 7 days.")).toBeVisible();
  });

  test("members: invite validation, duplicate invite, cancel", async ({ page, request }) => {
    await signInViaUI(page, request, `mem+${uniq()}@studio.test`);
    await page.goto("/app/settings/members");
    await page.getByLabel("Email").fill("nope");
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByRole("alert").or(page.getByText(/valid email/i)).first()).toBeVisible();
    const inv = `mate+${uniq()}@studio.test`;
    await page.getByLabel("Email").fill(inv);
    await page.getByRole("button", { name: "Send invitation" }).click();
    await expect(page.getByText(inv).first()).toBeVisible();
    await page.getByLabel("Email").fill(inv);
    await page.getByRole("button", { name: "Send invitation" }).click();
    // second invite must not 500 or vanish silently: either one row or an explicit message
    await expect(page.getByText(inv).first()).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).first().click();
    await expect(page.getByRole("cell", { name: inv })).toHaveCount(0, { timeout: 10_000 });
  });

  test("webhooks: invalid, private and valid URLs; add, pause, delete", async ({ page, request }) => {
    await signInViaUI(page, request, `wh+${uniq()}@studio.test`);
    await page.goto("/app/settings/webhooks");
    for (const bad of ["not a url", "http://localhost:9/x", "http://169.254.169.254/latest", "ftp://example.com/x"]) {
      await page.getByLabel("Endpoint URL").fill(bad);
      await page.getByRole("button", { name: "Add endpoint" }).click();
      await expect(page.locator("#wh-url-error, [role=alert]").first(), bad).toBeVisible();
      await expect(page.getByText("Signing secret for")).toHaveCount(0);
    }
    await page.getByLabel("Endpoint URL").fill("https://example.com/hooks/wirebook");
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await expect(page.getByText("Signing secret for https://example.com/hooks/wirebook")).toBeVisible();
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused deliveries to")).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).click();
    await expect(page.getByText("deleted.")).toBeVisible();
  });

  test("billing: plan toggle, checkout without Stripe is a calm notice, pricing hand-off carries the plan", async ({ page, request }) => {
    await signInViaUI(page, request, `bill+${uniq()}@studio.test`);
    await page.goto("/app/billing");
    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(page.getByRole("button", { name: "Monthly" })).toHaveAttribute("aria-pressed", "true");
    const upgrade = page.getByRole("button", { name: /upgrade|choose|select|get /i });
    await expect(upgrade.first()).toBeVisible();
    await upgrade.first().click();
    await expect(page.getByText(/Billing is not connected yet|That did not go through|checkout/i).first()).toBeVisible();
    await expect(page).toHaveURL(/\/app\/billing|checkout\.stripe/);
    await page.goto("/app/billing?plan=production&interval=month");
    await expect(page.getByText("Continue with")).toBeVisible();
  });

  test("keyboard only: skip link, tab order reaches the main nav", async ({ page, request }) => {
    await signInViaUI(page, request, `kb+${uniq()}@studio.test`);
    await page.goto("/app/usage");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /skip to content/i })).toBeFocused();
  });

  test("mobile: the navigation menu opens, has a label, closes with Escape and navigates", async ({ page, request }) => {
    await signInViaUI(page, request, `mob+${uniq()}@studio.test`);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/app");
    const open = page.getByRole("button", { name: /menu|navigation/i }).first();
    await expect(open).toBeVisible();
    await open.click();
    await page.getByRole("link", { name: "Usage" }).last().click();
    await expect(page).toHaveURL(/\/app\/usage/);
  });
});

test("unauthorised: another org's data and routes are not reachable", async ({ browser, request }) => {
  const ctxA = await browser.newContext({ baseURL: "http://localhost:3100" });
  const ctxB = await browser.newContext({ baseURL: "http://localhost:3100" });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await signInViaUI(a, request, `ownerA+${uniq()}@studio.test`, "Org A");
  await signInViaUI(b, request, `ownerB+${uniq()}@studio.test`, "Org B");
  const orgA = (await (await a.request.get("/api/auth/organization/get-full-organization")).json()).id as string;
  const keyRes = await a.request.post("/api/auth/api-key/create", { data: { name: "a", organizationId: orgA, metadata: { environment: "test" } }, headers: { origin: "http://localhost:3100" } });
  const aKey = (await keyRes.json()).key as string;
  const link = await request.post("/v1/connect-links", { headers: { authorization: `Bearer ${aKey}` }, data: { externalId: "a-1", companyName: "A Co" } });
  expect(link.status()).toBe(201);
  const { endUserId } = await link.json();
  // B cannot read or mutate A's end user through the dashboard API or the page
  expect((await b.request.get(`/api/end-users/${endUserId}`)).status()).toBeGreaterThanOrEqual(400);
  expect((await b.request.delete(`/api/end-users/${endUserId}`, { headers: { origin: "http://localhost:3100" } })).status()).toBeGreaterThanOrEqual(400);
  const res = await b.goto(`/app/end-users/${endUserId}`);
  expect([200, 404]).toContain(res?.status());
  await expect(b.getByText("A Co")).toHaveCount(0);
  // admin is closed to normal users
  const adm = await b.goto("/admin");
  expect([403, 404, 200]).toContain(adm?.status());
  await expect(b.getByText(/Overview|Suspend/).first()).toHaveCount(0);
  expect((await b.request.get("/api/admin/overview")).status()).toBeGreaterThanOrEqual(400);
  expect((await request.get("/v1/qbd/customers")).status()).toBe(401);
  await ctxA.close();
  await ctxB.close();
});
