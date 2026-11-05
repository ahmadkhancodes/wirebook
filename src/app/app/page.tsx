import Link from "next/link";
import { LedgerTable, DetailPane, day, logHref, type LogQuery } from "./request-log";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth/session";
import { getBridge } from "@/lib/bridge";
import { OBJECTS } from "@/lib/v1/objects";
import type { Job, RequestState } from "@/lib/qbwc";

export const metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const PAGE = 25;
const STATES: RequestState[] = ["queued", "sent", "succeeded", "failed", "outcome_unknown"];
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export default async function RequestLogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireOrg({ page: true });
  const sp = await searchParams;
  const env = one(sp.env) === "production" ? "production" : "test";
  const state = STATES.find((s) => s === one(sp.state));
  const object = one(sp.object);
  const q = one(sp.q)?.trim().slice(0, 60);
  const query: LogQuery = { env, ...(state ? { state } : {}), ...(object ? { object } : {}), ...(q ? { q } : {}) };
  const projectId = `${ctx.org.id}__${env}`;
  const before = one(sp.before);

  let rows: Job[] = [];
  let selected: Job | null = null;
  let failed = false;
  try {
    const bridge = await getBridge();
    const [at, id] = (before ?? "").split("~");
    rows = await bridge.queue.list({
      projectId, limit: PAGE + 1, ...(state ? { state } : {}), ...(object ? { objectType: object } : {}), ...(q ? { id: q } : {}),
      ...(at && id && !Number.isNaN(Date.parse(at)) ? { before: { createdAt: new Date(at), id } } : {}),
    });
    const sel = one(sp.req);
    if (sel) selected = rows.find((r) => r.id === sel) ?? (await bridge.queue.get(sel).then((j) => (j?.meta?.projectId === projectId ? j : null)));
  } catch {
    failed = true;
  }
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const last = page.at(-1);
  const filtered = !!(state || object || q || before);
  const ok = page.filter((r) => r.state === "succeeded").length;
  const bad = page.filter((r) => r.state === "failed" || r.state === "outcome_unknown").length;

  return (
    <>
      <PageHeader
        title="Requests"
        description="Every call to your company files, newest first. Open one to see its timeline and, if it failed, why."
        actions={
          <nav aria-label="Environment" className="flex gap-1 rounded-md border border-border p-0.5">
            {(["test", "production"] as const).map((e) => (
              <Link key={e} href={logHref({ ...query, env: e })} aria-current={env === e ? "page" : undefined}
                className={`rounded-sm px-3 py-1.5 caption-4 font-semibold uppercase tracking-wider focus-visible:focus-ring ${env === e ? "bg-action text-action-text" : "text-text-subtle hover:text-text"}`}>{e}</Link>
            ))}
          </nav>
        }
      />
      <section aria-label="Request log" className="overflow-hidden rounded-lg border border-border bg-surface">
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-raised p-3">
          {env !== "test" ? <input type="hidden" name="env" value={env} /> : null}
          <label className="flex flex-col gap-1 caption-4 text-text-subtle">Status
            <select name="state" defaultValue={state ?? ""} className="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-text body-6">
              <option value="">All</option>
              {STATES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 caption-4 text-text-subtle">Object
            <select name="object" defaultValue={object ?? ""} className="min-h-11 rounded-md border border-border-strong bg-surface px-2 text-text body-6">
              <option value="">All</option>
              {Object.keys(OBJECTS).map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="raw">raw qbXML</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 caption-4 text-text-subtle">Request id
            <input name="q" defaultValue={q ?? ""} placeholder="req_..." autoComplete="off" className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-text body-6 figures" />
          </label>
          <button className={buttonClass("secondary")} type="submit">Apply</button>
          {filtered ? <Link href={logHref({ env })} className={buttonClass("tertiary")}>Clear</Link> : null}
        </form>

        {failed ? (
          <div className="p-6"><ErrorState title="We could not load your requests" body="The request store did not answer. Your data is safe. Reload the page, and if it keeps failing email support." action={<Link href={logHref(query)} className={buttonClass("secondary")}>Try again</Link>} /></div>
        ) : page.length === 0 ? (
          <div className="p-6">
            {filtered ? (
              <EmptyState title="No requests match" body="Nothing in this environment fits those filters. Clear them to see everything." action={<Link href={logHref({ env })} className={buttonClass("secondary")}>Clear filters</Link>} />
            ) : (
              <EmptyState
                title={`No ${env} requests yet`}
                body={<>Requests appear here the moment you call <code>/v1/qbd</code> with a {env} key. Create a connect link for your first company file, then list its customers.</>}
                action={<Link href="/docs/getting-started" className={buttonClass("primary")}>Open the quickstart</Link>}
              />
            )}
          </div>
        ) : (
          <div className={selected ? "grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}>
            <div className="min-w-0">
              <LedgerTable rows={page} selected={selected?.id} query={query} />
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t-[3px] border-double border-text px-4 py-3 figures caption-4 text-text">
                <span>{page.length} shown</span><span>{ok} succeeded</span><span>{bad} failed</span><span className="text-text-subtle">{day(page[0]!.createdAt)}</span>
                {more && last ? <Link href={logHref(query, { before: `${new Date(last.createdAt).toISOString()}~${last.id}` })} className="ml-auto text-text underline underline-offset-4">Older requests</Link> : null}
              </div>
            </div>
            {selected ? <DetailPane job={selected} /> : null}
          </div>
        )}
      </section>
    </>
  );
}
