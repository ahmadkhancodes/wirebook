import { CircleDashed, Warning, X } from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export type LogState = "succeeded" | "failed" | "queued" | "outcome_unknown";

export interface LogRow {
  id: string;
  operation: string;
  party: string;
  amount: string;
  state: LogState;
  time: string;
  /** Short note under a failed row. */
  note?: string;
}

/** Sample rows. Believable, not round, and labelled "example" where shown. */
export const sampleRows: LogRow[] = [
  { id: "req_01JC9Q4", operation: "POST invoices", party: "Harlan Mechanical", amount: "1,284.48", state: "succeeded", time: "2.1 s" },
  { id: "req_01JC9Q3", operation: "GET customers", party: "Ridgeline Electric", amount: "n/a", state: "succeeded", time: "1.4 s" },
  { id: "req_01JC9Q1", operation: "POST bills", party: "Northgate Supply", amount: "3,907.15", state: "succeeded", time: "3.0 s" },
  { id: "req_01JC9P8", operation: "POST invoices", party: "Harlan Mechanical", amount: "612.00", state: "failed", time: "1.9 s", note: "3140 Invalid reference. Guide: /errors/3140" },
  { id: "req_01JC9P5", operation: "POST payments", party: "Northgate Supply", amount: "2,450.60", state: "outcome_unknown", time: "timed out" },
  { id: "req_01JC9P2", operation: "POST invoices", party: "Ridgeline Electric", amount: "918.33", state: "queued", time: "waiting" },
];

const label: Record<LogState, string> = {
  succeeded: "succeeded",
  failed: "failed",
  queued: "queued",
  outcome_unknown: "outcome unknown",
};

const tone: Record<LogState, string> = {
  succeeded: "text-success",
  failed: "text-danger",
  queued: "text-text-subtle",
  outcome_unknown: "text-warning",
};

export function Tick({ index = 0 }: { index?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="kit-tick size-4 shrink-0" style={{ ["--i" as string]: index }}>
      <path d="M2.5 8.5l3.5 3.5 7.5-8.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

function StateGlyph({ state, index }: { state: LogState; index: number }) {
  if (state === "succeeded") return <Tick index={index} />;
  if (state === "failed") return <X size={16} weight="bold" aria-hidden className="shrink-0" />;
  if (state === "outcome_unknown") return <Warning size={16} weight="bold" aria-hidden className="shrink-0" />;
  return <CircleDashed size={16} weight="bold" aria-hidden className="shrink-0" />;
}

export function StateLabel({ state, index = 0 }: { state: LogState; index?: number }) {
  return (
    <span className={cn("figures inline-flex items-center gap-2 caption-4", tone[state])}>
      <StateGlyph state={state} index={index} />
      {label[state]}
    </span>
  );
}

/** Footing line, computed from the rows so it can never disagree with them. */
export function footing(rows: LogRow[]): string[] {
  const n = (s: LogState) => rows.filter((r) => r.state === s).length;
  return [
    `${rows.length} requests`,
    `${n("succeeded")} succeeded`,
    `${n("failed")} failed`,
    `${n("outcome_unknown")} outcome unknown`,
    `${n("queued")} queued`,
  ];
}

/** Environment tag: a square stencil label, Test in green, Production in ledger red. Never colour alone: the word is the label. */
export function EnvTag({ env }: { env: "Test" | "Production" }) {
  return (
    <span className={cn("index-label inline-flex items-center gap-1 rounded-xs border px-2 py-0.5", env === "Test" ? "border-success text-success" : "border-danger text-danger")}>
      <span aria-hidden className="size-2 bg-current" />
      {env}
    </span>
  );
}

/** The request log as a ledger page: every job, its customer, its amount and where it stands. */
export function RequestLog({ rows = sampleRows, code, env = "Test", className, compact }: { rows?: LogRow[]; code?: ReactNode; env?: "Test" | "Production"; className?: string; /** Drop the customer column, for narrow slots. */ compact?: boolean }) {
  return (
    <div role="group" aria-label="Example request log" className={cn("min-w-0 overflow-hidden border border-border-strong bg-surface-raised", className)}>
      <div className="flex items-center gap-3 border-b border-border bg-surface-sunken px-4 py-2 caption-4 text-text-subtle">
        <EnvTag env={env} />
        <span className="title-5 text-text">Request log</span>
        <span className="ml-auto caption-5">example</span>
      </div>
      {code ? <div className="overflow-x-auto border-b border-border px-4 py-3 text-text"><pre className="code-block" tabIndex={0}>{code}</pre></div> : null}
      <div className="overflow-x-auto">
        <table className="ledger-cols w-full border-collapse caption-2">
          <thead>
            <tr className="border-b-4 border-double border-border-strong text-left text-text-subtle">
              <th scope="col" className="py-2 pr-2 pl-4 caption-4">Request</th>
              <th scope="col" className={cn("hidden px-2 py-2 caption-4", !compact && "md:table-cell")}>Customer</th>
              <th scope="col" className="hidden px-2 py-2 caption-4 sm:table-cell">Operation</th>
              <th scope="col" className="hidden px-2 py-2 text-right caption-4 sm:table-cell">Amount</th>
              <th scope="col" className="px-2 py-2 caption-4">State</th>
              <th scope="col" className="hidden py-2 pr-4 pl-2 text-right caption-4 sm:table-cell">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={cn("border-b border-border align-top last:border-b-0", r.state === "failed" && "bg-danger-surface")}>
                <td className="figures py-2 pr-2 pl-4 whitespace-nowrap text-text-subtle">{r.id}</td>
                <td className={cn("hidden px-2 py-2 whitespace-nowrap text-text", !compact && "md:table-cell")}>{r.party}</td>
                <td className="figures hidden px-2 py-2 whitespace-nowrap text-text sm:table-cell">{r.operation}</td>
                <td className="numerals hidden px-2 py-2 text-right whitespace-nowrap text-text sm:table-cell">{r.amount}</td>
                <td className="px-2 py-2 whitespace-nowrap">
                  <StateLabel state={r.state} index={i} />
                  {r.note ? <span className="mt-1 block max-w-48 caption-5 whitespace-normal text-danger sm:max-w-none">{r.note}</span> : null}
                </td>
                <td className="figures hidden py-2 pr-4 pl-2 text-right whitespace-nowrap text-text-subtle sm:table-cell">{r.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="figures footing flex flex-wrap gap-x-6 gap-y-0.5 px-4 py-3 caption-5 text-text">
        {footing(rows).map((f) => (
          <span key={f}>{f}</span>
        ))}
      </p>
    </div>
  );
}
