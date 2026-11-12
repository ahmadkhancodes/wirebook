import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container, textLinkClass } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Risk reversal, directly under the CTA. */
  risk?: ReactNode;
  /** Proof beside the claim: on the home page, the published prices footed like a ledger. */
  proof?: ReactNode;
  /** Running head of the ledger page, left and right. */
  head?: [ReactNode, ReactNode];
  /** The REAL product UI, full container width under the claim. */
  visual: ReactNode;
}

/**
 * A ledger page: a running head closed by a double rule, the claim in the wide left column, a column ruling,
 * the proof in the narrow right column, and the product on a ruled sheet underneath, inside the first screen.
 */
export function Hero({ title, subtitle, primaryCta, secondaryCta, risk, proof, head, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface pt-6 pb-12 md:pt-8 md:pb-20">
      <Container>
        {head ? (
          <div className="rule-double flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-2 index-label text-text-subtle">
            <span>{head[0]}</span>
            <span>{head[1]}</span>
          </div>
        ) : null}
        <div className="grid items-stretch gap-8 pt-8 md:pt-12 lg:grid-cols-12 lg:gap-0">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-7 lg:pr-12">
            <h1 id="hero-title" className="heading-3 md:heading-1 xl:display-1 text-text">{title}</h1>
            <p className="body-3 max-w-xl text-text-subtle md:title-2">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? <Link href={secondaryCta.href} className={textLinkClass}>{secondaryCta.label}</Link> : null}
            </div>
            {risk ? <p className="caption-5 text-text-subtle">{risk}</p> : null}
          </div>
          {proof ? <div className="min-w-0 border-t border-border pt-6 lg:col-span-5 lg:border-t-0 lg:border-l-4 lg:border-double lg:border-border-strong lg:pt-0 lg:pl-8">{proof}</div> : null}
        </div>
        <div className="mt-10 min-w-0 md:mt-16">{visual}</div>
      </Container>
    </section>
  );
}
