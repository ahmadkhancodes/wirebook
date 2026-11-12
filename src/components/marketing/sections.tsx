import Link from "next/link";
import type { ReactNode } from "react";
import { Section, SectionHead, textLinkClass } from "@/components/ui/layout";
import { SessionCta } from "@/components/marketing/session-cta";
import { plans, product } from "@/config/product";
import { footedExample, money, rates } from "@/lib/pricing";

const mono = (children: ReactNode) => <span className="numerals title-2 text-text">{children}</span>;

/** Problem: the error strings every Web Connector team has met, as a dense reference table on the column band. */
export interface ErrorLine {
  code: string;
  meaning: string;
}
export function ProblemSection({ title, intro, errors }: { title: ReactNode; intro: ReactNode; errors: ErrorLine[] }) {
  return (
    <Section tone="sunken" pad="md" labelledBy="problem-title">
      <SectionHead index="01" label="The problem" id="problem-title" title={title} intro={intro} />
      <div className="mt-8 grid lg:grid-cols-12 lg:gap-8 md:mt-12">
        <figure className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised lg:col-span-9 lg:col-start-4">
          <figcaption className="flex items-center justify-between gap-4 border-b border-border px-4 py-2 caption-4 text-text-subtle">
            <span>From our error catalogue</span>
            <Link href="/errors" className="inline-flex min-h-11 items-center rounded-sm text-text underline decoration-action underline-offset-4 focus-visible:focus-ring sm:min-h-0">All guides</Link>
          </figcaption>
          <dl>
            {errors.map((e) => (
              <div key={e.code} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-12 sm:gap-4">
                <dt className="figures caption-1 text-danger sm:col-span-3 sm:border-r sm:border-border">{e.code}</dt>
                <dd className="body-6 text-text sm:col-span-9">{e.meaning}</dd>
              </div>
            ))}
          </dl>
        </figure>
      </div>
    </Section>
  );
}

/** Pricing teaser: a receipt. Rows from product.ts only, footed with the 10 file example. */
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
    <Section pad="lg" labelledBy="pricing-title">
      <SectionHead
        index="05"
        label="Pricing"
        id="pricing-title"
        title="Same job. Half the price. Every price on this page."
        intro="A file counts only if a data request succeeded that month. Sample files never count."
      />
      <div className="mt-8 grid gap-8 md:mt-12 lg:grid-cols-12">
        <div className="min-w-0 rounded-lg border border-border bg-surface-raised p-4 sm:p-6 lg:col-span-6 lg:col-start-4">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Wirebook prices</caption>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border">
                  <th scope="row" className="py-3 pr-4 align-top">
                    <span className="block body-5 text-text">{r.label}</span>
                    {r.note ? <span className="block caption-5 text-text-subtle">{r.note}</span> : null}
                  </th>
                  <td className="py-3 text-right align-top">{r.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="figures footing mt-4 flex flex-col gap-1 py-3 caption-4 text-text">
            <p className="flex justify-between gap-4"><span>{ex.files} files × {money(rates.perFile)}</span><strong className="numerals body-1">{money(ex.ours)} per month</strong></p>
            <p className="flex justify-between gap-4 text-text-subtle"><span>The same {ex.files} files at {money(rates.benchmark)} ({product.benchmark.name}, checked {product.benchmark.checked})</span><span>{money(ex.theirs)}</span></p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 lg:col-span-3">
          <SessionCta cta={product.cta} size="md" />
          <Link href="/pricing" className={textLinkClass}>See all plans</Link>
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
    <Section tone="sunken" pad="md" labelledBy="compare-title">
      <SectionHead
        index="06"
        label="Alternatives"
        id="compare-title"
        title="What the alternatives charge, and what you take on"
        intro="Need one schema across QuickBooks Online, Xero and NetSuite? Use a unified API such as Apideck. We only do QuickBooks Desktop, and we do it for half the price."
      />
      <div className="mt-8 overflow-x-auto rounded-lg border border-border bg-surface-raised md:mt-12">
        <table className="ledger-cols w-full min-w-xl border-collapse text-left">
          <caption className="sr-only">Competitor prices, dated and sourced</caption>
          <thead>
            <tr className="border-b-4 border-double border-text bg-surface-sunken text-text-subtle">
              <th scope="col" className="px-4 py-2 caption-4">Option</th>
              <th scope="col" className="px-4 py-2 caption-4">Published price</th>
              <th scope="col" className="px-4 py-2 caption-4">Source</th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((r) => (
              <tr key={r.who} className="border-b border-border">
                <th scope="row" className="px-4 py-3 body-5 text-text">
                  {r.href ? <Link href={r.href} className="rounded-sm underline decoration-action underline-offset-4 focus-visible:focus-ring">{r.who}</Link> : r.who}
                </th>
                <td className="px-4 py-3 body-6 text-text">{r.price}</td>
                <td className="px-4 py-3 caption-2 text-text-subtle">{r.source}</td>
              </tr>
            ))}
            <tr className="bg-action-surface">
              <th scope="row" className="px-4 py-3 body-4 text-text">{product.fullName}</th>
              <td className="numerals px-4 py-3 body-4 text-text">{money(rates.perFile)} per active file per month</td>
              <td className="px-4 py-3 caption-2 text-text">This site</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-4"><Link href="/compare/conductor" className={textLinkClass}>Read the full comparison with Conductor</Link></p>
    </Section>
  );
}

