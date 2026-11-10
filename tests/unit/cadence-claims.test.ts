import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { product } from "@/config/product";
import { docs as docPages } from "@/content/docs";
import cron from "../../vercel.json";

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const publicFiles = [...walk("src/content"), ...walk("src/app/(marketing)"), ...walk("src/components/marketing")].filter((f) => /\.(ts|tsx)$/.test(f));

describe("cadence claims match production infrastructure", () => {
  it("the constant agrees with the scheduler: daily crons, at most two", () => {
    expect(cron.crons.length).toBeLessThanOrEqual(2);
    for (const c of cron.crons) expect(c.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
    if (product.cadence.hours === 24) expect(product.cadence.word).toBe("daily");
  });

  it("docs describing background jobs use the cadence wording", () => {
    const text = JSON.stringify(docPages);
    expect(text).toContain(product.cadence.within);
    if (product.cadence.hours >= 24) expect(text).not.toMatch(/every (minute|hour|\d+ minutes)|within (a few )?minutes/i);
  });

  it("no public page promises sub-daily background work while cadence is daily", () => {
    if (product.cadence.hours < 24) return;
    for (const f of publicFiles) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/(checked|updated|synced) \d+ ?(min|minutes|seconds) ago|retries every \d+ ?min|every (minute|hour)\b|within (a few )?minutes|\breal-?time\b(?!,? ?\.)(?<!not real.?time)/i);
    }
  });

  it("visitors see no sample/demo/stub wording", () => {
    for (const f of publicFiles) {
      const s = readFileSync(f, "utf8");
      expect(s, f).not.toMatch(/sample data|\(sample\)|\bdemo\b|not configured in this environment/i);
    }
  });
});
