import { product } from "@/config/product";
import { money, rates } from "@/lib/pricing";
import type { CompareValue } from "@/components/marketing/compare-table";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  /** Date every competitor fact was read, shown on the page. */
  checked: string;
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  fitNote: string;
  faq: { q: string; a: string }[];
}

const b = product.benchmark;
const dated = (v: string) => `${v} (checked ${b.checked})`;

/** Compare pages. Competitor facts come from docs/brief.md (tab 04) only. Anything not confirmed there is left out. */
export const comparisons: CompareEntry[] = [
  {
    slug: "conductor",
    competitor: b.name,
    title: `${product.name} vs ${b.name}`,
    description: `${product.name} and ${b.name} compared on published price, annual and volume pricing, SDKs, webhooks and what we do not do. Competitor facts checked ${b.checked}.`,
    headline: `${product.name} vs ${b.name}`,
    intro: `Both give you a REST API for QuickBooks Desktop with typed SDKs and a guided connect flow. ${b.name} lists ${money(rates.benchmark)} per company file per month (${b.host}, checked ${b.checked}). ${product.fullName} charges ${money(rates.perFile)}, and publishes annual and volume prices too.`,
    checked: b.checked,
    rows: [
      { label: "Production price per company file, per month", values: [dated(money(rates.benchmark)), money(rates.perFile)] },
      { label: "Published annual price", values: [dated("None published"), `${money(rates.perFileAnnualMonthly)} per file, per month`] },
      { label: "Published volume price", values: [dated("None published"), `${money(rates.volumeFile)} per file at ${rates.volumeFromFiles}+ files`] },
      { label: "Free tier", values: [dated("Free trial, 1 test connection"), "Developer: unlimited sample files"] },
      { label: "SDKs", values: [dated("Node and Python; no C#, Java or PHP"), "TypeScript and Python; C# is on the v1 roadmap"] },
      { label: "Webhooks", values: [dated("None, per Apideck"), "Yes: signed, retried with backoff for about a day"] },
      { label: "Typed endpoints", values: [dated("256"), "Fewer at launch; qbXML passthrough covers the rest"] },
      { label: "MCP server with read only mode", values: [dated("Yes"), "On the v1 roadmap, not shipped"] },
      { label: "SOC 2 Type II", values: [dated("Yes, per Apideck"), "No. Self attested security pack and DPA"] },
      { label: "Data hosting", values: [dated("US only"), "US (Vercel and MongoDB Atlas)"] },
    ],
    fitNote: `${b.name} is the better fit if you need a wider set of typed endpoints, a SOC 2 Type II report, an MCP server today, or a vendor with a long customer list (it states 1,700+ businesses; ${b.host}, checked ${b.checked}). ${product.name} is the better fit if price, published annual and volume rates, and unlimited sample files matter more. We have not yet run against a real QuickBooks install, and we have not verified every ${b.name} feature, so test both before you decide.`,
    faq: [
      { q: `Is ${product.name} really half the price of ${b.name}?`, a: `${b.name} lists ${money(rates.benchmark)} per company file per month (${b.host}, checked ${b.checked}). ${product.name} lists ${money(rates.perFile)}, or ${money(rates.perFileAnnualMonthly)} billed yearly.` },
      { q: "What do I give up?", a: `${b.name} has more typed endpoints, a SOC 2 Type II report per Apideck, and an MCP server. ${product.name} has none of those at launch.` },
      { q: "Can I move from Conductor?", a: "Yes. Files moved from another QuickBooks Desktop API get their first 2 months at $0." },
    ],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
