import type { Metadata } from "next";
import { Section } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { footedExample, money, rates } from "@/lib/pricing";
import { product } from "@/config/product";

const title = "Pricing";
const description = `${product.name} costs ${money(rates.perFile)} per active company file per month, ${money(rates.perFileAnnualMonthly)} billed yearly. A free Developer tier has unlimited sample files. Every price is published.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing" },
};

const billingFaq = [
  { q: "What counts as an active file?", a: "A company file counts in a month only if a data request succeeded for it that month. Sample files never count." },
  { q: "Do I need a card for the Developer tier?", a: "No. The Developer tier has unlimited QuickBooks sample company files and up to 3 real company files a month." },
  { q: "When does the Starter Pack make sense?", a: `It covers up to ${rates.packFiles} active files for ${money(rates.packMonthly)} a month (${money(rates.packAnnualMonthly)} billed yearly). Files beyond that are ${money(rates.perFile)} each.` },
  { q: "What is the Volume rate?", a: `${money(rates.volumeFile)} per file from file ${rates.volumeFromFiles} upward, invoiced monthly.` },
  { q: "What does migration cost?", a: "The first 2 months are $0 for files moved from another QuickBooks Desktop API or a home grown Web Connector server." },
];

export default function PricingPage() {
  const ex = footedExample(10);
  return (
    <>
      <Section labelledBy="pricing-title">
        <h1 className="sr-only">{title}</h1>
        <PricingTable title="Same job. Half the price. Every price on this page." />
      </Section>
      <Section tone="raised" labelledBy="total-title">
        <h2 id="total-title" className="heading-4 text-text">The arithmetic, footed</h2>
        <div className="figures mt-8 max-w-xl text-text">
          <p className="flex justify-between gap-4 py-2 caption-1"><span>{ex.files} files × {money(rates.perFile)}</span><span>{money(ex.ours)}</span></p>
          <p className="footing flex justify-between gap-4 pt-3 body-2"><span>{product.name}, per month</span><strong>{money(ex.ours)}</strong></p>
          <p className="mt-6 flex justify-between gap-4 caption-2 text-text-subtle"><span>The same {ex.files} files at {money(rates.benchmark)}</span><span>{money(ex.theirs)}</span></p>
        </div>
        <p className="mt-4 max-w-xl caption-2 text-text-subtle">
          {product.benchmark.name} lists {money(rates.benchmark)} per company file per month ({product.benchmark.host}, checked {product.benchmark.checked}). {product.fullName} charges {money(rates.perFile)}.
        </p>
      </Section>
      <Faq title="Billing questions" items={billingFaq} />
    </>
  );
}
