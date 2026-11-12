import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SessionCta } from "@/components/marketing/session-cta";
import { Section } from "@/components/ui/layout";
import { CompareTable } from "@/components/marketing/compare-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { comparisonBySlug, comparisons } from "@/content/compare";
import { socialImages } from "@/lib/seo";
import { product } from "@/config/product";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) return {};
  return {
    title: entry.title,
    description: entry.description,
    alternates: { canonical: `/compare/${entry.slug}` },
    openGraph: { title: entry.title, description: entry.description, url: `/compare/${entry.slug}`, images: socialImages().og },
    twitter: { card: "summary_large_image", images: socialImages().twitter },
  };
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) notFound();

  return (
    <>
      <Section labelledBy="compare-title">
        <div className="flex max-w-2xl flex-col items-start gap-6">
          <h1 id="compare-title" className="heading-3 md:heading-2 text-text">{entry.headline}</h1>
          <p className="body-3 text-text-subtle md:title-1">{entry.intro}</p>
          <SessionCta cta={product.cta} size="lg" />
        </div>
        <div className="mt-12 md:mt-16">
          <CompareTable
            caption={`${product.name} compared with ${entry.competitor}`}
            columns={[entry.competitor, product.name]}
            highlightColumn={1}
            rows={entry.rows.map((r) => ({ label: r.label, values: [...r.values] }))}
          />
        </div>
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">{entry.fitNote}</p>
        <p className="caption-2 mt-4 max-w-2xl text-text-subtle">Competitor facts last checked {entry.checked}, from the competitor&apos;s own pages and Apideck where noted. Source: our research brief, competitor tab (04). Webhooks and SOC 2 rest on Apideck&apos;s comparison alone, so check with the vendor before you decide.</p>
      </Section>
      <Faq title="Common questions" items={entry.faq} />
      <FinalCta
        title="Try it on a sample company file"
        body="Create a key, connect a sample file and send your first request."
        cta={product.cta}
        note="No card. Unlimited sample files."
      />
    </>
  );
}
