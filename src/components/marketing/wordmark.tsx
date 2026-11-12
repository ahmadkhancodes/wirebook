import { cn } from "@/components/ui/cn";

/** The mark: two posting marks joined by a ledger double rule (your app, the company file). Forest ink, square ends. */
export function WireMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 12" className={cn("h-3 w-6 shrink-0", className)}>
      <rect x="0.5" y="2.5" width="7" height="7" fill="var(--action)" />
      <rect x="2" y="4" width="18" height="1" fill="var(--action)" />
      <rect x="2" y="7" width="18" height="1" fill="var(--action)" />
      <rect x="16.5" y="2.5" width="7" height="7" fill="var(--surface-raised)" stroke="var(--action)" strokeWidth="2" />
    </svg>
  );
}

export function Wordmark({ by = true, className }: { by?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <WireMark />
      <span className="wordmark text-text">wirebook</span>
      {by ? <span className="wordmark-by hidden pt-1 text-text-subtle sm:inline">by BufferSol</span> : null}
    </span>
  );
}
