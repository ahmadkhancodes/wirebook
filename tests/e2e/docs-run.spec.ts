import { expect, request as pwRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { altchaHeader } from "./altcha";
import { newVisitorIp } from "./qa/helpers";
import { FakeCompanyFile, QbwcSimulator } from "../../tools/simulate-qbwc/simulator";

// "Docs must work": every code block on every /docs page, read from the rendered page exactly as a reader copies it,
// is run against the local app. curl blocks run in bash with real curl, TypeScript blocks with tsx against the SDK
// source, Python blocks with python3 against the SDK source, JSON blocks are parsed and compared with real answers.
// The QuickBooks side is the Web Connector simulator answering through /qbwc (the faithful local stand-in).
// Substitutions are the ones a reader makes: the production origin becomes this app, sk_test_... becomes the key,
// "<listId>" / "<txnId>" become the id of the record the sample just created.

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PROD = "https://wirebook.buffersoltech.com";
const ROOT = process.cwd();
const TMP = path.join(ROOT, "node_modules/.cache/docs-run");
const ORIGIN = { origin: BASE };
const NARRATIVE = ["getting-started", "authentication", "api", "idempotency"];

/** Blocks that cannot run here, with the reason. The page must say the same thing to the reader. */
const NOT_RUN: Record<string, { reason: string; pageSays: RegExp }> = {
  "sdks/Install": { reason: "registry install: the packages are not published yet and this runner has no network", pageSays: /not published to npm or PyPI yet/ },
};

interface Block { slug: string; heading: string; lang: string; code: string }
interface Run { code: number | null; out: string; err: string }

test.describe.configure({ mode: "serial" });
test.use({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0 Safari/537.36" });

const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sh(cmd: string, args: string[], env: Record<string, string> = {}): Promise<Run> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => resolve({ code, out, err }));
  });
}

/** Keep the Web Connector polling while a command waits for QuickBooks, the way a connected PC does. */
async function serving<T>(sim: QbwcSimulator, work: Promise<T>): Promise<T> {
  let done = false;
  const w = work.finally(() => { done = true; });
  while (!done) {
    await sim.runSession();
    await sleep(200);
  }
  return w;
}

async function blocksOf(page: Page, slug: string): Promise<Block[]> {
  await newVisitorIp(page); // one simulated visitor per page, as in the other walks: the per-IP session limit is not under test
  const res = await page.goto(`/docs/${slug}`);
  expect(res?.status(), slug).toBe(200);
  return page.$$eval("[data-code-lang]", (els) => els.map((el) => ({
    lang: el.getAttribute("data-code-lang") ?? "",
    code: el.querySelector("pre")?.textContent ?? "",
    heading: el.closest("section")?.querySelector("h2")?.textContent ?? "",
  }))).then((bs) => bs.map((b) => ({ ...b, slug })));
}

/** A QuickBooks sample company file stand-in, holding the names the samples refer to unless the sample creates them. */
function sampleFile(code: string): FakeCompanyFile {
  const f = new FakeCompanyFile();
  if (!/qbd\.customers\.create|\/v1\/qbd\/customers'/.test(code)) f.seedCustomer("Acme Builders");
  (f.store.VendorRet ??= []).push({ ListID: "80000200-1", EditSequence: "1700000000", Name: "Harbor Supply", FullName: "Harbor Supply" });
  return f;
}

let account: { ctx: APIRequestContext; key: string; orgId: string };
let creds: { user: string; pass: string };
let narrativeSim: QbwcSimulator;
const covered = new Set<string>();

async function signUp() {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip() } });
  const email = `docs+${uniq()}@studio.test`;
  const r = await ctx.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { ...ORIGIN, "x-altcha": await altchaHeader(ctx) } });
  expect(r.status(), await r.text()).toBe(200);
  const box = await (await ctx.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await ctx.get(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0], { maxRedirects: 0 });
  const org = await (await ctx.post("/api/auth/organization/create", { data: { name: "Docs org", slug: `docs-${uniq()}` }, headers: ORIGIN })).json();
  await ctx.post("/api/auth/organization/set-active", { data: { organizationId: org.id }, headers: ORIGIN });
  const k = await (await ctx.post("/api/auth/api-key/create", { data: { name: "docs", organizationId: org.id, metadata: { environment: "test" } }, headers: ORIGIN })).json();
  return { ctx, key: k.key as string, orgId: org.id as string };
}

