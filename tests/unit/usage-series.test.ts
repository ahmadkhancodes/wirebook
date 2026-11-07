import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart, niceMax } from "@/components/app/charts";
import { createMemoryDb } from "@/lib/db/memory";
import { filesByMonth, requestsByDay } from "@/lib/usage-series";

describe("usage series", () => {
  it("requests per day: 30 days oldest first, zeros for quiet days", async () => {
    const db = createMemoryDb("wirebook");
    const now = new Date("2026-11-06T10:00:00Z");
    await db.incUsage("o1", "requests", "2026-11-06", 7);
    await db.incUsage("o1", "requests", "2026-10-08", 2);
    await db.incUsage("o2", "requests", "2026-11-06", 99);
    const s = await requestsByDay(db, "o1", 30, now);
    expect(s).toHaveLength(30);
    expect(s[0]).toEqual({ label: "2026-10-08", value: 2 });
    expect(s.at(-1)).toEqual({ label: "2026-11-06", value: 7 });
    expect(s.filter((p) => p.value === 0)).toHaveLength(28);
  });

  it("files per month: six months across a year boundary", async () => {
    const db = createMemoryDb("wirebook");
    await db.markActiveFile("o1", "2026-11", "a");
    await db.markActiveFile("o1", "2026-11", "b");
    await db.markActiveFile("o1", "2026-01", "a");
    const s = await filesByMonth(db, "o1", 6, new Date("2026-02-20T00:00:00Z"));
    expect(s.map((p) => p.label)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(s.map((p) => p.value)).toEqual([0, 0, 0, 0, 1, 0]);
  });
});

describe("BarChart", () => {
  it("niceMax picks 1, 2, 5 steps", () => {
    expect(niceMax(0)).toBe(5);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(130)).toBe(200);
    expect(niceMax(3200)).toBe(5000);
  });

  it("renders an accessible SVG with the numbers as a table and the limit line", () => {
    const html = renderToStaticMarkup(h(BarChart, { id: "c", title: "Requests per day", unit: "requests", points: [{ label: "2026-11-05", value: 3 }, { label: "2026-11-06", value: 8 }], limit: 10, limitLabel: "Daily cap 10" }));
    expect(html).toContain('role="img"');
    expect(html).toContain("aria-labelledby=\"c-t c-d\"");
    expect(html).toContain("Highest bar 8 requests");
    expect(html).toContain("Daily cap 10");
    expect(html).toContain("<table");
    expect(html).toContain("2026-11-06: 8 requests");
    expect(html).not.toContain("NaN");
  });

  it("an empty series still renders", () => {
    expect(renderToStaticMarkup(h(BarChart, { id: "e", title: "t", unit: "u", points: [] }))).not.toContain("NaN");
  });
});
