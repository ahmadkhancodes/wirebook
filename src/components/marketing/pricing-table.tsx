"use client";
import { useState } from "react";
import Link from "next/link";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { product, plans, type Interval, type Plan } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { money } from "@/lib/pricing";

/** What a plan shows for the chosen interval. A plan sold one way shows that way. All numbers come from product.ts. */
function display(plan: Plan, interval: Interval) {
  if (plan.prices.length === 0) return null;
  const price = plan.prices.find((p) => p.interval === interval) ?? plan.prices[0]!;
  const yearly = price.interval === "year";
  const perUnitMonthly = yearly ? price.usd / 12 : price.usd;
  const perFile = plan.id !== "starter_pack";
  return {
    amount: money(perUnitMonthly),
    unit: perFile ? "per file, per month" : `per month, ${plan.limits.files} files`,
    billed: yearly ? `Billed ${money(price.usd)} a year${perFile ? " per file" : ""}` : "Billed monthly",
    interval: price.interval,
  };
}

function annualSavings(): string | null {
  const pct = plans.flatMap((p) => {
    const m = p.prices.find((x) => x.interval === "month");
    const y = p.prices.find((x) => x.interval === "year");
    return m && y ? [Math.round((1 - y.usd / (m.usd * 12)) * 100)] : [];
  });
  if (!pct.length) return null;
  const lo = Math.min(...pct);
  const hi = Math.max(...pct);
  return lo === hi ? `${hi}%` : `${lo}% to ${hi}%`;
}

export function PricingTable({ id = "pricing", title, headingLevel = 2 }: { id?: string; title?: string; headingLevel?: 1 | 2 }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const saving = annualSavings();
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Billed yearly" },
  ];
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const PlanHeading = headingLevel === 1 ? "h2" : "h3";

  return (
    <div id={id}>
      <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <p className="index-label flex items-center gap-2 text-text-subtle"><span aria-hidden className="size-2 bg-action" />Rate card</p>
          {title ? <Heading id={`${id}-title`} className="heading-4 md:heading-2 text-text">{title}</Heading> : null}
        </div>
        {saving ? (
          <div className="flex flex-col gap-2 lg:col-span-4 lg:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit rounded-sm border border-text bg-surface">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "min-h-11 px-4 button-sm transition-colors duration-300 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-text text-text-inverse" : "text-text-subtle hover:bg-surface-sunken hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="caption-2 text-text-subtle lg:text-right">Billing yearly saves {saving} on Production and Starter Pack.</p>
          </div>
        ) : null}
      </div>

      <ul className="mt-8 grid overflow-hidden rounded-lg border border-border bg-surface-raised md:mt-12 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan, i) => {
          const d = display(plan, interval);
          const href = `/sign-in?plan=${plan.id}&interval=${d?.interval ?? interval}`;
          return (
            <li
              key={plan.id}
              className={cn(
                "relative flex flex-col border-border p-6",
                i > 0 && "border-t md:border-t-0",
                i % 2 === 1 && "md:border-l",
                i >= 2 && "md:border-t lg:border-t-0",
                i === 2 && "lg:border-l",
                plan.featured && "bg-action-surface",
              )}
            >
              {plan.featured ? <span aria-hidden className="absolute top-0 right-0 left-0 h-1 bg-action" /> : null}
              <div className="flex min-h-12 flex-col gap-1">
                <PlanHeading className="heading-6 text-text">{plan.name}</PlanHeading>
                <p className="index-label text-text-subtle">{plan.featured ? "Best for 4 files" : "\u00a0"}</p>
              </div>
              <p className="mt-2 min-h-10 body-6 text-text-subtle">{plan.tagline}</p>
              <p className="figures mt-6 text-text">
                <span className="heading-3 tracking-tight">{d ? d.amount : "$0"}</span>
              </p>
              <p className="body-6 text-text">{d ? d.unit : "free, no card"}</p>
              <p className="mt-1 caption-2 text-text-subtle">{d ? d.billed : "Unlimited sample company files"}</p>
              <Link href={href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "mt-6 w-full")}>{plan.cta}</Link>
              <ul className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 body-6 text-text">
                    <Check size={16} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-success" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 caption-2 text-text-subtle">No card for Developer. Cancel any time from Settings, then Billing; the plan runs to the end of the paid period, and a first payment is refundable in full within 14 days. Enterprise is custom: talk to us if you need a contract or more than the Volume tier.</p>
    </div>
  );
}
