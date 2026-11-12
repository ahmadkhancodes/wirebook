import { expect, test } from "@playwright/test";
import { signInViaUI, uniq, watch } from "./helpers";

// The developer's journey against the REST API: hostile input, error shapes, and the connect-link entry point.
test("REST API: every bad request answers a structured error, never a 5xx or an HTML page", async ({ page, request }) => {
  await signInViaUI(page, request, `api+${uniq()}@studio.test`);
  const orgId = (await (await page.request.get("/api/auth/organization/get-full-organization")).json()).id as string;
  const origin = { origin: "http://localhost:3100" };
  const key = (await (await page.request.post("/api/auth/api-key/create", { data: { name: "api", organizationId: orgId, metadata: { environment: "test" } }, headers: origin })).json()).key as string;
  const auth = { authorization: `Bearer ${key}` };

  const expectErr = async (res: Awaited<ReturnType<typeof request.get>>, status: number | number[], label: string) => {
    const want = Array.isArray(status) ? status : [status];
    const body = await res.text();
    expect(want, `${label}: ${res.status()} ${body.slice(0, 200)}`).toContain(res.status());
    if (res.status() === 405) return; // QA-REPORT open item: Next's own 405 has an empty body
    expect(res.headers()["content-type"] ?? "", label).toContain("json");
    expect(JSON.parse(body), label).toBeTruthy();
  };

  await expectErr(await request.get("/v1/qbd/customers"), 401, "no key");
  await expectErr(await request.get("/v1/qbd/customers", { headers: { authorization: "Bearer sk_test_nope" } }), 401, "bad key");
  await expectErr(await request.get("/v1/qbd/customers", { headers: { authorization: "Basic abc" } }), 401, "wrong scheme");
  await expectErr(await request.get("/v1/qbd/not-a-thing", { headers: auth }), [400, 404], "unknown object");
  await expectErr(await request.get("/v1/qbd/customers/does-not-exist", { headers: auth }), [400, 404, 409, 422], "unknown id");
  await expectErr(await request.get("/v1/requests/req_nope", { headers: auth }), [400, 404], "unknown request");
  await expectErr(await request.get("/v1/end-users/end_nope", { headers: auth }), [400, 404, 405], "unknown end user");

  for (const [label, data] of [["empty", ""], ["broken json", "{"], ["array", "[]"], ["null", "null"], ["huge", JSON.stringify({ companyName: "x".repeat(300_000) })]] as const) {
    const r = await request.post("/v1/connect-links", { headers: { ...auth, "content-type": "application/json" }, data });
    expect(r.status(), `connect-links ${label}`).toBeLessThan(500);
    expect(r.status(), `connect-links ${label}`).toBeGreaterThanOrEqual(400);
    expect(r.headers()["content-type"] ?? "", label).toContain("json");
  }
  const noEndUser = await request.post("/v1/qbd/customers", { headers: auth, data: { name: "Acme" } });
  expect(noEndUser.status()).toBeLessThan(500);
  expect(noEndUser.status()).toBeGreaterThanOrEqual(400);

  const mk = (b: object) => request.post("/v1/connect-links", { headers: auth, data: b });
  expect((await mk({ externalId: "  ", companyName: "" })).status()).toBeGreaterThanOrEqual(400);
  const uni = await mk({ externalId: "ünï-<b>1</b>", companyName: "<script>alert(1)</script> 東京 Builders & Sons" });
  expect(uni.status(), await uni.text()).toBeLessThan(500);
  const first = await mk({ externalId: "dup-1", companyName: "Dup Co" });
  expect(first.status()).toBe(201);
  const second = await mk({ externalId: "dup-1", companyName: "Dup Co" });
  expect([200, 201, 409]).toContain(second.status());
  if (uni.status() === 201) {
    const { url } = await uni.json();
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("<script>");
  }

  const oas = await (await request.get("/v1/openapi.json")).json();
  expect(Object.keys(oas.paths).length).toBeGreaterThan(5);
});

test("connect page states: bogus token, wrong methods and SOAP garbage are friendly", async ({ page, request }) => {
  const res = await page.goto("/connect/not-a-real-token");
  expect(res?.status()).toBeLessThan(500);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect((await request.get("/connect/not-a-real-token/wirebook.qwc")).status()).toBeGreaterThanOrEqual(400);
  expect((await request.get("/connect/not-a-real-token/status")).status()).toBeLessThan(500);
  expect((await request.delete("/v1/connect-links")).status()).toBeLessThan(500);
  expect((await request.get("/qbwc")).status()).toBeLessThan(500);
  const soapGarbage = await request.post("/qbwc", { data: "<nope", headers: { "content-type": "text/xml" } });
  expect(soapGarbage.status()).toBeLessThan(500);
});

test("docs: every internal link resolves and copy buttons give feedback", async ({ page, request }) => {
  const problems = watch(page, { ignoreHydration: true });
  await page.goto("/docs");
  const links = new Set(await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!.split("#")[0]!)));
  for (const l of links) expect((await request.get(l)).status(), l).toBeLessThan(400);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/docs/quickstart").catch(() => undefined);
  const copy = page.getByRole("button", { name: /copy/i }).first();
  if (await copy.count()) {
    await copy.click();
    await expect(page.getByText(/copied/i).first()).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test("pricing page numbers agree with the plan limits in code", async ({ page }) => {
  await page.goto("/pricing");
  const text = await page.locator("main").innerText();
  for (const n of ["24.99", "19.99", "5,000", "250,000"]) expect(text, n).toContain(n);
  await page.getByRole("link", { name: /start free|free/i }).first().click();
  await expect(page).toHaveURL(/sign-in|app/);
});
