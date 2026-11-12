import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Buttons (playbook §7 states): primary, secondary, tertiary, danger. Hover/active/focus/disabled/loading.
type Variant = "primary" | "secondary" | "tertiary" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-md whitespace-nowrap select-none transition-[background-color,color,border-color,opacity,transform] duration-300 ease-out-kit active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress focus-visible:focus-ring";
const variants: Record<Variant, string> = {
  primary: "bg-action text-action-text hover:bg-action-hover",
  secondary: "border border-text bg-surface text-text hover:bg-surface-sunken",
  tertiary: "text-text-subtle hover:text-text hover:bg-surface-sunken",
  danger: "bg-danger text-danger-text hover:opacity-90",
};
const sizes: Record<Size, string> = {
  sm: "button-sm min-h-11 px-3 py-1 sm:min-h-8",
  md: "button-sm min-h-11 px-4 py-2",
  lg: "button-md min-h-12 px-6 py-3",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "primary", size = "md", loading, className, children, ...rest
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button aria-busy={loading || undefined} disabled={rest.disabled || loading} className={buttonClass(variant, size, className)} {...rest}>
      {loading ? <span aria-hidden className="h-0.5 w-4 bg-current opacity-70 motion-safe:animate-pulse" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  href, variant = "primary", size = "md", className, children, ...rest
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string; variant?: Variant; size?: Size; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)} {...rest}>{children}</Link>;
}

/** Segmented control (environment switch, billing interval): one graphite frame, the chosen segment filled. */
export const segmentGroupClass = "inline-flex w-fit rounded-sm border border-text bg-surface-raised";
export function segmentClass(active: boolean, { mono = false }: { mono?: boolean } = {}) {
  return cn(
    "inline-flex min-h-11 items-center gap-2 px-4 transition-colors duration-300 ease-out-kit focus-visible:focus-ring sm:min-h-10",
    mono ? "index-label" : "button-sm",
    active ? "bg-text text-text-inverse" : "text-text-subtle hover:bg-surface-sunken hover:text-text",
  );
}