/** Runs a bash block with real curl. Returns each call's status and parsed body. */
async function runBash(code: string, sim?: QbwcSimulator): Promise<{ status: number; body: unknown; raw: string }[]> {
  const script = `set -euo pipefail\ncurl() { command curl -sS -w '\\n<<%{http_code}>>\\n' "$@"; }\n${code.replaceAll(PROD, BASE).replace("'sk_test_...'", `'${account.key}'`)}`;
  const job = sh("bash", ["-c", script], { WIREBOOK_API_KEY: account.key });
  const r = sim ? await serving(sim, job) : await job;
  expect(r.code, `${code}\n${r.err}\n${r.out}`).toBe(0);
  const parts = r.out.split(/\n<<(\d{3})>>\n/);
  const calls: { status: number; body: unknown; raw: string }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const raw = parts[i]!.trim();
    let body: unknown = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
    calls.push({ status: Number(parts[i + 1]), body, raw });
  }
  expect(calls.length, `no curl call ran:\n${code}`).toBeGreaterThan(0);
  return calls;
}

function tsSource(b: Block, setup: string | null): string {
  let src = b.code;
  if (!/^import /m.test(src) && setup) src = `${setup}\n${src}`;
  src = src.replaceAll('"@wirebook/sdk"', JSON.stringify(path.join(ROOT, "packages/sdk-ts/src/index.ts")));
  src = src.replace(/"<(listId|txnId)>"/g, "(created as any).$1");
  const rewrite = `const __f = globalThis.fetch; globalThis.fetch = ((u: any, i?: any) => __f(String(u).replace(${JSON.stringify(PROD)}, ${JSON.stringify(BASE)}), i)) as typeof fetch;\n`;
  return rewrite + src;
}

function pySource(code: string): string {
  const patch = `import dataclasses as __dc\nimport wirebook.client as __wc\n__orig = __wc.urllib_transport\n__wc.urllib_transport = lambda r: __orig(__dc.replace(r, url=r.url.replace(${JSON.stringify(PROD)}, ${JSON.stringify(BASE)})))\n`;
  return patch + code.replace(/"<(listId|txnId)>"/g, 'created["$1"]');
}

async function runFile(ext: "mts" | "py", src: string, env: Record<string, string> = {}, sim?: QbwcSimulator): Promise<Run> {
  mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `${uniq()}.${ext}`);
  writeFileSync(file, src);
  const job = ext === "mts"
    ? sh(path.join(ROOT, "node_modules/.bin/tsx"), [file], { WIREBOOK_API_KEY: account.key, ...env })
    : sh("python3", [file], { WIREBOOK_API_KEY: account.key, PYTHONPATH: path.join(ROOT, "packages/sdk-py/src"), ...env });
  const r = sim ? await serving(sim, job) : await job;
  expect(r.code, `${src}\n--- stderr\n${r.err}\n--- stdout\n${r.out}`).toBe(0);
  return r;
}

