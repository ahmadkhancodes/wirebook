import { flagOn, getFlags } from "@/lib/flags";
import type { Db } from "@/lib/db/types";
import { verifyAltcha } from "./altcha";
import { isDisposableEmail, normEmail } from "./disposable";
import { rateLimit, RULES } from "./ratelimit";

export type SignupCheck = { ok: true; email: string } | { ok: false; status: number; code: "signups_closed" | "invalid_email" | "disposable_email" | "rate_limited" | "altcha_failed" };

/**
 * Checks before we email a sign-in or sign-up link: sign-ups switched on, a valid address that is not a throwaway
 * domain, per address and per IP limits, and a solved ALTCHA challenge (single use). Order matters: the cheap
 * checks run first, the challenge (which burns its single use) last.
 */
export async function checkSignup(input: { email: unknown; altcha: unknown; ip: string; db: Db; flags?: Record<string, string>; now?: number }): Promise<SignupCheck> {
  const flags = input.flags ?? (await getFlags());
  if (flags.signups_enabled !== undefined && !flagOn(flags, "signups_enabled")) return { ok: false, status: 403, code: "signups_closed" };
  const email = normEmail(input.email);
  if (!email) return { ok: false, status: 400, code: "invalid_email" };
  if (isDisposableEmail(email)) return { ok: false, status: 400, code: "disposable_email" };
  const ipHit = await rateLimit(`signup-ip:${input.ip}`, RULES.authIp, input.db, input.now);
  const mailHit = await rateLimit(`signup-email:${email}`, RULES.authEmail, input.db, input.now);
  if (!ipHit.ok || !mailHit.ok) return { ok: false, status: 429, code: "rate_limited" };
  if (!(await verifyAltcha(input.altcha, input.db))) return { ok: false, status: 400, code: "altcha_failed" };
  return { ok: true, email };
}
