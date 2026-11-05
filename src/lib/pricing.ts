import { planById, product, type Interval, type Plan } from "@/config/product";

/** Money formatting for marketing pages. Whole dollars drop the cents. */
export const money = (cents: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** Cents per file per month for a plan at an interval (annual prices are stored as the yearly charge per unit). */
export function perFileMonthly(plan: Plan, interval: Interval): number | null {
  const price = plan.prices.find((p) => p.interval === interval);
  if (!price) return null;
  const perUnit = interval === "year" ? price.usd / 12 : price.usd;
  return perUnit;
}

const must = <T,>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new Error(`product.ts is missing ${what}`);
  return v;
};

const production = must(planById("production"), "production plan");
const pack = must(planById("starter_pack"), "starter_pack plan");
const volume = must(planById("volume"), "volume plan");
const at = (plan: Plan, interval: Interval) => must(plan.prices.find((p) => p.interval === interval), `${plan.id} ${interval} price`).usd;

/** Every figure the marketing pages quote, derived from product.ts so nothing is typed twice. */
export const rates = {
  perFile: at(production, "month"),
  perFileAnnualMonthly: at(production, "year") / 12,
  perFileAnnualYear: at(production, "year"),
  packMonthly: at(pack, "month"),
  packAnnualMonthly: at(pack, "year") / 12,
  packFiles: pack.limits.files,
  volumeFile: at(volume, "month"),
  volumeFromFiles: volume.limits.files,
  benchmark: product.benchmark.usdPerFileMonth * 100,
};

/** Monthly cost of n files at the per-file rate and at the benchmark's rate, for the footed example. */
export function footedExample(files: number) {
  return { files, ours: files * rates.perFile, theirs: files * rates.benchmark };
}
