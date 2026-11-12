import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|html)$/.test(n)) out.push(p);
  }
  return out;
}

const files = [...walk("src"), ...walk("scripts"), "docs/design/mock.html"];
const banned: [string, RegExp][] = [
  ["dark: utility", /(^|[\s"'`{(])dark:[a-z-]/],
  ["prefers-color-scheme: dark", /prefers-color-scheme:\s*dark/],
  ["data-theme", /data-theme/],
  ["dark custom variant or class set", /@custom-variant\s+dark|\[data-theme|:root\.dark|\.dark\s*\{/],
  ["theme toggle / init script", /ThemeToggle|themeInitScript|theme-script|Switch to (dark|light) theme/],
  ["theme localStorage key", /localStorage\.(get|set)Item\(\s*["']theme["']/],
  ["color-scheme: dark", /color-scheme:\s*dark/],
];

describe("light only", () => {
  for (const [name, re] of banned) {
    it(`source has no ${name}`, () => {
      const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits).toEqual([]);
    });
  }
  it("globals.css declares color-scheme: light", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/color-scheme:\s*light/);
  });
});
