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
  supportEmail: "contact@buffersoltech.com",
  legalEmail: "contact@buffersoltech.com",
  mailFrom: "Wirebook <hello@wirebook.buffersoltech.com>",
  description:
    "QuickBooks Desktop, as a normal API. REST, typed TypeScript and Python SDKs, and a connect flow your customers can finish alone. $24.99 per company file.",
  tagline: "QuickBooks Desktop, as a normal API",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies LLC",
    jurisdiction: "the State of New York, United States",
    address: "447 W Broadway, 2nd Floor Suite #1964, New York, NY 10013, United States",
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
      highlights: ["Unlimited sample company files", "Up to 3 real company files a month", "Up to 5,000 API calls a day", "Full SDKs and dashboard, no card"],
      cta: "Start free",
      trialDays: 0,
    },
    {
      id: "production",
      name: "Production",
      tagline: "Per active company file",
      prices: [price("production", "month", 2499), price("production", "year", 23988)],
      limits: { files: 1 },
      highlights: ["$24.99 per active file a month, $19.99 billed yearly", "A file is billed only if a data request succeeded that month", "Up to 250,000 API calls a day, within rate limits", "Email support"],
      cta: "Choose Production",
      trialDays: 0,
    },
    {
      id: "starter_pack",
      name: "Starter Pack",
      tagline: "Four files at a lower rate",
      prices: [price("starter_pack", "month", 9799), price("starter_pack", "year", 99588)],
      limits: { files: 4 },
      highlights: ["Up to 4 active files, then $24.99 each", "$82.99 a month billed yearly", "Shared support channel in your Slack or Teams", "Webhooks; MCP on the roadmap"],
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
  /** Data retention (docs/brief.md): payload bodies are purged after `payloadDays`; an org can only shorten it. */
  retention: { payloadDays: 14, minPayloadDays: 1, metadataDays: 90 },
  /** Connection health thresholds, measured from the last Web Connector poll. */
  health: { asleepAfterMs: 2 * 60 * 60 * 1000, brokenAfterMs: 72 * 60 * 60 * 1000 },
  /**
   * Scheduled-job cadence in production (Vercel Hobby: daily crons only, no always-on worker). Every public claim about
   * how soon a background job acts reads from here. When a faster scheduler exists, change `hours` and `word`.
   */
  cadence: { hours: 24, word: "daily", within: "within a day", per: "a day" },
  /** Plan billing rules for the files meter. */
  billing: { starterPackFiles: 4, volumeMinFiles: 50, developerFiles: 3 },
  /**
   * Abuse controls. `dailyRequests` is the fair-use cap on API requests per organization and UTC day (test and production
   * together), by plan. Per-minute limits apply on top: per API key and per source address.
   */
  abuse: {
    dailyRequests: { free: 5_000, production: 250_000, starter_pack: 250_000, volume: 1_000_000 } as Record<PlanId, number>,
    keyPerMinute: 600,
    ipPerMinute: 1_200,
    badKeysPerMinute: 10,
    /** Default wait for QuickBooks before a request answers 202 (fits Vercel Hobby; SYNC_WAIT_MS overrides). */
    syncWaitMs: 55_000,
  },
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 7,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  nav: [
    { href: "/docs", label: "Docs" },
    { href: "/pricing", label: "Pricing" },
    { href: "/compare/conductor", label: "Compare" },
  ],
  /** Dated competitor facts from docs/brief.md (tab 04, prices as published). Cite the date wherever a price is shown. */
  benchmark: {
    name: "Conductor",
    host: "conductor.is",
    usdPerFileMonth: 49,
    checked: "3 Nov 2026",
  },
  /** Primary call to action, one wording everywhere. */
  cta: { label: "Get a free API key", href: "/sign-in" },
  intuitNotice:
    "QuickBooks is a trademark of Intuit Inc. Wirebook by BufferSol is a product of BufferSol Technologies and is not affiliated with or endorsed by Intuit.",
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
