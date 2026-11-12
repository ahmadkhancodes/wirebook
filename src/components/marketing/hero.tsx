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
  /** Proof line adjacent to the claim. */
  proof?: ReactNode;
  /** The REAL product UI, full container width under the claim. */
  visual: ReactNode;
}

/**
 * Split claim: the headline takes seven columns on the left, the how, the action and the proof sit in a
 * narrow column to its right. The product runs the full width underneath, starting inside the first screen.
 */
export function Hero({ title, subtitle, primaryCta, secondaryCta, risk, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-border bg-surface pt-8 pb-12 md:pt-16 md:pb-20">
      <Container>
        <div className="grid items-start gap-6 lg:grid-cols-12 lg:gap-8">
          <h1 id="hero-title" className="heading-3 md:heading-1 xl:display-1 text-text lg:col-span-7">{title}</h1>
          <div className="flex min-w-0 flex-col items-start gap-4 lg:col-span-5 lg:pt-2">
            <p className="body-3 text-text-subtle md:title-2">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? <Link href={secondaryCta.href} className={textLinkClass}>{secondaryCta.label}</Link> : null}
            </div>
            {risk ? <p className="caption-5 text-text-subtle">{risk}</p> : null}
            {proof ? <p className="border-t border-border pt-4 caption-2 text-text-subtle">{proof}</p> : null}
          </div>
        </div>
        <div className="mt-8 min-w-0 md:mt-12">{visual}</div>
      </Container>
    </section>
  );
}
