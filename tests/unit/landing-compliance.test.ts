import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Landing page compliance with .claude/skills/landing-page-design and docs/factory/DESIGN_PLAYBOOK.md (12 Nov 2026).
const read = (p: string) => readFileSync(p, "utf8");
const css = read("src/app/globals.css");
const home = read("src/app/(marketing)/page.tsx");
const hero = read("src/components/marketing/hero.tsx");
const tagline = read("src/components/marketing/tagline-reveal.tsx");
const header = read("src/components/marketing/site-header.tsx");
const signedIn = read("src/components/marketing/use-signed-in.ts");
const button = read("src/components/ui/button.tsx");

const SCALE_PX = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128];

describe("type scale in the global CSS", () => {
  it("every font-size lands on a Tailwind step", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map(([, n, u]) => (u === "rem" ? Number(n) * 16 : Number(n)));
    expect(sizes.length).toBeGreaterThan(20);
    expect(sizes.filter((px) => !SCALE_PX.includes(px))).toEqual([]);
  });

  it("no weight above 700 and no italics", () => {
    const weights = [...css.matchAll(/font-weight:\s*(\d+)/g)].map(([, w]) => Number(w));
    expect(weights.every((w) => w <= 700)).toBe(true);
    expect(css).not.toMatch(/font-style:\s*italic/);
  });

  it("defines the named text styles once", () => {
    for (const name of ["heading-1", "heading-6", "title-3", "body-4", "body-6", "button-md", "caption-2", "caption-5"]) {
      expect(css.match(new RegExp(`@utility ${name} \\{`, "g"))?.length).toBe(1);
    }
  });
});

describe("hero", () => {
  it("caps heading and subheading at 680px", () => {
    expect(css).toMatch(/@utility hero-measure \{ max-width: 680px; \}/);
    expect(hero).toMatch(/<h1 [^>]*className="[^"]*\bhero-measure\b/);
    expect(hero).toMatch(/<p className="[^"]*\bhero-measure\b[^"]*">\{subtitle\}/);
    expect(hero).not.toMatch(/display-1/);
  });

  it("keeps a space where the heading breaks, so its text reads 'Desktop, as'", () => {
    expect(home).toMatch(/QuickBooks Desktop,\{" "\}<br \/>as a normal API/);
  });

  it("has no single sided border on the proof column", () => {
    expect(hero).not.toMatch(/border-l-4/);
  });
});

describe("tagline reveal (B11)", () => {
  it("observes each word with an IntersectionObserver, not a scroll listener", () => {
    expect(tagline).toMatch(/new IntersectionObserver/);
    expect(tagline).not.toMatch(/addEventListener\("scroll"/);
  });

  it("mutes unlit words to 30% of the text colour", () => {
    expect(css).toMatch(/\.kit-word \{ color: color-mix\(in srgb, currentColor 30%, transparent\)/);
  });

  it("shows the final colour at once under reduced motion", () => {
    expect(tagline).toMatch(/prefers-reduced-motion: reduce\)"\)\.matches[^\n]*\n\s*lightAll\(\);/);
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced.slice(0, 400)).toMatch(/\.kit-word \{ color: inherit; transition: none; \}/);
  });

  it("sits further down the page, not directly under the hero", () => {
    const order = ["<Hero", "<ProblemSection", "<TaglineReveal"].map((t) => home.indexOf(t));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe("motion and buttons", () => {
  it("staggers the mobile menu 60ms with a 400ms cap and no transition under 300ms", () => {
    expect(header).toMatch(/STAGGER_MS = 60/);
    expect(header).toMatch(/STAGGER_CAP_MS = 400/);
    expect(header).not.toMatch(/duration-(75|100|150|200)\b/);
    expect(header).toMatch(/backdrop-blur/);
  });

  it("main buttons pad 8px by 12px", () => {
    expect(button).toMatch(/md: "button-sm min-h-11 px-3 py-2"/);
    expect(button).toMatch(/lg: "button-md min-h-12 px-3 py-2"/);
  });

  it("marketing pages never load the better-auth client", () => {
    expect(signedIn).not.toMatch(/from "(@\/lib\/auth\/client|better-auth[^"]*)"/);
  });
});

describe("marketing copy has no hyphens", () => {
  // Visible copy values on the home page: FAQ, benefits, steps, proof lines and section props.
  const copy = [
    ...home.matchAll(/\b(?:q|a|title|body|fact|detail|linkLabel):\s*"([^"]+)"/g),
    ...home.matchAll(/\b(?:title|intro|quoteNote|text|body|note|risk|yes|no)="([^"]+)"/g),
  ].map((m) => m[1]!);
  // Identifiers that keep their hyphen: HTTP headers, file names, product and package names.
  const allowed = /^(Idempotency-Key|SHA-256|qbwc-kit|QuickBooks-PHP|harlan-\w+|INV-\d+)$/;

  it("finds the copy", () => {
    expect(copy.length).toBeGreaterThan(30);
  });

  it("uses no hyphen between words outside identifiers", () => {
    const bad = copy.flatMap((s) => s.match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) ?? []).filter((w) => !allowed.test(w));
    expect(bad).toEqual([]);
  });
});
