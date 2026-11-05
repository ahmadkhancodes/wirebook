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

export function PricingTable({ id = "pricing", title }: { id?: string; title?: string }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const saving = annualSavings();
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Billed yearly" },
  ];

  return (
    <div id={id}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        {title ? <h2 id={`${id}-title`} className="heading-4 text-text">{title}</h2> : <span />}
        {saving ? (
          <div className="flex flex-col gap-2 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit rounded-md border border-border-strong bg-surface p-1">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "min-h-11 rounded-sm px-4 button-sm transition-colors duration-200 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-action text-action-text" : "text-text-subtle hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="caption-2 text-text-subtle">Billing yearly saves {saving} on Production and Starter Pack.</p>
          </div>
        ) : null}
      </div>

      <ul className="mt-8 grid gap-4 md:mt-12 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const d = display(plan, interval);
          const href = `/sign-in?plan=${plan.id}&interval=${d?.interval ?? interval}`;
          return (
            <li key={plan.id} className={cn("flex flex-col rounded-md border bg-surface-raised p-6", plan.featured ? "border-action ring-1 ring-action" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="heading-6 text-text">{plan.name}</h3>
                {plan.featured ? <span className="rounded-full border border-action px-2 caption-3 text-text">Best for 4 files</span> : null}
              </div>
              <p className="mt-1 body-6 text-text-subtle">{plan.tagline}</p>
              <p className="figures mt-6 text-text">
                <span className="heading-3">{d ? d.amount : "$0"}</span>
              </p>
              <p className="body-6 text-text-subtle">{d ? d.unit : "free, no card"}</p>
              <p className="mt-1 caption-2 text-text-subtle">{d ? d.billed : "Unlimited sample company files"}</p>
              <Link href={href} className={cn(buttonClass(plan.featured ? "primary" : "secondary", "md"), "mt-6 w-full")}>{plan.cta}</Link>
              <ul className="mt-6 flex flex-col gap-2 border-t border-border pt-6">
                {plan.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 body-6 text-text">
                    <Check size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-success" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 caption-2 text-text-subtle">Enterprise is custom: talk to us if you need a contract or more than the Volume tier.</p>
    </div>
  );
}
