"use client";
import { useCallback, useEffect, useState } from "react";
import { api, formatDate } from "@/components/app/api";
import { CopyButton } from "@/components/app/copy-button";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/states";
import { STATUS_HELP, type EndUserView, type HealthEventView } from "@/lib/health/view";
import { StatusBadge } from "../status-badge";

interface Data { endUser: EndUserView; events: HealthEventView[] }

export function DetailClient({ initial, canReconnect }: { initial: Data; canReconnect: boolean }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const u = data.endUser;

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/end-users/${u.id}`);
    if (r.ok) setData(r.data);
  }, [u.id]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function reconnect() {
    setBusy(true);
    setError(null);
    const r = await api<{ url: string; expiresAt: string }>(`/api/end-users/${u.id}/reconnect`, { method: "POST", body: {} });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setLink(r.data);
    void load();
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Connection" description={STATUS_HELP[u.status]} actions={<StatusBadge status={u.status} />}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="caption-4 text-text-subtle">Last poll</dt><dd className="body-6 text-text">{formatDate(u.lastPollAt, true)}</dd></div>
          <div><dt className="caption-4 text-text-subtle">Last success</dt><dd className="body-6 text-text">{formatDate(u.lastSuccessAt, true)}</dd></div>
          <div><dt className="caption-4 text-text-subtle">Created</dt><dd className="body-6 text-text">{formatDate(u.createdAt, true)}</dd></div>
        </dl>
        {u.lastError ? <p className="mt-4 body-6 text-text-subtle">Last error: <code>{u.lastError}</code></p> : null}
        {canReconnect ? (
          <div className="mt-6 flex flex-col gap-3">
            <div><Button onClick={reconnect} loading={busy} variant={u.status === "broken" || u.status === "asleep" ? "primary" : "secondary"}>Send reconnect link</Button></div>
            {error ? <p role="alert" className="caption-2 text-danger">{error}</p> : null}
            {link ? (
              <Notice tone="success" title="Reconnect link created" action={<CopyButton value={link.url} label="Copy link" />}>
                <span className="break-all figures">{link.url}</span><br />Single use. Expires {formatDate(link.expiresAt, true)}. Send it to the person who runs this QuickBooks company file.
              </Notice>
            ) : null}
          </div>
        ) : null}
      </Panel>
      <Panel title="Health timeline" description="Every change of status, newest first.">
        {data.events.length === 0 ? (
          <EmptyState title="No events yet" body="Status changes appear here: first sync, asleep, broken and recovered." />
        ) : (
          <ol className="flex flex-col">
            {data.events.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
                <StatusBadge status={e.status} />
                <span className="body-6 text-text">{e.reason}</span>
                <time dateTime={e.at} className="caption-4 text-text-subtle figures sm:ml-auto">{formatDate(e.at, true)}</time>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
