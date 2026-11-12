import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export interface Step { title: string; body: string; href: string; cta: string; done: boolean }

/** First-run checklist shown on an empty request log. State comes from what the server has observed, never from client flags. */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const next = steps.findIndex((s) => !s.done);
  return (
    <section aria-label="Getting started" className="border border-border-strong bg-surface-raised p-4 sm:p-6">
      <h2 className="heading-6 text-text">Your first request in about ten minutes</h2>
      <p className="mt-1 border-b-4 border-double border-text pb-4 body-6 text-text-muted">{steps.filter((s) => s.done).length} of {steps.length} done. You can use a QuickBooks sample company file: it is free and never billed.</p>
      <ol className="grid">
        {steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[auto_1fr] items-start gap-3 border-b border-border py-3 last:border-b-0 sm:grid-cols-[auto_1fr_auto]">
            <span aria-hidden className={`mt-0.5 numerals grid size-6 shrink-0 place-items-center border title-4 ${s.done ? "border-success bg-success text-white" : "border-border text-text-muted"}`}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text">{s.title}<span className="sr-only">{s.done ? " (done)" : " (to do)"}</span></p>
              <p className="body-6 text-text-muted">{s.body}</p>
            </div>
            {!s.done ? <Link href={s.href} className={buttonClass(i === next ? "primary" : "secondary", "md", "col-start-2 w-fit sm:col-start-auto")}>{s.cta}</Link> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
