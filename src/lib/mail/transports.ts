import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import type { MailMessage, MailTransport, SendResult } from "./types";

/** Dev/test/stub transport: keeps messages in memory and logs the subject (never the body). */
type Sent = MailMessage & { from: string; id: string; at: Date };
declare global {
  var __wirebookOutbox: Sent[] | undefined;
}
/** One array per process even when the bundler gives the auth route and the outbox route their own copy of this module. */
export const outbox: Sent[] = (globalThis.__wirebookOutbox ??= []);

export function consoleTransport(): MailTransport {
  return {
    name: "console",
    async send(msg) {
      const id = uuidv7();
      outbox.push({ ...msg, id, at: new Date() });
      if (outbox.length > 200) outbox.shift();
      log.info("mail_console", { subject: msg.subject, id });
      // Stub mode only (no mail provider yet): MAIL_CONSOLE_PRINT=1 prints the body so magic links can be used from logs.
      if ((process.env.NODE_ENV === "development" || process.env.MAIL_CONSOLE_PRINT === "1") && process.env.NODE_ENV !== "test")
        console.log(`\n--- mail ${id} ---\n${msg.text}\n---\n`);
      return { id, provider: "console", accepted: true };
    },
  };
}

/** Transactional provider adapter (Resend REST over fetch, no SDK). */
export function resendTransport(apiKey: string, fetchFn: typeof fetch = fetch): MailTransport {
  return {
    name: "resend",
    async send(msg): Promise<SendResult> {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html,
          reply_to: msg.replyTo, headers: msg.headers,
          tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`mail_send_failed_${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: body.id ?? uuidv7(), provider: "resend", accepted: true };
    },
  };
}

/**
 * BufferSol mail gateway (POST {url}/v1/send, Bearer key). The gateway forces From to this app's own address, so no
 * `from` is sent. `record: "metadata"` keeps OTP / reset bodies out of the gateway log. Per-attempt timeout; one retry on
 * 429/502/503/network error, reusing one Idempotency-Key so a retry after a timeout never double-sends.
 */
export function gatewayTransport(
  opts: { url: string; key: string; timeoutMs?: number; attempts?: number },
  fetchFn: typeof fetch = fetch,
): MailTransport {
  const { url, key, timeoutMs = 8_000, attempts = 2 } = opts;
  return {
    name: "gateway",
    async send(msg): Promise<SendResult> {
      const idem = `wb-${uuidv7()}`;
      const body = JSON.stringify({
        to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo,
        record: "metadata", category: msg.category === "marketing" ? "marketing" : "transactional",
      });
      let code = "mail_send_failed";
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let retry = true;
        try {
          const res = await fetchFn(`${url.replace(/\/+$/, "")}/v1/send`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idem },
            body,
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
            return { id: j.messageId ?? j.id ?? uuidv7(), provider: "gateway", accepted: true };
          }
          code = `mail_send_failed_${res.status}`;
          retry = res.status === 429 || res.status === 502 || res.status === 503;
        } catch {
          code = "mail_send_failed_network";
        }
        if (!retry) break;
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(code);
    },
  };
}

/**
 * SMTP adapter stub for the VPS (own Postfix/KumoMTA). Implement with nodemailer when the VPS exists;
 * the interface stays the same so no caller changes.
 */
export function smtpTransport(): MailTransport {
  return {
    name: "smtp",
    async send() {
      throw new Error("smtp_transport_not_configured");
    },
  };
}
