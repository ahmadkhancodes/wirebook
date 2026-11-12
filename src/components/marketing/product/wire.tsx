import { cn } from "@/components/ui/cn";

export interface WireStop {
  /** Where the request is: "Your app", "Wirebook", ... */
  place: string;
  /** What happened there, in plain words. */
  event: string;
  /** Elapsed time, mono. */
  at: string;
}

/** One request, written up as a work order and followed from your server to the QuickBooks PC. */
export const sampleWire: WireStop[] = [
  { place: "Your app", event: "POST /v1/qbd/invoices", at: "00:00.000" },
  { place: "Wirebook", event: "Validated, queued for Harlan Mechanical", at: "00:00.041" },
  { place: "Web Connector", event: "Checked in from HARLAN-OFFICE-PC", at: "00:00.412" },
  { place: "QuickBooks Desktop", event: "InvoiceAdd, status 0, TxnID 1F3A-1731", at: "00:02.108" },
];

/**
 * The signature move: the wire drawn as a ledger double rule, with a posting mark per stop. Horizontal from md up, vertical on phones.
 * The line draws once (scaleX), nodes appear in order; reduced motion shows it drawn.
 */
export function Wire({ stops = sampleWire, className }: { stops?: WireStop[]; className?: string }) {
  return (
    <ol aria-label="Path of one request, example" className={cn("relative grid gap-0 md:grid-cols-4", className)}>
      <span aria-hidden className="wire-draw absolute top-1 right-0 left-0 hidden h-1 border-y border-action md:block" />
      <span aria-hidden className="absolute top-2 bottom-2 left-1 w-1 border-x border-action md:hidden" />
      {stops.map((s, i) => (
        <li key={s.place} className="wire-node relative flex flex-col gap-1 pb-6 pl-8 last:pb-0 md:pt-8 md:pr-6 md:pb-0 md:pl-0" style={{ ["--i" as string]: i }}>
          <span aria-hidden className={cn("absolute top-0.5 left-0 size-3 border-2 border-action md:top-0.5", i === stops.length - 1 ? "bg-action" : "bg-surface-raised")} />
          <span className="figures caption-5 text-text-subtle">{s.at}</span>
          <span className="title-4 text-text">{s.place}</span>
          <span className="figures caption-5 text-text-subtle">{s.event}</span>
        </li>
      ))}
    </ol>
  );
}
