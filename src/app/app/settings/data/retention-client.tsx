"use client";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Panel } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function RetentionClient({ days, max, min, canEdit }: { days: number; max: number; min: number; canEdit: boolean }) {
  const [value, setValue] = useState(String(days));
  const [saved, setSaved] = useState(days);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) return setMsg({ ok: false, text: `Enter a whole number of days from ${min} to ${max}.` });
    setBusy(true);
    setMsg(null);
    const r = await api<{ retentionDays: number }>("/api/settings/retention", { body: { retentionDays: n } });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setSaved(r.data.retentionDays);
    setMsg({ ok: true, text: `Bodies are now removed after ${r.data.retentionDays} days.` });
  }

  return (
    <Panel title="Payload retention" description={`Request bodies, responses and raw qbXML are removed after this many days by a daily job. The default is ${max} days and you can only shorten it.`}>
      <form onSubmit={save} noValidate className="flex max-w-md flex-col gap-4">
        <Field label="Days to keep payloads" htmlFor="retention" error={msg && !msg.ok ? msg.text : null} hint={`${min} to ${max} days. Currently ${saved}.`}>
          <Input id="retention" name="retention" inputMode="numeric" value={value} disabled={!canEdit} onChange={(e) => setValue(e.target.value)} aria-invalid={msg && !msg.ok ? true : undefined} aria-describedby={msg && !msg.ok ? "retention-error" : undefined} />
        </Field>
        {canEdit ? <div className="flex items-center gap-4"><Button type="submit" loading={busy} disabled={Number(value) === saved}>Save retention</Button>{msg?.ok ? <p role="status" className="caption-2 text-text-subtle">{msg.text}</p> : null}</div> : <p className="caption-2 text-text-subtle">Only owners and admins can change this.</p>}
      </form>
    </Panel>
  );
}
