import type { ReactNode } from "react";
import { Section, SectionHead } from "@/components/ui/layout";
import { Reveal } from "@/components/ui/reveal";

export interface Step {
  title: string;
  body: ReactNode;
  /** A UI fragment or code sample, not an icon. */
  visual: ReactNode;
}

/** Three stages on the wire: a signal line runs across the top on desktop and down the left on phones. */
export function HowItWorks({ index = "03", title, steps }: { index?: string; title: ReactNode; steps: Step[] }) {
  return (
    <Section tone="sunken" pad="lg" labelledBy="how-title">
      <SectionHead index={index} label="How it works" id="how-title" title={title} />
      <ol className="relative mt-12 grid gap-12 md:mt-16 lg:grid-cols-3 lg:gap-8">
        <span aria-hidden className="absolute top-2 right-0 left-0 hidden h-0.5 bg-action lg:block" />
        <span aria-hidden className="absolute top-2 bottom-0 left-2 w-0.5 bg-action lg:hidden" />
        {steps.map((step, i) => (
          <li key={step.title} className="relative min-w-0 pl-8 lg:pt-8 lg:pl-0">
            <span aria-hidden className="absolute top-0 left-0 size-4 border-2 border-action bg-surface-sunken" />
            <Reveal className="flex flex-col gap-4">
              <p className="index-label text-text-subtle" aria-hidden>Stage {String(i + 1).padStart(2, "0")}</p>
              <h3 className="heading-6 text-text"><span className="sr-only">Step {i + 1}: </span>{step.title}</h3>
              <div className="body-6 text-text-subtle">{step.body}</div>
              <div className="min-w-0">{step.visual}</div>
            </Reveal>
          </li>
        ))}
      </ol>
    </Section>
  );
}
