import { describe, expect, it } from "vitest";
import { ctaFor, planCtaFor } from "@/lib/marketing-session";

describe("marketing session labels", () => {
  const out = { href: "/sign-in", label: "Get a free API key" };
  it("keeps the signed out CTA", () => expect(ctaFor(false, out)).toEqual(out));
  it("opens the app when signed in", () => expect(ctaFor(true, out)).toEqual({ href: "/app", label: "Open dashboard" }));
  it("pricing: signed out goes to sign-in", () => expect(planCtaFor(false, { id: "production", cta: "Choose Production" }, "year")).toEqual({ href: "/sign-in?plan=production&interval=year", label: "Choose Production" }));
  it("pricing: signed in paid goes to billing", () => expect(planCtaFor(true, { id: "production", cta: "Choose Production" }, "month")).toEqual({ href: "/app/billing?plan=production&interval=month", label: "Choose Production" }));
  it("pricing: signed in free opens the app, never Start free", () => expect(planCtaFor(true, { id: "free", cta: "Start free" }, "month").label).toBe("Open dashboard"));
});
