"use client";
import { ButtonLink } from "@/components/ui/button";
import { ctaFor } from "@/lib/marketing-session";
import { useSignedIn } from "./use-signed-in";

/** Primary call to action that becomes "Open dashboard" for a signed in visitor. */
export function SessionCta({ cta, size }: { cta: { href: string; label: string }; size?: "md" | "lg" }) {
  const c = ctaFor(useSignedIn(), cta);
  return <ButtonLink href={c.href} size={size}>{c.label}</ButtonLink>;
}
