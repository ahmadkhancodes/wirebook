import type { ReactNode } from "react";
import { Section, SectionHead } from "@/components/ui/layout";
import { cn } from "@/components/ui/cn";

export type FeatureSpan = 2 | 3 | 4 | 6;
export interface Feature {
  title: string;
  body: ReactNode;
  /** Kept for old call sites. Wide items (4 or 6) get a row of their own with the fragment beside the copy. */
  span?: FeatureSpan;
  visual?: ReactNode;
}

/**
 * A spec sheet, not a card grid: wide items are full rows (copy left, the real UI fragment right),
 * narrow items pair up underneath in two uneven columns. Hairlines between, no boxes around copy.
 */
export function Features({ index = "02", title, intro, items }: { index?: string; title: ReactNode; intro?: ReactNode; items: Feature[] }) {
  const wide = items.filter((f) => (f.span ?? 2) >= 4);
  const narrow = items.filter((f) => (f.span ?? 2) < 4);
  return (
    <Section pad="lg" labelledBy="features-title">
      <SectionHead index={index} label="Product" id="features-title" title={title} intro={intro} />
      <ul className="mt-8 md:mt-16">
        {wide.map((f, i) => (
          <li key={f.title} className="grid gap-6 border-t border-border py-8 first:border-t-0 lg:grid-cols-12 lg:gap-8 lg:py-12">
            <div className={cn("flex flex-col gap-2 lg:col-span-4 lg:col-start-4", i % 2 === 1 && "lg:order-2 lg:col-start-9")}>
              <h3 className="heading-6 text-text">{f.title}</h3>
              <p className="body-6 text-text-subtle">{f.body}</p>
            </div>
            {f.visual ? (
              <div className={cn("min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised lg:col-span-5", i % 2 === 1 && "lg:order-1 lg:col-start-4")}>{f.visual}</div>
            ) : null}
          </li>
        ))}
      </ul>
      {narrow.length ? (
        <ul className="grid lg:grid-cols-12 lg:gap-x-8">
          {narrow.map((f, i) => (
            <li key={f.title} className={cn("flex min-w-0 flex-col gap-4 border-t border-border py-8", i % 2 === 0 ? "lg:col-span-5 lg:col-start-4" : "lg:col-span-4")}>
              <div className="flex flex-col gap-2">
                <h3 className="heading-6 text-text">{f.title}</h3>
                <p className="body-6 text-text-subtle">{f.body}</p>
              </div>
              {f.visual ? <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-surface-raised">{f.visual}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
