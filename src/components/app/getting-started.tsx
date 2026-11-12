import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export interface Step { title: string; body: string; href: string; cta: string; done: boolean }

/** First-run checklist shown on an empty request log. State comes from what the server has observed, never from client flags. */
export function GettingStarted({ steps }: { steps: Step[] }) {
  const next = steps.findIndex((s) => !s.done);
  return (
    <section aria-label="Getting started" className="rounded-md border border-border bg-surface-raised p-5">
      <h2 className="text-lg font-semibold text-text">Your first request in about ten minutes</h2>
      <p className="mt-1 text-sm text-text-muted">{steps.filter((s) => s.done).length} of {steps.length} done. You can use a QuickBooks sample company file: it is free and never billed.</p>
      <ol className="mt-4 grid gap-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3">
            <span aria-hidden className={`mt-0.5 grid size-6 shrink-0 place-items-center border text-xs font-semibold ${s.done ? "border-success bg-success text-white" : "border-border text-text-muted"}`}>{s.done ? "✓" : i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-text">{s.title}<span className="sr-only">{s.done ? " (done)" : " (to do)"}</span></p>
              <p className="text-sm text-text-muted">{s.body}</p>
            </div>
            {!s.done ? <Link href={s.href} className={buttonClass(i === next ? "primary" : "secondary")}>{s.cta}</Link> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
