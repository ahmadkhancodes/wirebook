"use client";
import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { Panel } from "@/components/app/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { listCustomersCurl } from "@/lib/snippets";

interface Created { url: string; expiresAt: string; endUserId: string; externalId: string }
interface Failure { message: string; code?: string; guideUrl?: string }

/** Makes a connect link from the dashboard, so the first company file needs no API key and no terminal. */
export function AddCompanyFile({ env, baseUrl, onCreated }: { env: "test" | "production"; baseUrl: string; onCreated: () => void }) {
  const [externalId, setExternalId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = externalId.trim();
    if (!id) return setError({ message: "Give this customer an id from your own system, for example acme-42. You send it as X-End-User-Id later." });
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/end-users?env=${env}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ externalId: id, ...(companyName.trim() ? { companyName: companyName.trim() } : {}) }),
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Created> & { error?: string | { code?: string; message?: string; guideUrl?: string } };
      if (res.status === 201 && data.url) {
        setCreated(data as Created);
        setExternalId("");
        setCompanyName("");
        onCreated();
      } else if (data.error && typeof data.error === "object") {
        setError({ message: data.error.message ?? "We could not create the link.", code: data.error.code, guideUrl: data.error.guideUrl });
      } else {
        setError({ message: data.error === "rate_limited" ? "Too many links in a minute. Wait a moment and try again." : res.status === 403 ? "Your role cannot add company files. Ask an owner or admin." : "We could not create the link. Try again." });
      }
    } catch {
      setError({ message: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const curl = created ? listCustomersCurl(baseUrl, created.externalId) : "";
  return (
    <Panel
      title={`Add a ${env} company file`}
      description="Makes a single use connect link, valid for 24 hours. Send it to whoever runs QuickBooks, or open it yourself on the QuickBooks PC. A QuickBooks sample company file is free and never billed."
    >
      <div id="add" className="flex flex-col gap-4">
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Field label="Your id for this customer" htmlFor="eu-external" hint="The id this customer has in your own system. You send it as X-End-User-Id." error={error && !error.code ? error.message : null}>
              <Input id="eu-external" maxLength={100} placeholder="acme-42" autoComplete="off" value={externalId} onChange={(e) => setExternalId(e.target.value)} aria-invalid={error && !error.code ? true : undefined} />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Company name (optional)" htmlFor="eu-company" hint="Shown on the connect page and in this list.">
              <Input id="eu-company" maxLength={100} placeholder="Acme Builders" autoComplete="off" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>
          </div>
          <div className="sm:pt-6">
            <Button type="submit" loading={busy}>Create connect link</Button>
          </div>
        </form>

        {error?.code ? (
          <div role="alert" className="flex flex-col gap-2 rounded-lg border border-danger bg-danger-surface p-4">
            <p className="title-4 text-text">{error.message}</p>
            <div className="flex flex-wrap gap-3">
              {error.code === "file_limit_reached" ? <Link href="/app/billing" className={buttonClass("primary", "sm")}>Choose a plan</Link> : null}
              {error.guideUrl ? <a href={new URL(error.guideUrl).pathname} className={buttonClass("secondary", "sm")}>What this means</a> : null}
            </div>
          </div>
        ) : null}

        {created ? (
          <div role="status" className="flex flex-col gap-3 rounded-lg border border-success bg-success-surface p-4">
            <p className="title-4 text-text">Connect link for {created.externalId} is ready</p>
            <p className="body-6 text-text-subtle">Open it on the PC that runs QuickBooks. Each of its four steps turns green when we see it happen. The link expires {new Date(created.expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code data-testid="connect-url" className="min-w-0 flex-1 break-all rounded-md border border-border bg-surface px-3 py-2 caption-2 text-text">{created.url}</code>
              <CopyButton value={created.url} label="Copy link" />
              <a href={created.url} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Open connect page</a>
            </div>
            <p className="body-6 text-text-subtle">After the first sync, list its customers. Set WIREBOOK_API_KEY to a {env} key first.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <pre data-testid="first-request" className="min-w-0 flex-1 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 caption-2 text-text"><code>{curl}</code></pre>
              <CopyButton value={curl} label="Copy command" />
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
