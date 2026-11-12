import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

type Tone = "base" | "raised" | "sunken" | "inverse";
type Pad = "sm" | "md" | "lg";
const tones: Record<Tone, string> = {
  base: "bg-surface",
  raised: "bg-surface-raised",
  sunken: "bg-surface-sunken",
  inverse: "bg-surface-inverse text-text-inverse",
};
const pads: Record<Pad, string> = { sm: "py-12 md:py-16", md: "py-12 md:py-20", lg: "py-16 md:py-24" };

/** Marketing section. `pad` varies on purpose so the page never repeats one rhythm. */
export function Section({ id, tone = "base", pad = "lg", className, children, labelledBy }: { id?: string; tone?: Tone; pad?: Pad; className?: string; children: ReactNode; labelledBy?: string }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(pads[pad], tones[tone], className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * Ledger heading: the folio column (a slab numeral and the label) closed by a double column ruling,
 * the title and intro in the entries column, and a double rule under the whole head.
 */
export function SectionHead({ index, label, title, intro, id, inverse }: { index: string; label: string; title: ReactNode; intro?: ReactNode; id: string; inverse?: boolean }) {
  return (
    <div className={cn("grid gap-4 border-b-4 border-double pb-8 lg:grid-cols-12 lg:gap-0", inverse ? "border-text-inverse-subtle" : "border-text")}>
      <p className={cn("flex items-baseline gap-3 self-stretch lg:col-span-3 lg:flex-col lg:gap-1 lg:border-r-4 lg:border-double lg:pr-8", inverse ? "text-text-inverse-subtle lg:border-text-inverse-subtle" : "text-text-subtle lg:border-border-strong")}>
        <span className={cn("numerals heading-5 md:heading-3", inverse ? "text-text-inverse" : "text-text")}>{index}</span>
        <span className="index-label">{label}</span>
      </p>
      <div className="flex max-w-3xl flex-col gap-4 lg:col-span-9 lg:pl-8">
        <h2 id={id} className="heading-5 md:heading-3">{title}</h2>
        {intro ? <div className={cn("body-3 max-w-2xl", inverse ? "text-text-inverse-subtle" : "text-text-subtle")}>{intro}</div> : null}
      </div>
    </div>
  );
}

/** Text link with the forest underline. One style for every inline "read more" style link. */
export const textLinkClass =
  "inline-flex min-h-11 items-center gap-1 rounded-sm button-sm text-text underline decoration-action decoration-2 underline-offset-4 transition-colors duration-300 ease-out-kit hover:text-action-hover focus-visible:focus-ring";
