"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, formatDate } from "@/components/app/api";
import { DataTable, Td } from "@/components/app/data-table";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { STATUS_HELP, type EndUserView } from "@/lib/health/view";
import { StatusBadge } from "./status-badge";

const POLL_MS = 5000;

export function EndUsersClient({ env, initial }: { env: "test" | "production"; initial: EndUserView[] | null }) {
  const [rows, setRows] = useState<EndUserView[] | null>(initial);
  const [failed, setFailed] = useState(initial === null);

  const load = useCallback(async () => {
    const r = await api<{ endUsers: EndUserView[] }>(`/api/end-users?env=${env}`);
    if (r.ok) { setRows(r.data.endUsers); setFailed(false); } else setFailed(true);
  }, [env]);

  // live status: poll while the tab is visible
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Environment" className="flex w-fit gap-1 rounded-md border border-border p-0.5">
        {(["test", "production"] as const).map((e) => (
          <Link key={e} href={e === "test" ? "/app/end-users" : "/app/end-users?env=production"} aria-current={env === e ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-sm px-3 py-1.5 caption-4 font-semibold sm:min-h-8 uppercase tracking-wider focus-visible:focus-ring ${env === e ? "bg-action text-action-text" : "text-text-subtle hover:text-text"}`}>{e}</Link>
        ))}
      </nav>
      {failed && !rows ? (
        <ErrorState title="We could not load your end users" body="The store did not answer. Your connections are not affected. Try again in a moment." action={<button type="button" onClick={() => void load()} className={buttonClass("secondary")}>Try again</button>} />
      ) : rows && rows.length === 0 ? (
        <EmptyState title={`No ${env} company files yet`} body={<>Create one with <code>POST /v1/connect-links</code> and send the link to your customer. It shows here as Pending until their first sync.</>} action={<Link href="/docs/connect-flow" className={buttonClass("primary")}>How the connect flow works</Link>} />
      ) : (
        <div aria-live="polite">
          <DataTable caption="Connected company files" columns={[{ key: "file", label: "Company file" }, { key: "status", label: "Status" }, { key: "poll", label: "Last poll" }, { key: "ok", label: "Last success" }]}>
            {(rows ?? []).map((u) => (
              <tr key={u.id}>
                <Td><Link href={`/app/end-users/${u.id}`} className="underline underline-offset-4 focus-visible:focus-ring">{u.companyName ?? u.externalId ?? u.id}</Link><span className="block caption-4 text-text-subtle figures">{u.externalId ?? u.id}</span></Td>
                <Td><span title={STATUS_HELP[u.status]}><StatusBadge status={u.status} /></span></Td>
                <Td muted><time dateTime={u.lastPollAt ?? undefined}>{formatDate(u.lastPollAt, true)}</time></Td>
                <Td muted><time dateTime={u.lastSuccessAt ?? undefined}>{formatDate(u.lastSuccessAt, true)}</time></Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </div>
  );
}
