import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brokenConnectionEmail, inviteEmail, magicLinkEmail, noticeEmail, otpEmail } from "@/lib/mail/templates";

const css = readFileSync("src/app/globals.css", "utf8");
const tokens = new Set([...css.matchAll(/--[a-z0-9-]+:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]!.toLowerCase()));

describe("post-redesign regression", () => {
  const mails = [magicLinkEmail("https://x.test/a"), otpEmail("123456"), inviteEmail({ orgName: "Acme", inviter: "Sam", url: "https://x.test/i", role: "admin" }), noticeEmail({ title: "T", body: "B", actionUrl: "https://x.test", actionLabel: "Go" }), brokenConnectionEmail({ company: "Co", reason: "r", url: "https://x.test" })];
  it("every colour in every e-mail is a Ledger design token", () => {
    for (const m of mails) {
      for (const hex of m.html.match(/#[0-9a-f]{6}\b/gi) ?? []) expect(tokens.has(hex.toLowerCase()), `${hex} in "${m.subject}"`).toBe(true);
    }
  });
  it("e-mails carry no dark-mode media query or old font stack", () => {
    for (const m of mails) {
      expect(m.html).not.toMatch(/prefers-color-scheme|color-scheme/i);
      expect(m.html).not.toMatch(/Spectral|Public Sans|Archivo|Inter\b/);
    }
  });
  it("the usage banner says 'reached' at exactly the limit and 'over' only above it", () => {
    const src = readFileSync("src/components/app/usage-banner.tsx", "utf8");
    expect(src).toMatch(/worst\.used > worst\.limit/);
    expect(src).toMatch(/You have reached your limit/);
  });
  it("the billing page explains a canceled checkout return", () => {
    expect(readFileSync("src/app/app/billing/page.tsx", "utf8")).toMatch(/checkout\) === "canceled"/);
    expect(readFileSync("src/app/app/billing/billing-client.tsx", "utf8")).toMatch(/Checkout was canceled/);
  });
});