async function connect(page: Page, url: string, file: FakeCompanyFile) {
  const local = url.replace(PROD, BASE);
  await page.goto(local);
  const qwc = await (await page.request.get(`${local}/wirebook.qwc`)).text();
  const user = /<UserName>(.*)<\/UserName>/.exec(qwc)![1]!;
  const pass = (await page.locator("code").first().textContent())!.trim();
  creds = { user, pass };
  return new QbwcSimulator(async (xml) => {
    const r = await page.request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, creds, file);
}

test("quickstart, authentication, API reference and idempotency commands work as written, in order", async ({ page }) => {
  test.setTimeout(300_000);
  account = await signUp();
  // a sample company file already has customers; the quickstart lists them
  const file = new FakeCompanyFile();
  file.seedCustomer("Acme Builders");

  const qs = await blocksOf(page, "getting-started");
  const at = (h: string) => qs.find((b) => b.heading === h)!;
  const me = await runBash(at("Create an API key").code);
  expect(me[0]).toMatchObject({ status: 200, body: { orgId: account.orgId } });
  covered.add("getting-started/Create an API key");

  const link = await runBash(at("Create a connect link").code);
  expect(link[0]!.status).toBe(201);
  const created = link[0]!.body as { url: string; externalId: string; endUserId: string };
  expect(created).toMatchObject({ externalId: "acme-42", url: expect.stringContaining("/connect/") });
  covered.add("getting-started/Create a connect link");

  narrativeSim = await connect(page, created.url, file);
  await narrativeSim.runSession();

  const list = await runBash(at("List its customers").code, narrativeSim);
  expect(list[0]!.status).toBe(200);
  expect((list[0]!.body as { data: { name: string }[] }).data.map((c) => c.name)).toContain("Acme Builders");
  covered.add("getting-started/List its customers");

  // the request shows up in the log, as the quickstart promises
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip() });
  const reqs = await account.ctx.get("/api/requests/export?env=test");
  expect(await reqs.text()).toContain("customers");

  for (const slug of NARRATIVE.slice(1)) {
    for (const b of await blocksOf(page, slug)) {
      const id = `${slug}/${b.heading}`;
      if (b.lang === "bash") {
        const calls = await runBash(b.code, narrativeSim);
        for (const c of calls) expect(c.status, `${id}: ${c.raw}`).toBeLessThan(300);
        if (/qbd\/invoices/.test(b.code)) expect(calls[0]!.body).toMatchObject({ refNumber: "1042" });
        covered.add(id);
      } else if (b.lang === "json" && id === "api/Pagination") {
        const doc = JSON.parse(b.code) as Record<string, unknown>;
        const real = await runBash(`curl '${BASE}/v1/qbd/customers?limit=1' -H "Authorization: Bearer $WIREBOOK_API_KEY" -H 'X-End-User-Id: acme-42'`, narrativeSim);
        expect(Object.keys(doc).sort()).toEqual(Object.keys(real[0]!.body as object).sort());
        covered.add(id);
      } else if (b.lang === "json" && id === "api/Errors") {
        const doc = JSON.parse(b.code) as { error: Record<string, unknown> };
        // the same QuickBooks answer the example shows: 3140 for a customer that is not in the file
        const real = await runBash(`curl -X POST '${BASE}/v1/qbd/invoices' -H "Authorization: Bearer $WIREBOOK_API_KEY" -H 'X-End-User-Id: acme-42' -H 'Content-Type: application/json' -d '{"customerRef":{"fullName":"Nobody"},"lines":[{"itemRef":{"fullName":"Consulting"}}]}'`, narrativeSim);
        const err = (real[0]!.body as { error: Record<string, unknown> }).error;
        expect(err.code).toBe(doc.error.code);
        expect(Object.keys(doc.error).sort()).toEqual(Object.keys(err).sort());
        covered.add(id);
      }
    }
  }
});

test("resource pages: every curl, TypeScript and Python example creates its record against a sample file", async ({ page }) => {
  test.setTimeout(900_000);
  const slugs = (await (await page.request.get("/sitemap.xml")).text()).match(/\/docs\/resource-[a-z-]+/g)!.map((s) => s.slice(6));
  expect(slugs.length).toBeGreaterThan(10);
  for (const slug of slugs) {
    for (const b of await blocksOf(page, slug)) {
      const id = `${slug}/${b.heading}`;
      if (b.lang === "text") continue; // field tables
      const sim = new QbwcSimulator(async (xml) => {
        const r = await page.request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
        return { status: r.status(), body: await r.text() };
      }, creds, sampleFile(b.code));
      if (b.lang === "bash") {
        const [c] = await runBash(b.code, sim);
        expect(c!.status, `${id}: ${c!.raw}`).toBe(201);
      } else if (b.lang === "ts") {
        await runFile("mts", tsSource(b, null), {}, sim);
      } else if (b.lang === "python") {
        await runFile("py", pySource(b.code), {}, sim);
      } else throw new Error(`${id}: no runner for ${b.lang}`);
      covered.add(id);
    }
  }
});

