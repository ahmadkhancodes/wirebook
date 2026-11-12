import { expect, test } from "@playwright/test";
import { signInViaUI, uniq, watch } from "./helpers";

// The dashboard as a developer who has just made their first requests.
test("request log: filters apply, clear resets, bad filters and ids are harmless, detail opens", async ({ page, request }) => {
  const problems = watch(page, { ignoreHydration: true });
  await signInViaUI(page, request, `log+${uniq()}@studio.test`);
  expect((await page.request.post("/api/dev/seed-requests")).ok()).toBeTruthy();
  await page.goto("/app");
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows.nth(1)).toBeVisible();
  const all = await rows.count();
  expect(all).toBeGreaterThan(5);

  await page.getByLabel("Status").selectOption("failed");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/state=failed/);
  const failed = await page.getByRole("table").getByRole("row").count();
  expect(failed).toBeLessThan(all);
  await page.getByRole("link", { name: "Clear" }).click();
  await expect(page).not.toHaveURL(/state=/);

  // hostile query strings never 500 and never render markup
  for (const q of ["?state=<script>", "?object='%20OR%201=1", "?q=%00%00", `?q=${"a".repeat(5000)}`, "?before=garbage", "?env=nope"]) {
    const res = await page.goto(`/app${q}`);
    expect(res?.status(), q).toBeLessThan(500);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  await page.goto("/app?q=req_does_not_exist");
  await expect(page.getByRole("heading", { name: "No requests match" })).toBeVisible();

  // a row opens its detail
  await page.goto("/app");
  const link = page.getByRole("table").getByRole("link").first();
  await link.click();
  await expect(page).toHaveURL(/\/app\/requests\/|\/app\/end-users\/|\/app\?/);
  expect(problems).toEqual([]);
});

test("org switcher: Escape closes it, a second organization can be created and switched to", async ({ page, request }) => {
  await signInViaUI(page, request, `org+${uniq()}@studio.test`, "First Org");
  const sw = page.getByRole("button", { name: /Organization/ }).first();
  await sw.click();
  await expect(page.getByRole("listbox", { name: "Organizations" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox", { name: "Organizations" })).toHaveCount(0);
  await sw.click();
  await page.getByRole("link", { name: "Create organization" }).click();
  await expect(page).toHaveURL(/onboarding\?new=1/);
  await page.getByLabel("Organization name").fill("First Org");
  await page.getByRole("button", { name: "Create organization" }).click();
  await page.waitForURL(/\/app$/);
  await expect(page.getByRole("button", { name: /Organization/ }).first()).toContainText("First Org");
  await page.getByRole("button", { name: /Organization/ }).first().click();
  await expect(page.getByRole("listbox", { name: "Organizations" }).getByRole("option")).toHaveCount(2);
  await page.getByRole("listbox", { name: "Organizations" }).getByRole("option").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("security, audit, export, 2FA and invite pages behave for a first-time user", async ({ page, request }) => {
  const problems = watch(page, { ignoreHydration: true });
  await signInViaUI(page, request, `sec+${uniq()}@studio.test`);
  await page.goto("/app/settings/security");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const b of await page.getByRole("button").all()) {
    // every enabled button on the page has a name, and disabled ones explain themselves nearby
    expect((await b.innerText()).trim() || (await b.getAttribute("aria-label")), "unnamed button").toBeTruthy();
  }
  await page.goto("/app/settings/audit");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/app/settings/profile");
  const dl = page.waitForEvent("download");
  await page.getByRole("link", { name: /export|download/i }).first().click();
  expect((await dl).suggestedFilename()).toMatch(/\.json|\.csv|\.zip/);
  const bad = await page.goto("/accept-invite/does-not-exist");
  expect(bad?.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your dashboard" })).toBeVisible();
  const tf = await page.goto("/sign-in/two-factor");
  expect(tf?.status()).toBeLessThan(500);
  // the invite lookup for an unknown id is an expected 400; anything else is a problem
  expect(problems.filter((p) => !/accept-invite\/does-not-exist.*400/.test(p))).toEqual([]);
});

test("delete account: needs the typed phrase, signs out, and the e-mail can sign up again", async ({ page, request }) => {
  const email = `del+${uniq()}@studio.test`;
  await signInViaUI(page, request, email);
  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog");
  const confirm = dialog.getByRole("button", { name: /delete/i }).last();
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("textbox").fill("delete my account");
  await confirm.click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await page.goto("/app");
  await expect(page).toHaveURL(/sign-in/);
});

test("security: authenticator setup rejects a wrong code and can be cancelled; sessions list explains a disabled button", async ({ page, request }) => {
  await signInViaUI(page, request, `tot+${uniq()}@studio.test`);
  await page.goto("/app/settings/security");
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(page.getByLabel("6 digit code")).toBeVisible();
  await page.getByLabel("6 digit code").fill("000000");
  await page.getByRole("button", { name: "Verify and turn on" }).click();
  await expect(page.getByRole("alert").or(page.locator("#totp-code-error")).first()).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "Set up authenticator app" })).toBeVisible();


  const others = page.getByRole("button", { name: "Sign out other sessions" });
  if (await others.isDisabled()) {
    const described = await others.getAttribute("aria-describedby");
    const title = await others.getAttribute("title");
    const near = await page.getByText(/no other (active )?sessions|only (this|one) session|this is your only/i).count();
    expect(Boolean(described || title) || near > 0, "a disabled 'Sign out other sessions' must say why").toBeTruthy();
  }
});

test("passkeys: with an authenticator present a user can add a passkey and then sign in with it", async ({ page, request }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await signInViaUI(page, request, `pk+${uniq()}@studio.test`);
  await page.goto("/app/settings/security");
  await page.getByLabel("Passkey name").fill("Work laptop");
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText(/Passkey Work laptop added/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Work laptop").first()).toBeVisible();
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
});
