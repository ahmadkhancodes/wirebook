import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards for the 12 Nov 2026 redesign (docs/design-brief.md). Each check fails on the old "ledger" look.
const css = readFileSync("src/app/globals.css", "utf8");
const fonts = readFileSync("src/app/fonts.ts", "utf8");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}
const source = files("src").map((p) => [p, readFileSync(p, "utf8")] as const);

describe("design system", () => {
  it("loads the Archivo / IBM Plex pairing and no banned or old faces", () => {
    expect(fonts).toMatch(/Archivo/);
    expect(fonts).toMatch(/IBM_Plex_Sans/);
    expect(fonts).toMatch(/IBM_Plex_Mono/);
    expect(fonts).not.toMatch(/\b(Inter|Geist|Roboto|Spectral|Public_Sans)\b/);
  });

  it("uses the signal orange accent on cool steel, not cream paper or indigo", () => {
    expect(css).toMatch(/--action:\s*var\(--signal-500\)/);
    expect(css).toMatch(/--signal-500:\s*#c0461a/i);
    expect(css).not.toMatch(/#f7f8f4/i);
    expect(css).not.toMatch(/#(6366f1|4f46e5|7c3aed|8b5cf6)/i);
  });

  it("caps radius at 4px and has no background gradients", () => {
    for (const m of css.matchAll(/--radius-[a-z0-9]+:\s*(\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(4);
    for (const [p, s] of source) {
      expect(s, p).not.toMatch(/bg-gradient|linear-gradient|rounded-full|rounded-3xl|backdrop-blur/);
    }
  });

  it("has no arbitrary font sizes and no banned filler copy", () => {
    for (const [p, s] of source) {
      expect(s, p).not.toMatch(/text-\[\d/);
      expect(s, p).not.toMatch(/Everything you need|streamline|seamless|supercharge|effortless|revolutioni[sz]e/i);
    }
  });
});
