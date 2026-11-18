import { product } from "@/config/product";
import { appUrl, env, isProd, secretOr } from "@/lib/env";
import { getDb } from "@/lib/db";
import { hmacSha256Hex } from "@/lib/ids";
import { log } from "@/lib/logger";
import { consoleTransport, gatewayTransport, resendTransport, smtpTransport } from "./transports";
import type { MailMessage, MailTransport, SendResult } from "./types";

export type { MailMessage, MailTransport, SendResult } from "./types";

export function transportFromEnv(): MailTransport {
  const e = env();
  // Gateway first; direct Resend is only the fallback when MAIL_GATEWAY_URL is unset. A URL without a key fails loudly.
  if (e.MAIL_GATEWAY_URL && e.MAIL_PROVIDER !== "console") {
    if (!e.MAIL_GATEWAY_KEY) throw new Error("mail_gateway_key_missing");
    return gatewayTransport({ url: e.MAIL_GATEWAY_URL, key: e.MAIL_GATEWAY_KEY });
  }
  const p = e.MAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : "console");
  if (p === "resend" && e.RESEND_API_KEY) return resendTransport(e.RESEND_API_KEY);
  if (p === "smtp") return smtpTransport();
  if (isProd() && e.MAIL_PROVIDER !== "console") throw new Error("No mail provider configured: set RESEND_API_KEY (or MAIL_PROVIDER=smtp)");
  return consoleTransport();
}

const unsubSecret = () => secretOr(env().BETTER_AUTH_SECRET, "dev-unsubscribe-secret", "BETTER_AUTH_SECRET");

/** Signed one-click unsubscribe token (RFC 8058). */
export async function unsubscribeToken(email: string, scope: string) {
  return hmacSha256Hex(unsubSecret(), `${email.toLowerCase()}|${scope}`);
}

export async function unsubscribeUrl(email: string, scope: string) {
  const t = await unsubscribeToken(email, scope);
  const q = new URLSearchParams({ e: email.toLowerCase(), s: scope, t });
  return `${appUrl()}/api/mail/unsubscribe?${q}`;
}

/**
 * The one way to send mail. Checks the suppression list (transactional mail skips marketing scopes),
 * adds List-Unsubscribe + List-Unsubscribe-Post for non-transactional mail.
 */
export async function sendMail(msg: MailMessage, transport: MailTransport = transportFromEnv()): Promise<SendResult> {
  const db = await getDb();
  const category = msg.category ?? "transactional";
  const scope = category === "transactional" ? "transactional" : category;
  if (category !== "transactional" && (await db.isSuppressed(msg.to, scope)))
    return { id: "", provider: transport.name, accepted: false, suppressed: true };
  const headers = { ...msg.headers };
  if (category !== "transactional") {
    const url = await unsubscribeUrl(msg.to, scope);
    headers["List-Unsubscribe"] = `<${url}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return transport.send({ ...msg, headers, replyTo: msg.replyTo ?? product.supportEmail, from: msg.from ?? env().MAIL_FROM ?? product.mailFrom });
}

/**
 * sendMail for request paths and cron: a provider rejection (bad address, rate limit, outage) is logged with a
 * scrubbed code and never thrown, so the caller answers normally and nothing from the provider reaches the client.
 */
export async function sendMailSafe(msg: MailMessage, transport?: MailTransport): Promise<SendResult> {
  try {
    return await sendMail(msg, transport);
  } catch (e) {
    const m = (e as Error).message ?? "";
    log.error("mail_send_failed", { code: /^[a-z_0-9]{1,60}$/.test(m) ? m : "unknown" });
    return { id: "", provider: "none", accepted: false };
  }
}
