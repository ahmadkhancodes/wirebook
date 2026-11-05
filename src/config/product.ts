/**
 * THE single source of product identity, plans, limits, flags and copy constants.
 * KIT_COPY.md step 2: a new product edits this file (and the tokens in globals.css) and nothing else in src/lib.
 */

export type PlanId = "free" | "production" | "starter_pack" | "volume";
export type Interval = "month" | "year";
/** The meter is active company files: a file counts in a month only if a data request succeeded (sample files never count). */
export type MeterId = "files";

export interface PlanPrice {
  interval: Interval;
  /** USD cents charged per billing interval: monthly = per file per month; annual = per file prepaid for 12 months (12 x the per-month annual rate). */
  usd: number;
  /** Stripe lookup key, always `${product.slug}_${plan}_${interval}` (app isolation, C-28). */
  lookupKey: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Empty for the free plan. */
  prices: PlanPrice[];
  limits: Record<MeterId, number>;
  /** Short plain-text differences shown in the pricing table. */
  highlights: string[];
  cta: string;
  featured?: boolean;
  /** Days of trial. 0 = no trial (Wirebook: the free Developer tier is the trial). */
  trialDays: number;
}

const slug = "wirebook";
const price = (plan: PlanId, interval: Interval, usd: number): PlanPrice => ({
  interval,
  usd,
  lookupKey: `${slug}_${plan}_${interval === "month" ? "monthly" : "annual"}`,
});

export const product = {
  slug,
  name: "Wirebook",
  fullName: "Wirebook by BufferSol",
  company: "BufferSol Technologies",
  companyUrl: "https://buffersoltech.com",
  host: "wirebook.buffersoltech.com",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://wirebook.buffersoltech.com",
  supportEmail: "support@buffersoltech.com",
  legalEmail: "legal@buffersoltech.com",
  mailFrom: "Wirebook <hello@wirebook.buffersoltech.com>",
  description:
    "QuickBooks Desktop, as a normal API. REST, typed TypeScript and Python SDKs, and a connect flow your customers can finish alone. $24.99 per company file.",
  tagline: "QuickBooks Desktop, as a normal API",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies",
    jurisdiction: "{{jurisdiction}}",
    address: "{{registered address}}",
    effectiveDate: "2026-11-05",
  },
  subProcessors: [
    { name: "Vercel Inc.", purpose: "Hosting and edge network", location: "United States" },
    { name: "MongoDB Inc. (Atlas)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
    { name: "Stripe Inc.", purpose: "Payments and invoicing", location: "United States" },
    { name: "Email delivery provider", purpose: "Transactional email until our own mail servers are live", location: "United States" },
  ],
  currency: "usd" as const,
  /** Default billing interval shown first in the pricing toggle. */
  defaultInterval: "year" as Interval,
  plans: [
    {
      id: "free",
      name: "Developer",
      tagline: "Build and test against sample company files",
      prices: [],
      limits: { files: 3 },
      highlights: ["Unlimited sample company files", "Up to 3 non-production files on request", "Unlimited test API calls", "Full SDKs and dashboard, no card"],
      cta: "Start free",
      trialDays: 0,
    },
    {
      id: "production",
      name: "Production",
      tagline: "Per active company file",
      prices: [price("production", "month", 2499), price("production", "year", 23988)],
      limits: { files: 1 },
      highlights: ["$24.99 per active file a month, $19.99 billed yearly", "A file is billed only if a data request succeeded that month", "Unlimited API usage within rate limits", "Email support"],
      cta: "Choose Production",
      trialDays: 0,
    },
    {
      id: "starter_pack",
      name: "Starter Pack",
      tagline: "Four files at a lower rate",
      prices: [price("starter_pack", "month", 9799), price("starter_pack", "year", 99588)],
      limits: { files: 4 },
      highlights: ["Up to 4 active files, then $24.99 each", "$82.99 a month billed yearly", "Shared support channel in your Slack or Teams", "Webhooks and MCP (roadmap)"],
      cta: "Choose Starter Pack",
      featured: true,
      trialDays: 0,
    },
    {
      id: "volume",
      name: "Volume",
      tagline: "50 or more active files",
      prices: [price("volume", "month", 1699)],
      limits: { files: 50 },
      highlights: ["$16.99 per file from file 50 upward", "Monthly invoice", "Shared channel and 1 business day response"],
      cta: "Choose Volume",
      trialDays: 0,
    },
  ] satisfies Plan[],
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 7,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  nav: [
    { href: "/pricing", label: "Pricing" },
    { href: "/docs", label: "Docs" },
  ],
} as const;

export type Product = typeof product;
export const plans: readonly Plan[] = product.plans;
export const planById = (id: string): Plan | undefined => plans.find((p) => p.id === id);
export const freePlan = plans.find((p) => p.prices.length === 0) ?? plans[0]!;
export const allLookupKeys = (): string[] => plans.flatMap((p) => p.prices.map((x) => x.lookupKey));
export const planForLookupKey = (key: string | null | undefined): { plan: Plan; price: PlanPrice } | null => {
  if (!key) return null;
  for (const plan of plans) for (const p of plan.prices) if (p.lookupKey === key) return { plan, price: p };
  return null;
};
