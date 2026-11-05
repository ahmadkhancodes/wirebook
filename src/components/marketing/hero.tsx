import type { ReactNode } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";

export interface HeroProps {
  title: ReactNode;
  subtitle: ReactNode;
  primaryCta: { href: string; label: string };
  secondaryCta?: { href: string; label: string };
  /** Risk reversal, directly under the CTA. */
  risk?: ReactNode;
  /** Proof line adjacent to the claim. */
  proof?: ReactNode;
  /** The REAL product UI. */
  visual: ReactNode;
}

/** Left-aligned hero: claim, one action, proof next to it; the product itself sits beside it on desktop. */
export function Hero({ title, subtitle, primaryCta, secondaryCta, risk, proof, visual }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="bg-surface pb-12 pt-8 md:pb-24 md:pt-16">
      <Container>
        <div className="grid items-start gap-12 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col items-start gap-6 lg:col-span-5">
            <h1 id="hero-title" className="heading-3 md:heading-1 max-w-2xl text-text">{title}</h1>
            <p className="body-3 max-w-md text-text-subtle md:title-2">{subtitle}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <ButtonLink href={primaryCta.href} size="lg">{primaryCta.label}</ButtonLink>
              {secondaryCta ? (
                <Link href={secondaryCta.href} className="inline-flex min-h-11 items-center rounded-sm button-sm text-focus underline underline-offset-4 focus-visible:focus-ring">
                  {secondaryCta.label}
                </Link>
              ) : null}
            </div>
            {risk ? <p className="-mt-3 caption-5 text-text-subtle">{risk}</p> : null}
            {proof ? <p className="max-w-md border-t border-border pt-4 caption-2 text-text-subtle">{proof}</p> : null}
          </div>
          <div className="min-w-0 lg:col-span-7">{visual}</div>
        </div>
      </Container>
    </section>
  );
}
