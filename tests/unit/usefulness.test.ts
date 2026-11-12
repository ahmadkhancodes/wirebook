import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { product } from "@/config/product";
import { docs } from "@/content/docs";
import { CATALOGUE } from "@/lib/errors/catalogue";
import { keyPrefixFor } from "@/lib/auth/index";
import { connectLinkCurl, createCurl, createInvoiceCurl, exportKey, listCustomersCurl, meCurl } from "@/lib/snippets";

// Usefulness pass (docs/QA-REPORT.md): the copy-paste commands, key prefixes and plan numbers the docs promise.

/** Parse a command with bash itself and print each argument on its own line, so quoting is checked by the real shell. */
const argv = (cmd: string, env: Record<string, string> = {}) =>
  execFileSync("bash", ["-c", `printargs() { for a in "$@"; do printf '%s\\n' "$a"; done; }\n${cmd.replace(/^curl /gm, "printargs ")}`], { env: { ...process.env, ...env }, encoding: "utf8" }).trim().split("\n");

describe("snippets", () => {
  it("never contain a key; the key comes from $WIREBOOK_API_KEY and expands in the shell", () => {
    for (const c of [meCurl("https://x.test"), connectLinkCurl("https://x.test"), listCustomersCurl("https://x.test"), createInvoiceCurl("https://x.test")]) {
      expect(c).not.toMatch(/sk_(test|live)_[A-Za-z0-9]/);
      expect(argv(c, { WIREBOOK_API_KEY: "sk_test_abc" })).toContain("Authorization: Bearer sk_test_abc");
    }
  });
  it("quote URLs (zsh treats an unquoted ? as a glob) and survive hostile ids", () => {
    expect(listCustomersCurl("https://x.test/")).toContain("'https://x.test/v1/qbd/customers?limit=5'");
    const a = argv(listCustomersCurl("https://x.test", "o'neil & $HOME"));
    expect(a).toContain("X-End-User-Id: o'neil & $HOME");
    const body = argv(connectLinkCurl("https://x.test", "it's", "Bob's \"Shop\"")).at(-1)!;
    expect(JSON.parse(body)).toEqual({ externalId: "it's", companyName: "Bob's \"Shop\"" });
    expect(argv(createCurl("https://x.test", "customers", { name: "O'Neil" })).at(-1)).toBe('{"name":"O\'Neil"}');
  });
  it("exportKey puts the real key in single quotes", () => {
    expect(argv(`${exportKey("sk_test_a'b")}\necho "$WIREBOOK_API_KEY"`.replace("echo", "printargs"))).toEqual(["sk_test_a'b"]);
  });
});

describe("API keys say their environment", () => {
  it("sk_live_ only for production metadata, sk_test_ otherwise", () => {
    expect(keyPrefixFor({ environment: "production" })).toBe("sk_live_");
    expect(keyPrefixFor({ environment: "test" })).toBe("sk_test_");
    expect(keyPrefixFor(null)).toBe("sk_test_");
    expect(keyPrefixFor({ environment: "PRODUCTION" })).toBe("sk_test_");
  });
  it("the server sets the prefix in a before hook, whatever the client sends", () => {
    const src = readFileSync("src/lib/auth/index.ts", "utf8");
    expect(src).toMatch(/ctx\.path !== "\/api-key\/create"/);
    expect(src).toMatch(/prefix: keyPrefixFor\(/);
  });
});

describe("plan numbers in docs match the code", () => {
  const all = [...docs.flatMap((d) => d.sections.flatMap((s) => [...s.body, s.code?.code ?? ""])), ...CATALOGUE.flatMap((e) => Object.values(e).filter((v): v is string => typeof v === "string"))].join("\n");
  it("the Developer file allowance", () => {
    const found = [...all.matchAll(/(\d+) (?:active |real )?company files a month/g)];
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) expect(Number(m[1])).toBe(product.billing.developerFiles);
  });
  it("connect links last 24 hours everywhere", () => {
    expect(all).not.toMatch(/valid for (?!24 hours)\d+ (hours|days)/);
  });
});

describe("first-run glue", () => {
  it("the checklist tracks keys and sends 'Add company file' to the dashboard form", () => {
    const page = readFileSync("src/app/app/page.tsx", "utf8");
    expect(page).toContain("orgHasApiKey(ctx.org.id, env)");
    expect(page).toContain("/app/end-users?env=${env}#add");
    expect(page).toContain("/docs/getting-started#list-its-customers");
    expect(docs.find((d) => d.slug === "getting-started")!.sections.map((s) => s.heading)).toContain("List its customers");
  });
  it("an invitee skips onboarding", () => {
    expect(readFileSync("src/app/(auth)/onboarding/page.tsx", "utf8")).toMatch(/next\.startsWith\("\/accept-invite\/"\)\) redirect\(next\)/);
  });
});
