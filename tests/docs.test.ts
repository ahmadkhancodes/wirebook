import { describe, expect, it } from "vitest";
import { docs } from "@/content/docs";
import { OBJECTS } from "@/lib/v1/objects";
import { OPS, keyOf } from "@/lib/qbxml/spec";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import { product } from "@/config/product";
import { CATALOGUE } from "@/lib/errors/catalogue";
import sitemap from "@/app/sitemap";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";

const bySlug = (slug: string) => {
  const d = docs.find((x) => x.slug === slug);
  if (!d) throw new Error(`missing docs page ${slug}`);
  return d;
};
const text = (slug: string) => bySlug(slug).sections.flatMap((s) => [s.heading, ...s.body, s.code?.code ?? ""]).join("\n");
const section = (slug: string, heading: string) => bySlug(slug).sections.find((s) => s.heading === heading);

describe("docs registry", () => {
  it("has unique slugs, titles, descriptions and non-empty sections", () => {
    for (const k of ["slug", "title", "description"] as const) expect(new Set(docs.map((d) => d[k])).size).toBe(docs.length);
    for (const d of docs) {
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.sections.length).toBeGreaterThan(0);
      for (const s of d.sections) expect(s.body.length > 0 || s.code).toBeTruthy();
      expect(new Set(d.sections.map((s) => s.heading)).size).toBe(d.sections.length);
      expect(JSON.stringify(d)).not.toMatch(/—/);
    }
  });

  it("has the new guide pages", () => {
    for (const s of ["resources", "idempotency", "webhooks", "sdks", "limits", "retention", "troubleshooting"]) expect(bySlug(s)).toBeTruthy();
  });

  it("lists every slug in the sitemap, llms.txt and llms-full.txt", async () => {
    const urls = sitemap().map((s) => s.url);
    const idx = await llms().text();
    const full = await llmsFull().text();
    for (const d of docs) {
      expect(urls).toContain(`${product.url}/docs/${d.slug}`);
      expect(idx).toContain(`/docs/${d.slug}`);
      expect(full).toContain(`/docs/${d.slug}`);
    }
  });
});

describe("resource pages", () => {
  it("has a page per object, with create fields for every key of the add spec", () => {
    for (const [segment, def] of Object.entries(OBJECTS)) {
      const create = section(`resource-${segment}`, "Create fields")!;
      expect(create, segment).toBeTruthy();
      const lines = create.code!.code.split("\n").map((l) => l.split(/\s+/)[0]);
      for (const f of OPS[def.add].spec) expect(lines, `${segment}.${keyOf(f)}`).toContain(keyOf(f) + (f.kind === "list" && f.children?.length ? "[]" : f.kind === "list" ? "[]" : ""));
    }
  });

  it("has an update table only for objects with a mod operation", () => {
    for (const [segment, def] of Object.entries(OBJECTS)) {
      const upd = section(`resource-${segment}`, "Update fields")!;
      if (def.mod) {
        expect(upd.code, segment).toBeTruthy();
        expect(upd.code!.code).toContain("revisionNumber");
        const rows = upd.code!.code.split("\n").map((l) => l.split(/\s+/)[0]);
        for (const f of OPS[def.mod].spec) if (!["listId", "txnId"].includes(keyOf(f))) expect(rows).toContain(keyOf(f) + (f.kind === "list" ? "[]" : ""));
      } else {
        expect(upd.code, segment).toBeUndefined();
        expect(text(`resource-${segment}`)).toContain("not_supported");
      }
    }
  });

  it("documents txnLineId on transaction updates", () => {
    expect(section("resource-invoices", "Update fields")!.code!.code).toContain("txnLineId");
    expect(text("resource-invoices")).toContain('"-1"');
  });
});

describe("guide pages", () => {
  it("webhooks mentions every event type", () => {
    const t = text("webhooks");
    for (const e of WEBHOOK_EVENTS) expect(t).toContain(e.type);
    expect(t).toContain("test.ping");
    expect(t).toContain("X-Webhook-Signature");
  });

  it("limits contains the numbers from product.abuse", () => {
    const t = text("limits");
    const n = (x: number) => x.toLocaleString("en-US");
    expect(t).toContain(n(product.abuse.keyPerMinute));
    expect(t).toContain(n(product.abuse.ipPerMinute));
    expect(t).toContain(String(product.abuse.badKeysPerMinute));
    for (const v of Object.values(product.abuse.dailyRequests)) expect(t).toContain(n(v));
    expect(t).toContain(String(product.abuse.syncWaitMs / 1000));
  });

  it("troubleshooting lists every quickbooks and connection catalogue entry", () => {
    const table = section("troubleshooting", "QuickBooks status codes and connection errors")!.code!.code;
    for (const c of CATALOGUE.filter((x) => x.type === "quickbooks" || x.type === "connection")) {
      expect(table).toContain(c.code);
      expect(table).toContain(`/errors/${c.slug}`);
    }
  });

  it("every behaviour page carries the simulator honesty note", () => {
    for (const s of ["resources", "idempotency", "webhooks", "sdks", "limits", "retention", "troubleshooting"]) expect(text(s)).toContain("not yet against a real QuickBooks Desktop install");
    for (const [segment] of Object.entries(OBJECTS)) expect(text(`resource-${segment}`)).toContain("not yet against a real QuickBooks Desktop install");
  });

  it("retention matches the privacy periods", () => {
    const t = text("retention");
    expect(t).toContain(`${product.retention.payloadDays} days`);
    expect(t).toContain(`${product.retention.metadataDays} days`);
  });
});
