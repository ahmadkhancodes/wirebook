import Link from "next/link";
import type { ReactNode } from "react";
import { Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import { plans, product } from "@/config/product";
import { footedExample, money, rates } from "@/lib/pricing";

const mono = (children: ReactNode) => <span className="figures text-text">{children}</span>;

/** Problem: prose on the left, real error strings with red pencil circles on the right. */
export interface ErrorLine {
  code: string;
  meaning: string;
}
export function ProblemSection({ title, intro, errors }: { title: ReactNode; intro: ReactNode; errors: ErrorLine[] }) {
  return (
    <Section tone="raised" labelledBy="problem-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col gap-4 lg:col-span-5">
          <h2 id="problem-title" className="heading-4 text-text">{title}</h2>
          <p className="body-3 text-text-subtle">{intro}</p>
        </div>
        <figure className="min-w-0 overflow-hidden rounded-md border border-border bg-surface lg:col-span-7">
          <figcaption className="border-b border-border bg-surface-sunken px-4 py-2 caption-4 text-text-subtle">From our error catalogue</figcaption>
          <ul className="perf figures">
            {errors.map((e) => (
              <li key={e.code} className="flex flex-col gap-1 border-b border-border py-3 pr-4 pl-10 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="w-fit shrink-0 rounded-full border border-danger px-3 caption-3 text-danger sm:w-36 sm:text-center">{e.code}</span>
                <span className="font-sans body-6 text-text">{e.meaning}</span>
              </li>
            ))}
          </ul>
        </figure>
      </div>
    </Section>
  );
}

/** Pricing teaser: a ruled table with a footed total, from product.ts only. */
export function PricingTeaser() {
  const dev = plans.find((p) => p.id === "free");
  const ex = footedExample(10);
  const rows: { label: string; price: ReactNode; note?: string }[] = [
    { label: dev?.name ?? "Developer", price: mono("$0"), note: "Unlimited sample company files" },
    { label: "Production", price: mono(money(rates.perFile)), note: "per active file, per month" },
    { label: "Production, billed yearly", price: mono(money(rates.perFileAnnualMonthly)), note: "per file, per month" },
    { label: `Starter Pack, ${rates.packFiles} files`, price: mono(money(rates.packMonthly)), note: "per month" },
    { label: "Volume", price: mono(money(rates.volumeFile)), note: `per file at ${rates.volumeFromFiles}+ files` },
    { label: "Enterprise", price: <span className="body-5 text-text">Custom</span> },
  ];
  return (
    <Section labelledBy="pricing-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="flex flex-col items-start gap-4 lg:col-span-5">
          <h2 id="pricing-title" className="heading-4 text-text">Same job. Half the price. Every price on this page.</h2>
          <p className="body-3 text-text-subtle">A file counts only if a data request succeeded that month. Sample files never count.</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <ButtonLink href={product.cta.href} size="md">{product.cta.label}</ButtonLink>
            <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-sm button-sm text-focus underline underline-offset-4 focus-visible:focus-ring">See all plans</Link>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Wirebook prices</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 body-5 text-text">{r.label}</th>
                  <td className="py-3 pr-4 text-right">{r.price}</td>
                  <td className="hidden py-3 caption-2 text-text-subtle sm:table-cell">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="figures footing mt-4 flex flex-col gap-1 pt-3 caption-1 text-text">
            <p>{ex.files} files: {ex.files} × {money(rates.perFile)} = <strong>{money(ex.ours)} per month</strong></p>
            <p className="text-text-subtle">The same {ex.files} files at {money(rates.benchmark)} = {money(ex.theirs)} ({product.benchmark.name}, checked {product.benchmark.checked})</p>
          </div>
        </div>
      </div>
    </Section>
  );
}

const compareRows = [
  { who: "Conductor", price: `$49 per company file per month`, source: `conductor.is, checked ${product.benchmark.checked}`, href: "/compare/conductor" },
  { who: "Desktop Accounting API", price: "$49 per active file per month, 30 day trial", source: `desktopaccountingapi.com, checked ${product.benchmark.checked}` },
  { who: "Apideck Launch", price: "$599 per month for 25 consumers; QuickBooks Desktop in beta", source: `apideck.com/pricing, checked ${product.benchmark.checked}` },
  { who: "Do it yourself", price: "Free code. You own SOAP, sessions, qbXML order and retries.", source: "qbwc-kit and QuickBooks-PHP, open source" },
];

/** Compare strip: every competitor cell dated and sourced. */
export function CompareStrip() {
  return (
    <Section tone="raised" labelledBy="compare-title">
      <div className="flex max-w-2xl flex-col gap-4">
        <h2 id="compare-title" className="heading-4 text-text">What the alternatives charge, and what you take on</h2>
      </div>
      <div className="mt-8 overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-xl border-collapse text-left">
          <caption className="sr-only">Competitor prices, dated and sourced</caption>
          <thead>
            <tr className="border-b border-border text-text-subtle">
              <th scope="col" className="px-4 py-3 caption-3">Option</th>
              <th scope="col" className="px-4 py-3 caption-3">Published price</th>
              <th scope="col" className="px-4 py-3 caption-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((r) => (
              <tr key={r.who} className="border-b border-border last:border-b-0">
                <th scope="row" className="px-4 py-3 body-5 text-text">
                  {r.href ? <Link href={r.href} className="text-focus underline underline-offset-4 focus-visible:focus-ring">{r.who}</Link> : r.who}
                </th>
                <td className="px-4 py-3 body-6 text-text">{r.price}</td>
                <td className="px-4 py-3 caption-2 text-text-subtle">{r.source}</td>
              </tr>
            ))}
            <tr className="bg-surface-sunken">
              <th scope="row" className="px-4 py-3 body-5 text-text">{product.fullName}</th>
              <td className="figures px-4 py-3 caption-1 text-text">{money(rates.perFile)} per active file per month</td>
              <td className="px-4 py-3 caption-2 text-text-subtle">This site</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="body-3 mt-6 max-w-2xl text-text-subtle">
        Need one schema across QuickBooks Online, Xero and NetSuite? Use a unified API such as Apideck. We only do QuickBooks Desktop, and we do it for half the price.
      </p>
      <p className="mt-4"><Link href="/compare/conductor" className="inline-flex min-h-11 items-center rounded-sm button-sm text-focus underline underline-offset-4 focus-visible:focus-ring">Read the full comparison with Conductor</Link></p>
    </Section>
  );
}

/** Honest two column fit: who it is for and who it is not for. */
export function FitSection({ yes, no }: { yes: ReactNode; no: ReactNode }) {
  return (
    <Section labelledBy="fit-title">
      <h2 id="fit-title" className="heading-4 max-w-2xl text-text">Who it is for, and who it is not</h2>
      <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-16">
        <div className="flex flex-col gap-3 border-t border-text pt-4">
          <h3 className="heading-6 text-text">A good fit</h3>
          <div className="body-3 text-text-subtle">{yes}</div>
        </div>
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="heading-6 text-text">Not a fit</h3>
          <div className="body-3 text-text-subtle">{no}</div>
        </div>
      </div>
    </Section>
  );
}
