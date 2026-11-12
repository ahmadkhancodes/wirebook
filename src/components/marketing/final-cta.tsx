import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";

/** The close: a heavy signal rule, the claim on the left, the same action as the hero on the right. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <Section pad="md" labelledBy="final-cta-title">
      <div className="grid gap-6 border-t-4 border-action pt-8 lg:grid-cols-12 lg:items-end lg:gap-8">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <h2 id="final-cta-title" className="heading-4 md:heading-2 max-w-3xl text-text">{title}</h2>
          {body ? <p className="body-3 max-w-2xl text-text-subtle">{body}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-2 lg:col-span-4 lg:items-end">
          <ButtonLink href={cta.href} size="lg">{cta.label}</ButtonLink>
          {note ? <p className="caption-2 text-text-subtle">{note}</p> : null}
        </div>
      </div>
    </Section>
  );
}
