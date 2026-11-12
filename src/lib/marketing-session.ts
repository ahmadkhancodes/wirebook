/** Pure label and link logic for the marketing site when the visitor already has a session. */
export const APP_HOME = { href: "/app", label: "Open dashboard" } as const;

type Cta = { href: string; label: string };

/** Header, hero and final CTAs: signed in visitors go straight to the app. */
export function ctaFor(signedIn: boolean, signedOut: Cta): Cta {
  return signedIn ? { ...APP_HOME } : signedOut;
}

/** Pricing card button: free plan opens the app, paid plans go to billing with the choice preselected. */
export function planCtaFor(signedIn: boolean, plan: { id: string; cta: string }, interval: string): Cta {
  if (!signedIn) return { href: `/sign-in?plan=${plan.id}&interval=${interval}`, label: plan.cta };
  if (plan.id === "free") return { ...APP_HOME };
  return { href: `/app/billing?plan=${plan.id}&interval=${interval}`, label: plan.cta };
}
