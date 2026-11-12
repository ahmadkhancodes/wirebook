import type { ReactNode } from "react";
import { cn } from "./cn";

/** Skeleton shaped like the real layout (no circular spinners for content). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("rounded-sm bg-surface-sunken motion-safe:animate-pulse", className)} />;
}

/**
 * Composed getting-started view that teaches the next action: title, one sentence, one action,
 * and (optional) `example`: a faded preview of what will appear here, labelled "example".
 */
export function EmptyState({ title, body, action, visual, example }: { title: string; body: ReactNode; action?: ReactNode; visual?: ReactNode; example?: ReactNode }) {
  return (
    <div className="grid gap-6 rounded-lg border border-dashed border-border-strong bg-surface-raised p-6 md:p-8 lg:grid-cols-12 lg:gap-8">
      <div className={cn("flex flex-col items-start gap-4", example ? "lg:col-span-5" : "lg:col-span-12")}>
        {visual}
        <p className="index-label flex items-center gap-2 text-text-subtle"><span aria-hidden className="size-2 bg-action" />Next step</p>
        <div className="flex max-w-xl flex-col gap-2">
          <h3 className="heading-6 text-text">{title}</h3>
          <div className="body-6 text-text-subtle">{body}</div>
        </div>
        {action}
      </div>
      {example ? (
        <figure className="min-w-0 lg:col-span-7">
          <div aria-hidden className="pointer-events-none overflow-hidden rounded-lg border border-border opacity-60 select-none">{example}</div>
          <figcaption className="mt-2 caption-5 text-text-subtle">Example of what appears here</figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/** Inline, specific error: what failed and what to do next. */
export function ErrorState({ title, body, action }: { title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger bg-danger-surface p-6">
      <p className="index-label text-danger">Error</p>
      <h3 className="title-3 font-semibold text-text">{title}</h3>
      <div className="body-6 text-text">{body}</div>
      {action}
    </div>
  );
}

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  info: "border-border bg-surface-sunken text-text",
  success: "border-success bg-success-surface text-text",
  warning: "border-warning bg-warning-surface text-text",
  danger: "border-danger bg-danger-surface text-text",
};

export function Notice({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between", tones[tone])}>
      <div className="flex flex-col gap-1">
        {title ? <p className="title-4">{title}</p> : null}
        {children ? <div className="body-6 text-text-subtle">{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const t: Record<Tone, string> = {
    info: "border-border text-text-subtle",
    success: "border-success text-success",
    warning: "border-warning text-warning",
    danger: "border-danger text-danger",
  };
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-xs border px-2 py-0.5 caption-4 font-medium whitespace-nowrap", t[tone])}>
      <span aria-hidden className="size-2 bg-current" />
      {children}
    </span>
  );
}
