import Link from "next/link";
import { BarChart } from "@/components/app/charts";
import { fmt } from "@/components/app/labels";
import { PageHeader, Panel } from "@/components/app/page-header";
import { EmptyState } from "@/components/ui/states";
import { buttonClass } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";
import { requireOrg } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { usageSummary } from "@/lib/billing/metering";
import { getDb } from "@/lib/db";
import { dailyCapFor, dayOf } from "@/lib/security/abuse";
import { filesByMonth, requestsByDay } from "@/lib/usage-series";

export const metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const ctx = await requireOrg({ page: true });
  let data;
  try {
    const db = await getDb();
    const plan = effectivePlan(await db.getEntitlement(ctx.org.id));
    const [days, months, summary] = await Promise.all([requestsByDay(db, ctx.org.id, 30), filesByMonth(db, ctx.org.id, 6), usageSummary(db, ctx.org.id)]);
    data = { plan, cap: dailyCapFor(plan.id), days, months, summary };
  } catch {
    data = null;
  }
  if (!data) {
    return <ErrorState title="Usage did not load" body="The usage store did not answer. Your data is safe. Reload the page, and if it keeps failing email support." action={<Link href="/app/usage" className={buttonClass("secondary")}>Try again</Link>} />;
  }
  const { plan, cap, days, months, summary } = data;
  const today = days.at(-1)?.value ?? 0;
    const none = days.every((d) => d.value === 0) && months.every((m) => m.value === 0);
  return (
      <>
        <PageHeader title="Usage" description={`API requests and active company files for ${ctx.org.name}. Days and months are UTC.`} />
        <div className="flex flex-col gap-6">
          <dl className="grid overflow-hidden rounded-lg border border-border bg-surface-raised sm:grid-cols-3 sm:divide-x sm:divide-border max-sm:divide-y max-sm:divide-border">
            <div className="flex flex-col gap-1 p-4 sm:p-6"><dt className="index-label text-text-subtle">Requests today</dt><dd className="figures heading-4 text-text">{fmt(today)}</dd><p className="caption-2 text-text-subtle">of {fmt(cap)} a day on {plan.name}, test and production together</p></div>
            <div className="flex flex-col gap-1 p-4 sm:p-6"><dt className="index-label text-text-subtle">Active files this month</dt><dd className="figures heading-4 text-text">{fmt(summary.files)}</dd><p className="caption-2 text-text-subtle">{summary.capped ? `of ${summary.included} included on ${plan.name}` : "billed per active production file"}</p></div>
            <div className="flex flex-col gap-1 p-4 sm:p-6"><dt className="index-label text-text-subtle">Projected this month</dt><dd className="figures heading-4 text-text">{`$${(summary.monthlyCents / 100).toFixed(2)}`}</dd><p className="caption-2 text-text-subtle"><Link href="/app/billing" className="inline-flex min-h-11 items-center rounded-sm font-semibold text-text underline decoration-action underline-offset-4 focus-visible:focus-ring sm:min-h-0">See billing</Link></p></div>
          </dl>
          {none ? (
            <EmptyState
              title="No usage yet"
              body="Charts fill in as soon as your key makes its first request. Create a connect link for a sample company file and list its customers."
              action={<Link href="/docs/getting-started" className={buttonClass("primary")}>Open the quickstart</Link>}
            />
          ) : null}
          <Panel title="Requests per day" description={`Last 30 days. The dashed line is the daily cap of the ${plan.name} plan; reaching it answers 429 daily_cap_reached until 00:00 UTC.`}>
            <div className="px-6 pb-6"><BarChart id="chart-requests" title="Requests per day" unit="requests" points={days} limit={cap} limitLabel={`Daily cap ${fmt(cap)}`} /></div>
          </Panel>
          <Panel title="Active company files per month" description="Production files with at least one successful data request in the month. Sample files are free and never counted.">
            <div className="px-6 pb-6"><BarChart id="chart-files" title="Active files per month" unit="files" points={months} limit={summary.capped ? summary.included : undefined} limitLabel={`Included ${summary.included}`} /></div>
          </Panel>
          <p className="caption-2 text-text-subtle">Today so far is {dayOf(new Date())}. Counts include requests refused with a 429.</p>
        </div>
      </>
  );
}
