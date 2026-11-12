import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Section, SectionHead } from "@/components/ui/layout";

export interface FaqItem {
  q: string;
  /** Plain text: reused verbatim in the FAQPage JSON-LD. */
  a: string;
}

export function Faq({ index = "08", title = "Questions, answered", items }: { index?: string; title?: string; items: FaqItem[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
  return (
    <Section pad="lg" labelledBy="faq-title">
      <SectionHead index={index} label="Questions" id="faq-title" title={title} />
      <div className="mt-8 grid md:mt-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-9 lg:col-start-4">
          {items.map((item) => (
            <details key={item.q} className="group border-t border-border last:border-b">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 title-3 text-text transition-colors duration-300 ease-out-kit hover:text-action-hover focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus size={20} weight="regular" aria-hidden className="shrink-0 transition-transform duration-300 ease-out-kit group-open:rotate-45" />
              </summary>
              <p className="body-6 max-w-2xl pb-6 text-text-subtle">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </Section>
  );
}