/** Honest two column fit: who it is for and who it is not for. */
export function FitSection({ yes, no }: { yes: ReactNode; no: ReactNode }) {
  return (
    <Section pad="md" labelledBy="fit-title">
      <SectionHead index="07" label="Fit" id="fit-title" title="Who it is for, and who it is not" />
      <div className="mt-8 grid gap-8 md:mt-12 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-3 lg:col-span-5 lg:col-start-4">
          <span aria-hidden className="mb-1 block h-1 border-y border-text" />
          <h3 className="title-3 text-text">A good fit</h3>
          <div className="body-6 text-text-subtle">{yes}</div>
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4">
          <span aria-hidden className="mb-1 block h-1 border-y border-border" />
          <h3 className="title-3 text-text">Not a fit</h3>
          <div className="body-6 text-text-subtle">{no}</div>
        </div>
      </div>
    </Section>
  );
}

/** One fact a visitor can check before signing up: what it is, and where to look. */
export interface ProofLine {
  fact: string;
  detail: string;
  href: string;
  linkLabel: string;
}

/**
 * Social proof, honestly: no customer quotes exist yet, so the section lists facts anyone can verify on this site,
 * entered like ledger lines (folio, entry, where to check). The empty quote line says so instead of inventing one.
 */
export function ProofSection({ title, intro, lines, quoteNote }: { title: ReactNode; intro?: ReactNode; lines: ProofLine[]; quoteNote: ReactNode }) {
  return (
    <Section pad="md" labelledBy="proof-title">
      <SectionHead index="04" label="Proof" id="proof-title" title={title} intro={intro} />
      <div className="mt-8 grid md:mt-12 lg:grid-cols-12 lg:gap-8">
        <ol className="lg:col-span-9 lg:col-start-4">
          {lines.map((l, i) => (
            <li key={l.fact} className="grid gap-2 border-b border-border py-4 sm:grid-cols-12 sm:gap-4">
              <span aria-hidden className="numerals title-4 text-text-subtle sm:col-span-1">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex flex-col gap-1 sm:col-span-8">
                <p className="title-3 text-text">{l.fact}</p>
                <p className="body-6 text-text-subtle">{l.detail}</p>
              </div>
              <p className="sm:col-span-3 sm:text-right">
                <Link href={l.href} prefetch={false} className={textLinkClass}>{l.linkLabel}</Link>
              </p>
            </li>
          ))}
          <li className="grid gap-2 py-4 sm:grid-cols-12 sm:gap-4">
            <span aria-hidden className="numerals title-4 text-text-subtle sm:col-span-1">{String(lines.length + 1).padStart(2, "0")}</span>
            <p className="body-6 text-text-subtle sm:col-span-11">{quoteNote}</p>
          </li>
        </ol>
      </div>
    </Section>
  );
}
