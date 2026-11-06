"use client";
import { useState } from "react";
import { api, useAsync } from "@/components/app/api";
import { DataTable, Td } from "@/components/app/data-table";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge, EmptyState, ErrorState, Skeleton } from "@/components/ui/states";

interface Row { orgId: string; suspended: boolean; reason: string; suspendedKeys: string[] }

export function AbuseClient() {
  const list = useAsync(async () => {
    const r = await api<{ suspended: Row[] }>("/api/admin/suspend");
    if (!r.ok) throw new Error(r.message);
    return r.data.suspended;
  });
  const [kind, setKind] = useState<"org" | "key">("org");
  const [orgId, setOrgId] = useState("");
  const [keyId, setKeyId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function act(suspended: boolean, target?: { kind: "org" | "key"; orgId: string; keyId?: string }) {
    const t = target ?? { kind, orgId: orgId.trim(), keyId: keyId.trim() };
    if (!t.orgId || (t.kind === "key" && !t.keyId)) return setMsg({ ok: false, text: "Enter the organization id, and the key id for a key." });
    setBusy(true);
    const r = await api("/api/admin/suspend", { body: { ...t, suspended, ...(reason.trim() ? { reason: reason.trim() } : {}) } });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setMsg({ ok: true, text: `${t.kind === "org" ? "Organization" : "Key"} ${suspended ? "suspended" : "restored"}. The audit log has the entry.` });
    list.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Suspend or restore" description="Find the organization id in the audit log or the Better Auth organization collection.">
        <form onSubmit={(e) => { e.preventDefault(); void act(true); }} className="flex flex-col gap-4">
          <Field label="What" htmlFor="ab-kind">
            <Select id="ab-kind" value={kind} onChange={(e) => setKind(e.target.value as "org" | "key")}>
              <option value="org">Organization</option>
              <option value="key">API key</option>
            </Select>
          </Field>
          <Field label="Organization id" htmlFor="ab-org"><Input id="ab-org" value={orgId} onChange={(e) => setOrgId(e.target.value)} autoComplete="off" /></Field>
          {kind === "key" ? <Field label="API key id" htmlFor="ab-key"><Input id="ab-key" value={keyId} onChange={(e) => setKeyId(e.target.value)} autoComplete="off" /></Field> : null}
          <Field label="Reason (kept in the audit log)" htmlFor="ab-reason"><Input id="ab-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} /></Field>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>Suspend</Button>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(false)}>Restore</Button>
          </div>
          {msg ? <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "caption-2 text-success" : "caption-2 text-danger"}>{msg.text}</p> : null}
        </form>
      </Panel>
      <section aria-labelledby="sus-h" className="flex flex-col gap-3">
        <h2 id="sus-h" className="title-2 text-text">Currently suspended</h2>
        {list.loading ? <Skeleton className="h-24 w-full" /> : list.error ? (
          <ErrorState title="The list did not load" body={list.error} action={<Button onClick={list.reload}>Try again</Button>} />
        ) : (list.data ?? []).length === 0 ? (
          <EmptyState title="Nothing is suspended" body="Suspended organizations and keys appear here, with a button to restore them." />
        ) : (
          <DataTable caption="Suspended organizations and keys" columns={[{ key: "org", label: "Organization" }, { key: "state", label: "State" }, { key: "keys", label: "Suspended keys" }, { key: "a", label: "Actions", align: "right" }]}>
            {(list.data ?? []).map((r) => (
              <tr key={r.orgId}>
                <Td><code>{r.orgId}</code>{r.reason ? <p className="caption-5 text-text-muted">{r.reason}</p> : null}</Td>
                <Td><Badge tone={r.suspended ? "danger" : "info"}>{r.suspended ? "Suspended" : "Active"}</Badge></Td>
                <Td muted>{r.suspendedKeys.length ? r.suspendedKeys.join(", ") : "None"}</Td>
                <Td align="right">
                  <div className="flex justify-end gap-1">
                    {r.suspended ? <Button variant="tertiary" size="sm" onClick={() => act(false, { kind: "org", orgId: r.orgId })}>Restore org</Button> : null}
                    {r.suspendedKeys.map((k) => <Button key={k} variant="tertiary" size="sm" onClick={() => act(false, { kind: "key", orgId: r.orgId, keyId: k })}>Restore key</Button>)}
                  </div>
                </Td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}
