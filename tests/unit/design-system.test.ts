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
  it("loads the Ledger pairing (Bitter, Libre Franklin, JetBrains Mono) and no banned or old faces", () => {
    expect(fonts).toMatch(/\bBitter\b/);
    expect(fonts).toMatch(/Libre_Franklin/);
    expect(fonts).toMatch(/JetBrains_Mono/);
    expect(fonts).not.toMatch(/\b(Inter|Geist|Roboto|Spectral|Public_Sans|Archivo|IBM_Plex_Sans|IBM_Plex_Mono)\b/);
  });

  it("uses forest ink on mint ledger paper, not cream, indigo or the old steel and orange", () => {
    expect(css).toMatch(/--surface:\s*var\(--paper-50\)/);
    expect(css).toMatch(/--paper-50:\s*#f1f7f2/i);
    expect(css).toMatch(/--action:\s*var\(--forest-500\)/);
    expect(css).toMatch(/--forest-500:\s*#1a5c3c/i);
    expect(css).not.toMatch(/#f7f8f4/i);
    expect(css).not.toMatch(/#(6366f1|4f46e5|7c3aed|8b5cf6)/i);
  });

  it("has no trace of the previous brand tokens anywhere in src", () => {
    // Signal orange, steel and graphite from the "Work order" look, and the green-black OG/icon colours before it.
    const old = /#(c0461a|9c3712|fceee7|e8a27f|17191e|f1f2f4|dcdfe4|4d5360|767d89|14201a|e8f1e4|c9d3c6|181818)\b|--signal-|signal-on-dark|\bArchivo\b|IBM Plex|IBM_Plex|"wdth"/i;
    for (const [p, s] of source) expect(s, p).not.toMatch(old);
    expect(readFileSync("src/lib/mail/templates.ts", "utf8")).toMatch(/#1a5c3c/);
  });

  it("draws the ledger motifs: double rules and column rulings", () => {
    expect(css).toMatch(/@utility footing \{[^}]*3px double/);
    expect(css).toMatch(/\.ledger-cols/);
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
