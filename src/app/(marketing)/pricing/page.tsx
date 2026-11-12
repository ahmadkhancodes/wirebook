import type { Metadata } from "next";
import { Section, SectionHead } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq } from "@/components/marketing/faq";
import { footedExample, money, rates } from "@/lib/pricing";
import { socialImages } from "@/lib/seo";
import { product } from "@/config/product";

const title = "Pricing";
const description = `${product.name} costs ${money(rates.perFile)} per active company file per month, ${money(rates.perFileAnnualMonthly)} billed yearly. A free Developer tier has unlimited sample files. Every price is published.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
  openGraph: { title: `${title} · ${product.fullName}`, description, url: "/pricing", images: socialImages().og },
  twitter: { card: "summary_large_image", images: socialImages().twitter },
};

const billingFaq = [
  { q: "What counts as an active file?", a: "A company file counts in a month only if a data request succeeded for it that month. Sample files never count." },
  { q: "Do I need a card for the Developer tier?", a: "No. The Developer tier has unlimited QuickBooks sample company files and up to 3 real company files a month." },
  { q: "When does the Starter Pack make sense?", a: `It covers up to ${rates.packFiles} active files for ${money(rates.packMonthly)} a month (${money(rates.packAnnualMonthly)} billed yearly). Files beyond that are ${money(rates.perFile)} each.` },
  { q: "What is the Volume rate?", a: `${money(rates.volumeFile)} per file from file ${rates.volumeFromFiles} upward, invoiced monthly.` },
  { q: "What does migration cost?", a: "Moving from another QuickBooks Desktop API or a home grown Web Connector server? Write to us and we will agree a free migration period." },
];

export default function PricingPage() {
  const ex = footedExample(10);
  return (
    <>
      <Section pad="md" labelledBy="pricing-title" className="border-b border-border">
        <PricingTable headingLevel={1} title="Same job. Half the price. Every price on this page." />
      </Section>
      <Section tone="sunken" pad="lg" labelledBy="total-title">
        <SectionHead index="02" label="Arithmetic" id="total-title" title="The arithmetic, footed" intro="Ten active company files on Production, monthly. Sample files and files with no successful request that month are not on the bill." />
        <div className="mt-8 grid md:mt-12 lg:grid-cols-12 lg:gap-8">
          <div className="figures rounded-lg border border-border bg-surface-raised p-6 text-text lg:col-span-6 lg:col-start-4">
            <p className="flex justify-between gap-4 border-b border-dashed border-border pb-3 caption-1"><span>{ex.files} files × {money(rates.perFile)}</span><span>{money(ex.ours)}</span></p>
            <p className="flex justify-between gap-4 border-b border-dashed border-border py-3 caption-1 text-text-subtle"><span>Sample company files</span><span>$0.00</span></p>
            <p className="footing mt-4 flex justify-between gap-4 pt-3 body-1"><span>{product.name}, per month</span><span>{money(ex.ours)}</span></p>
            <p className="mt-6 flex justify-between gap-4 caption-2 text-text-subtle"><span>The same {ex.files} files at {money(rates.benchmark)}</span><span>{money(ex.theirs)}</span></p>
          </div>
          <p className="mt-4 caption-2 text-text-subtle lg:col-span-3 lg:mt-0">
            {product.benchmark.name} lists {money(rates.benchmark)} per company file per month ({product.benchmark.host}, checked {product.benchmark.checked}). {product.fullName} charges {money(rates.perFile)}.
          </p>
        </div>
      </Section>
      <Faq index="03" title="Billing questions" items={billingFaq} />
    </>
  );
}