test("SDK and webhook pages: every sample runs", async ({ page }) => {
  test.setTimeout(300_000);
  const mkSim = (code: string) => new QbwcSimulator(async (xml) => {
    const r = await page.request.post("/qbwc", { data: xml, headers: { "content-type": "text/xml" } });
    return { status: r.status(), body: await r.text() };
  }, creds, sampleFile(code));

  const sdk = await blocksOf(page, "sdks");
  const first = sdk.find((b) => b.lang === "ts" && /^import /m.test(b.code))!;
  const setup = first.code.split("\n").filter((l) => /^import |new Wirebook|forUser/.test(l)).join("\n");
  for (const b of sdk) {
    const id = `sdks/${b.heading}`;
    if (NOT_RUN[id]) {
      await expect(page.getByText(NOT_RUN[id].pageSays).first()).toBeVisible();
      covered.add(id);
      continue;
    }
    if (b.lang === "ts") await runFile("mts", tsSource(b, setup), {}, mkSim(b.code));
    else if (b.lang === "python") await runFile("py", pySource(b.code), {}, mkSim(b.code));
    else throw new Error(`${id}: no runner for ${b.lang}`);
    covered.add(id);
  }

  const wh = await blocksOf(page, "webhooks");
  const node = wh.find((b) => b.heading === "Verify in Node")!;
  // sign with the product's own signer, verify with the documented snippet, and refuse a tampered body
  const harness = `${node.code}\nimport { signPayload as __sign } from ${JSON.stringify(path.join(ROOT, "src/lib/webhooks/outbound.ts"))};\nconst __body = JSON.stringify({ id: "evt_1", type: "test.ping", created: 1, data: { message: "Test event" } });\nconst __h = await __sign("whsec_docs", __body);\nif (!verify("whsec_docs", __body, __h)) throw new Error("valid signature rejected");\nif (verify("whsec_docs", __body + " ", __h)) throw new Error("tampered body accepted");\nconsole.log(JSON.stringify({ body: __body, header: __h }));`;
  const signed = JSON.parse((await runFile("mts", harness)).out.trim().split("\n").at(-1)!) as { body: string; header: string };
  covered.add("webhooks/Verify in Node");
  const py = wh.find((b) => b.heading === "Verify in Python")!;
  await runFile("py", `${py.code}\nimport os\nassert verify("whsec_docs", os.environ["BODY"].encode(), os.environ["HEADER"])\nassert not verify("whsec_docs", (os.environ["BODY"] + " ").encode(), os.environ["HEADER"])\n`, { BODY: signed.body, HEADER: signed.header });
  covered.add("webhooks/Verify in Python");
  for (const b of wh.filter((x) => x.lang === "json")) {
    const text = b.code.replace(/^\/\/.*$/gm, "");
    for (const chunk of text.split(/\n\s*\n/).filter((c) => c.trim())) expect(() => JSON.parse(chunk), `webhooks/${b.heading}`).not.toThrow();
    covered.add(`webhooks/${b.heading}`);
  }
});

test("no docs page has a code block this suite does not run or check", async ({ page }) => {
  const slugs = (await (await page.request.get("/sitemap.xml")).text()).match(/\/docs\/[a-z-]+/g)!.map((s) => s.slice(6));
  const missing: string[] = [];
  for (const slug of new Set(slugs)) {
    for (const b of await blocksOf(page, slug)) {
      if (b.lang === "text") continue; // reference tables, not commands
      if (!covered.has(`${slug}/${b.heading}`)) missing.push(`${slug}/${b.heading} (${b.lang})`);
    }
  }
  expect(missing).toEqual([]);
});
