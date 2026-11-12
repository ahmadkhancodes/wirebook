import Link from "next/link";
import { LedgerTable, DetailPane, day, logHref, type LogQuery } from "./request-log";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass, segmentClass, segmentGroupClass } from "@/components/ui/button";
import { GettingStarted, type Step } from "@/components/app/getting-started";
import { SearchShortcut } from "@/components/app/search-shortcut";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { inputClass } from "@/components/ui/field";
import { RequestLog } from "@/components/marketing/ledger/request-log";
import { orgHasApiKey, requireOrg } from "@/lib/auth/session";
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
  let steps: Step[] | null = null;
  if (!failed && rows.length === 0 && !before && !state && !object && !q) {
    try {
      const [users, hasKey] = await Promise.all([(await getBridge()).users.list({ projectId, limit: 20 }), orgHasApiKey(ctx.org.id, env)]);
      steps = [
        { title: `Create a ${env} API key`, body: "Keys are shown once, with a command to try them straight away. Test keys are meant for QuickBooks sample files.", href: "/app/settings/api-keys", cta: "Create key", done: hasKey },
        { title: "Connect a company file", body: "Make a connect link in the dashboard; whoever runs QuickBooks follows four steps on its page.", href: `/app/end-users?env=${env}#add`, cta: "Add company file", done: users.length > 0 },
        { title: "Make your first request", body: "List customers with the quickstart command. It shows up here within seconds.", href: "/docs/getting-started#list-its-customers", cta: "Open quickstart", done: false },
      ];
    } catch {
      steps = null;
    }
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
          <nav aria-label="Environment" className={segmentGroupClass}>
            {(["test", "production"] as const).map((e) => (
              <Link key={e} href={logHref({ ...query, env: e })} aria-current={env === e ? "page" : undefined}
                className={segmentClass(env === e, { mono: true })}>
                <span aria-hidden className={`size-2 ${e === "test" ? "bg-success" : "bg-danger"}`} />{e}
              </Link>
            ))}
          </nav>
        }
      />
      <SearchShortcut selector="#request-search" />
      <section aria-label="Request log" className="overflow-hidden rounded-lg border border-border bg-surface-raised">
        <form method="get" className="flex flex-wrap items-end gap-3 border-b border-border bg-surface-sunken p-3">
          {env !== "test" ? <input type="hidden" name="env" value={env} /> : null}
          <label className="flex w-full flex-col gap-1 caption-4 font-medium text-text sm:w-auto">Status
            <select name="state" defaultValue={state ?? ""} className={`${inputClass} pr-8`}>
              <option value="">All</option>
              {STATES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </label>
          <label className="flex w-full flex-col gap-1 caption-4 font-medium text-text sm:w-auto">Object
            <select name="object" defaultValue={object ?? ""} className={`${inputClass} pr-8`}>
              <option value="">All</option>
              {Object.keys(OBJECTS).map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="raw">raw qbXML</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 caption-4 font-medium text-text">Request id
            <input id="request-search" name="q" defaultValue={q ?? ""} placeholder="req_... (press /)" autoComplete="off" className={`${inputClass} figures`} />
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
              <>
              {steps ? <div className="mb-6"><GettingStarted steps={steps} /></div> : null}
              <EmptyState
                title={`No ${env} requests yet`}
                body={<>Requests appear here the moment you call <code>/v1/qbd</code> with a {env} key. Create a connect link for your first company file, then list its customers.</>}
                action={<Link href="/docs/getting-started" className={buttonClass("primary")}>Open the quickstart</Link>}
                example={<RequestLog env={env === "production" ? "Production" : "Test"} className="rounded-none border-0" compact />}
              />
              </>
            )}
          </div>
        ) : (
          <div className={selected ? "grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : ""}>
            <div className="min-w-0">
              <LedgerTable rows={page} selected={selected?.id} query={query} />
              <div className="footing flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 figures caption-4 text-text">
                <span>{page.length} shown</span><span>{ok} succeeded</span><span>{bad} failed</span><span className="text-text-subtle">{day(page[0]!.createdAt)}</span>
                <a href={`/api/requests/export?env=${env}`} download className="inline-flex min-h-11 items-center rounded-sm font-sans font-semibold text-text underline decoration-action decoration-2 underline-offset-4 focus-visible:focus-ring">Export CSV</a>
                {more && last ? <Link href={logHref(query, { before: `${new Date(last.createdAt).toISOString()}~${last.id}` })} className="ml-auto inline-flex min-h-11 items-center rounded-sm font-sans font-semibold text-text underline decoration-action decoration-2 underline-offset-4 focus-visible:focus-ring">Older requests</Link> : null}
              </div>
            </div>
            {selected ? <DetailPane job={selected} /> : null}
          </div>
        )}
      </section>
    </>
  );
}
