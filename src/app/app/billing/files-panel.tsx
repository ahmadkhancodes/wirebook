import { fmt } from "@/components/app/labels";
import { Panel } from "@/components/app/page-header";
import { Badge } from "@/components/ui/states";
import type { usageSummary } from "@/lib/billing/metering";

type Summary = Awaited<ReturnType<typeof usageSummary>>;

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

const monthName = (period: string) => new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-01T00:00:00Z`));

/** Active company files this month and what they cost on the current plan. Figures come from chargeFor() and product.ts only. */
export function FilesPanel({ s }: { s: Summary }) {
  const free = s.planId === "free";
  const rows: [string, string][] = [
    ["Active files", fmt(s.files)],
    [free ? "Included on Developer" : s.planId === "production" ? "Included" : "Included in the plan", fmt(s.included)],
    ...(free ? [] : [[s.planId === "production" ? "Billed files" : "Files billed on top", fmt(s.planId === "volume" ? s.billableFiles : s.extra)] as [string, string]]),
  ];
  return (
    <Panel title={`Active company files, ${monthName(s.period)}`} description="A file counts once a request has succeeded for it this month. QuickBooks sample company files are free and never counted, with test or production keys.">
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="flex flex-col gap-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border pb-2">
              <dt className="body-6 text-text-subtle">{k}</dt>
              <dd className="body-5 text-text figures">{v}</dd>
            </div>
          ))}
          {s.planId === "volume" && s.files < s.included ? <p className="caption-2 text-text-subtle">Volume bills at least {s.included} files.</p> : null}
        </dl>
        <div className="flex flex-col gap-2 rounded-md border border-border-strong p-4">
          <p className="caption-4 text-text-subtle">Projected {s.interval === "year" ? "per year" : "this month"}</p>
          <p className="heading-5 text-text figures" data-testid="projected-cost">{free ? "$0" : money(s.intervalCents)}</p>
          {free ? (
            <p className="body-6 text-text-subtle">Developer includes up to 3 active production files. A 4th needs a paid plan.</p>
          ) : (
            <p className="body-6 text-text-subtle">{money(s.monthlyCents)} a month at your current rate, reported to Stripe as the subscription quantity.</p>
          )}
          {free && s.files >= s.included ? <div><Badge tone="warning">File limit reached</Badge></div> : null}
        </div>
      </div>
    </Panel>
  );
}
