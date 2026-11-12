import { CheckCircle, Clock, Question, XCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { CopyButton } from "@/components/app/copy-button";
import { appUrl } from "@/lib/env";
import { curlFor } from "@/lib/curl";
import type { Job, RequestState } from "@/lib/qbwc";

export const STATE_LABEL: Record<RequestState, string> = { queued: "Queued", sent: "Sent", succeeded: "Succeeded", failed: "Failed", outcome_unknown: "Outcome unknown" };

export function StateMark({ state }: { state: RequestState }) {
  const cls = state === "succeeded" ? "text-success" : state === "failed" ? "text-danger" : state === "outcome_unknown" ? "text-warning" : "text-text-muted";
  const Icon = state === "succeeded" ? CheckCircle : state === "failed" ? XCircle : state === "outcome_unknown" ? Question : Clock;
  return (
    <span className={`inline-flex items-center gap-2 font-sans caption-4 font-semibold ${cls}`}>
      <Icon size={16} weight="bold" aria-hidden />
      <span className="max-sm:sr-only">{STATE_LABEL[state]}</span>
    </span>
  );
}

export const clock = (d?: Date) => (d ? new Date(d).toISOString().slice(11, 19) : "–");
export const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
const ms = (n?: number) => (n === undefined ? "–" : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

export interface LogQuery { env: string; state?: string; object?: string; q?: string }
export function logHref(q: LogQuery, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (q.env !== "test") p.set("env", q.env);
  if (q.state) p.set("state", q.state);
  if (q.object) p.set("object", q.object);
  if (q.q) p.set("q", q.q);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return `/app${s ? `?${s}` : ""}`;
}

/** The ledger table: tabular figures, banded rows, failed rows tinted with the reason underneath. */
export function LedgerTable({ rows, selected, query }: { rows: Job[]; selected?: string; query: LogQuery }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse figures caption-2">
        <caption className="sr-only">Requests, newest first</caption>
        <thead>
          <tr className="border-b border-border bg-surface-raised text-left font-sans caption-4 text-text-subtle">
            <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">Time (UTC)</th>
            <th scope="col" className="hidden px-3 py-2 font-semibold 2xl:table-cell">Request</th>
            <th scope="col" className="px-3 py-2 font-semibold">Call</th>
            <th scope="col" className="px-3 py-2 font-semibold">Status</th>
            <th scope="col" className="hidden px-3 py-2 text-right font-semibold xl:table-cell">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((j) => {
            const failed = j.state === "failed";
            const sel = j.id === selected;
            return (
              <tr key={j.id} aria-current={sel ? "true" : undefined} className={`border-b border-border transition-colors duration-300 ease-out-kit last:border-b-0 ${sel ? "bg-action-surface" : failed ? "bg-danger-surface" : "hover:bg-surface-sunken"}`}>
                <td className="relative whitespace-nowrap px-3 py-2 align-top">
                  {sel ? <span aria-hidden className="absolute top-0 bottom-0 left-0 w-0.5 bg-action" /> : null}
                  <Link href={logHref(query, { req: j.id })} className="rounded-xs text-text underline decoration-border-strong underline-offset-4 hover:decoration-action focus-visible:focus-ring" aria-label={`${clock(j.createdAt)}, open request ${j.id}`}>{clock(j.createdAt)}</Link>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2 align-top text-text-subtle 2xl:table-cell">{j.id.slice(0, 16)}</td>
                <td className="px-3 py-2 align-top text-text">
                  <span className="whitespace-nowrap"><span className="sm:hidden">{j.meta?.method ?? "–"} {(j.meta?.path ?? j.op).replace(/^\/v1\/(qbd\/)?/, "")}</span><span className="max-sm:hidden">{j.meta?.method ?? "–"} {j.meta?.path ?? j.op}</span></span>
                  {failed && j.error ? <span className="block font-sans caption-4 text-danger">{j.error.userFacingMessage}</span> : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 align-top"><StateMark state={j.state} /></td>
                <td className="hidden whitespace-nowrap px-3 py-2 text-right align-top text-text-subtle xl:table-cell">{ms(j.durationMs)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The detail pane: key facts, the timeline and, when it failed, the error box with the guide. */
export function DetailPane({ job }: { job: Job }) {
  const events: [string, Date | undefined, string][] = [
    [clock(job.createdAt), job.createdAt, "Queued for the company file"],
    [clock(job.sentAt), job.sentAt, "Sent to QuickBooks through the Web Connector"],
    [clock(job.completedAt), job.completedAt, job.state === "succeeded" ? "QuickBooks answered: succeeded" : job.state === "outcome_unknown" ? "No answer from QuickBooks: outcome unknown" : job.state === "failed" ? "QuickBooks answered: failed" : ""],
  ];
  const waited = job.sentAt ? new Date(job.sentAt).getTime() - new Date(job.createdAt).getTime() : undefined;
  return (
    <aside aria-labelledby="detail-h" className="flex flex-col gap-4 border-t border-border bg-surface-raised p-4 lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <h2 id="detail-h" className="figures title-4 break-all text-text">{job.meta?.method ?? ""} {job.meta?.path ?? job.op}</h2>
        <StateMark state={job.state} />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 caption-4">
        <dt className="text-text-subtle">Request id</dt><dd className="figures break-all text-text">{job.id}</dd>
        <dt className="text-text-subtle">Company file</dt><dd className="figures break-all text-text">{job.endUserId}</dd>
        <dt className="text-text-subtle">Object</dt><dd className="figures text-text">{job.meta?.objectType ?? "–"}</dd>
        <dt className="text-text-subtle">QuickBooks status</dt><dd className="figures text-text">{job.qbStatusCode ?? "–"}</dd>
        <dt className="text-text-subtle">Waited in queue</dt><dd className="figures text-text">{ms(waited)}</dd>
        <dt className="text-text-subtle">Round trip</dt><dd className="figures text-text">{ms(job.durationMs)}</dd>
        {job.meta?.idempotencyKey ? <><dt className="text-text-subtle">Idempotency key</dt><dd className="figures break-all text-text">{job.meta.idempotencyKey}</dd></> : null}
      </dl>
      <div>
        <h3 className="index-label mb-2 text-text-subtle">Timeline</h3>
        <ol className="relative flex flex-col gap-4">
          <span aria-hidden className="absolute top-2 bottom-2 left-1 w-0.5 bg-action" />
          {events.filter((e) => e[1] && e[2]).map(([t, , label], i, all) => (
            <li key={label} className="relative flex flex-col pl-6 caption-4">
              <span aria-hidden className={`absolute top-1 left-0 size-3 border-2 border-action ${i === all.length - 1 ? "bg-action" : "bg-surface-raised"}`} />
              <time className="figures text-text-subtle">{t}</time>
              <span className="text-text">{label}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={curlFor(job, appUrl())} label="Copy as curl" />
        <CopyButton value={job.id} label="Copy request id" />
        {job.endUserId ? <Link href={`/app/end-users/${job.endUserId}`} className="inline-flex min-h-11 items-center rounded-sm px-2 caption-4 font-semibold text-text underline decoration-action underline-offset-4 focus-visible:focus-ring">Open company file</Link> : null}
      </div>
      <Payload job={job} />
      {job.error ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger-surface p-3 caption-4">
          <p className="font-semibold text-danger">{job.error.code}</p>
          <p className="mt-1 text-text">{job.error.message}</p>
          <p className="mt-1 text-text-subtle">{job.error.userFacingMessage}</p>
          <Link href={job.error.guideUrl} className="mt-2 inline-flex min-h-11 items-center rounded-sm font-semibold text-text underline decoration-action decoration-2 underline-offset-4 focus-visible:focus-ring">Read the guide{job.error.retryable ? " (safe to retry)" : ""}</Link>
        </div>
      ) : null}
    </aside>
  );
}

const pretty = (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };

/** Request body and result, only while retention still holds them. */
function Payload({ job }: { job: Job }) {
  if (job.purgedAt) {
    return <p className="rounded-lg border border-border bg-surface-sunken p-3 caption-4 text-text-subtle">The request and response bodies were deleted on {day(job.purgedAt)} by your retention setting. The timeline and status above stay for 90 days.</p>;
  }
  const hasBody = job.body !== undefined && job.body !== null && Object.keys(job.body as object).length > 0;
  return (
    <div className="flex flex-col gap-2">
      {hasBody ? (
        <details className="rounded-lg border border-border">
          <summary className="min-h-11 cursor-pointer px-3 py-2 caption-4 font-semibold text-text focus-visible:focus-ring">Request body</summary>
          <pre className="max-h-72 overflow-auto border-t border-border p-3 figures caption-4 text-text"><code>{pretty(job.body)}</code></pre>
        </details>
      ) : null}
      {job.result ? (
        <details className="rounded-lg border border-border">
          <summary className="min-h-11 cursor-pointer px-3 py-2 caption-4 font-semibold text-text focus-visible:focus-ring">Result ({job.result.length} {job.result.length === 1 ? "row" : "rows"})</summary>
          <pre className="max-h-72 overflow-auto border-t border-border p-3 figures caption-4 text-text"><code>{pretty(job.result)}</code></pre>
        </details>
      ) : null}
      {!hasBody && !job.result ? <p className="caption-4 text-text-subtle">No body was sent, and there is no result yet.</p> : null}
    </div>
  );
}
