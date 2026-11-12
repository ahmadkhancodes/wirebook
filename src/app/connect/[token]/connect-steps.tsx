"use client";
import { Check, DownloadSimple, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";

interface Step { id: "download" | "add" | "authorise" | "sync"; label: string; done: boolean; at: string | null }

const HELP: Record<Step["id"], string> = {
  download: "Save wirebook.qwc on the computer that runs QuickBooks Desktop.",
  add: "Open the QuickBooks Web Connector, choose Add an Application, and pick the file. When it asks for a password, paste the one below.",
  authorise: "QuickBooks asks whether Wirebook may access the company file. Choose Yes, always, and pick a user with the access you want to give.",
  sync: "Tick the box next to the app in the Web Connector and click Update Selected. The first sync turns this step green.",
};

export function ConnectSteps({ token, company, username, password, initial }: { token: string; company: string | null; username: string; password: string; initial: Step[] }) {
  const [steps, setSteps] = useState(initial);
  const [lost, setLost] = useState(false);
  // not Windows (Mac, phone): the Web Connector cannot run here. Server render assumes Windows so the markup matches.
  const offDevice = useSyncExternalStore(() => () => {}, () => !/Windows/i.test(navigator.userAgent), () => false);
  const done = steps.every((s) => s.done);

  useEffect(() => {
    if (done) return;
    let stop = false;
    async function tick() {
      try {
        const r = await fetch(`/connect/${token}/status`, { cache: "no-store" });
        // expired or already used: the server renders that state, so show it instead of "reconnecting" forever
        if (r.status === 404 || r.status === 410) { stop = true; clearInterval(t); window.location.reload(); return; }
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { steps: Step[] };
        if (!stop) { setSteps(j.steps); setLost(false); }
      } catch { if (!stop) setLost(true); }
    }
    const t = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [token, done]);

  const current = steps.findIndex((s) => !s.done);
  return (
    <>
      <header className="flex flex-col gap-2">
        <p className="caption-4 uppercase tracking-wider text-text-subtle">Connect QuickBooks Desktop</p>
        <h1 className="heading-4 text-text">{done ? "You are connected" : company ? `Connect ${company}` : "Connect your company file"}</h1>
        <p className="body-6 text-text-subtle">
          {done ? "The first sync finished. You can close this page and the Web Connector window." : "Four steps, about ten minutes. Each one turns green only when we have seen it happen on our side."}
        </p>
      </header>

      {offDevice && !done ? (
        <Notice tone="warning" title="Open this link on the QuickBooks computer">
          The Web Connector only runs on Windows next to QuickBooks Desktop. Copy this page address and open it there.
        </Notice>
      ) : null}
      <p className="sr-only" aria-live="polite">{done ? "Connected. The first sync finished." : `${steps.filter((x) => x.done).length} of ${steps.length} steps done.`}</p>
      {lost ? <Notice tone="warning" title="We lost touch for a moment">Reconnecting. The steps below may be a few seconds behind.</Notice> : null}

      <ol className="flex flex-col rounded-lg border border-border bg-surface">
        {steps.map((s, i) => {
          const active = i === current;
          return (
            <li key={s.id} aria-current={active ? "step" : undefined} className="flex gap-4 border-b border-border p-4 last:border-b-0">
              <span aria-hidden className={`mt-0.5 flex size-8 shrink-0 self-start items-center justify-center rounded-xs border-2 figures caption-4 ${s.done ? "border-success bg-success-surface text-success" : active ? "border-action bg-action-surface text-text" : "border-border text-text-subtle"}`}>
                {s.done ? <Check size={16} weight="bold" /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-3">
                  <h2 className="title-3 text-text">{s.label}</h2>
                  <span className={`caption-4 ${s.done ? "text-success" : "text-text-muted"}`}>{s.done ? "Seen by Wirebook" : active ? "Waiting" : "Not yet"}</span>
                </div>
                {!s.done ? <p className="body-6 text-text-subtle">{HELP[s.id]}</p> : null}
                {s.id === "download" && !s.done ? (
                  <ButtonLink href={`/connect/${token}/wirebook.qwc`} variant="primary" className="self-start" download>
                    <DownloadSimple size={18} weight="regular" aria-hidden /> Download wirebook.qwc
                  </ButtonLink>
                ) : null}
                {s.id === "add" && !s.done ? (
                  <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 body-6">
                    <dt className="text-text-subtle">Username</dt><dd className="figures text-text">{username}</dd>
                    <dt className="text-text-subtle">Password</dt>
                    <dd className="flex flex-wrap items-center gap-3"><code className="figures text-text">{password}</code><CopyButton value={password} label="Copy password" /></dd>
                  </dl>
                ) : null}
                {s.id === "authorise" && !s.done && steps[1]!.done ? (
                  <p className="flex items-start gap-2 body-6 text-text-subtle"><WarningCircle size={18} aria-hidden className="mt-0.5 shrink-0" />The Web Connector has contacted us. If it shows a password error, copy the password from step 2 again.</p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!done ? (
        <p className="body-6 text-text-subtle">
          Stuck? Common fixes are in the <Link className="text-text underline underline-offset-4" href="/errors/qb-could-not-start">QuickBooks could not start</Link> guide. This link works once and expires 24 hours after it was created.
        </p>
      ) : null}
    </>
  );
}
