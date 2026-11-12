import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type Db, type WebhookDelivery, type WebhookEndpoint } from "@/lib/db/types";
import { hmacSha256Hex, randomToken, uuidv7 } from "@/lib/ids";
import { product } from "@/config/product";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

// Outbound webhooks: HMAC-SHA256 signed (Stripe-style header), retries with exponential backoff, delivery log.
// Header: `X-Webhook-Signature: t=<unix>,v1=<hex hmac of "t.body">`, plus X-Webhook-Id / X-Webhook-Event.

export const MAX_ATTEMPTS = 8;
/** Backoff after attempt n (1-based): 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h (+-10% jitter). */
export const BACKOFF_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]! * 1000;
  return Math.round(base * (0.9 + rand() * 0.2));
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export async function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

/** For receivers and tests: verify a signature header with a 5 minute tolerance. */
export async function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceS = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceS) return false;
  return parts.v1 === (await hmacSha256Hex(secret, `${t}.${body}`));
}

/** Queue an event to every enabled endpoint subscribed to it (or to "*"), and try once immediately. */
export async function emitEvent(orgId: string, event: string, data: unknown, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; environment?: "test" | "production" } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const eps = (await db.listWebhookEndpoints(orgId)).filter(
    (e) => e.enabled && (e.events.includes("*") || e.events.includes(event)) && (!opts.environment || !e.environment || e.environment === opts.environment),
  );
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    const id = uuidv7();
    const payload = JSON.stringify({ id, type: event, created: Math.floor(now.getTime() / 1000), data });
    const d: WebhookDelivery = {
      id, app: db.app, orgId, endpointId: ep.id, event, payload, status: "pending", attempts: 0,
      nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now,
      expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
    };
    await db.createDelivery(d);
    out.push(await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now }));
  }
  return out;
}

export async function attemptDelivery(
  d: WebhookDelivery,
  ep: WebhookEndpoint,
  opts: { db: Db; fetchFn?: typeof fetch; now?: Date },
): Promise<WebhookDelivery> {
  const now = opts.now ?? new Date();
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  try {
    const headers = {
      "content-type": "application/json",
      "user-agent": `${product.name}-Webhooks/1.0`,
      "x-webhook-id": d.id,
      "x-webhook-event": d.event,
      "x-webhook-signature": await signPayload(ep.secret, d.payload, Math.floor(now.getTime() / 1000)),
    };
    if (opts.fetchFn) {
      const res = await opts.fetchFn(ep.url, { method: "POST", signal: AbortSignal.timeout(10_000), redirect: "manual", headers, body: d.payload });
      code = res.status;
    } else {
      // the URL was checked when saved, but a public name can resolve to a private address later (or between a
      // check and the connect, DNS rebinding): the address is checked inside the connection that is actually made
      code = await postPinned(ep.url, headers, d.payload);
    }
    if (code < 200 || code > 299) error = `http_${code}`;
  } catch (e) {
    const name = (e as Error).name;
    error = name === "TimeoutError" ? "timeout" : name === "BlockedAddress" ? "blocked_address" : "network_error";
  }
  const ok = !error;
  const patch: Partial<WebhookDelivery> = {
    attempts,
    lastStatusCode: code,
    lastError: error,
    updatedAt: now,
    status: ok ? "succeeded" : attempts >= MAX_ATTEMPTS ? "failed" : "retrying",
    nextAttemptAt: ok || attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
  };
  await opts.db.updateDelivery(d.id, patch);
  return { ...d, ...patch };
}

/** Replay: send an existing delivery again from scratch (same body, fresh signature, attempts reset). Returns null if it is not found. */
export async function replayDelivery(orgId: string, id: string, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date } = {}): Promise<WebhookDelivery | null> {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const d = await db.getDelivery(orgId, id);
  if (!d) return null;
  const ep = await db.getWebhookEndpoint(orgId, d.endpointId);
  if (!ep) return null;
  const fresh: WebhookDelivery = { ...d, status: "pending", attempts: 0, nextAttemptAt: now, lastError: null, lastStatusCode: null, updatedAt: now, expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5) };
  await db.updateDelivery(id, { status: "pending", attempts: 0, nextAttemptAt: now, lastError: null, lastStatusCode: null, updatedAt: now, expireAt: fresh.expireAt });
  return attemptDelivery(fresh, ep, { db, fetchFn: opts.fetchFn, now });
}

/** Cron job: retry due deliveries. */
export async function retryDueDeliveries(opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; limit?: number } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const due = await db.dueDeliveries(now, opts.limit ?? 50);
  let ok = 0;
  for (const d of due) {
    const ep = await db.getWebhookEndpoint(d.orgId, d.endpointId);
    if (!ep || !ep.enabled) {
      await db.updateDelivery(d.id, { status: "failed", lastError: "endpoint_disabled", nextAttemptAt: null, updatedAt: now });
      continue;
    }
    const r = await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now });
    if (r.status === "succeeded") ok++;
  }
  return { processed: due.length, succeeded: ok };
}

/** Block private/loopback targets (SSRF) for user-supplied webhook URLs. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.startsWith("[") || h === "::1") return false;
  return true;
}

/** True for loopback, private, link-local, CGNAT, unspecified and unique-local addresses (IPv4, IPv6, IPv4-mapped). */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const m4 = v.match(/^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m4) {
    const [a, b] = [Number(m4[1]), Number(m4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0 && Number(m4[3]) === 0) || a >= 224;
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("::ffff:") || v.startsWith("64:ff9b:") || v.startsWith("2002:");
}

/** Resolve the webhook host and refuse it if any address is private (SSRF through DNS). */
export async function resolvesPublic(raw: string, lookup?: (host: string) => Promise<{ address: string }[]>): Promise<boolean> {
  let host: string;
  try { host = new URL(raw).hostname; } catch { return false; }
  try {
    const look = lookup ?? (async (h: string) => (await import("node:dns/promises")).lookup(h, { all: true, verbatim: true }));
    const addrs = await look(host.replace(/^\[|\]$/g, ""));
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

const blocked = () => Object.assign(new Error("blocked"), { name: "BlockedAddress", code: "EBLOCKED" });
type RawLookup = (host: string, opts: { all: true }, cb: (err: NodeJS.ErrnoException | null, addrs: LookupAddress[]) => void) => void;

/** A `lookup` for node:http(s) that refuses private addresses: the check and the connect use the same answer. */
export function guardedLookup(base: RawLookup = dnsLookup as unknown as RawLookup): LookupFunction {
  return ((host: string, options: { all?: boolean } | number, cb: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
    base(host, { all: true }, (err, addrs) => {
      if (err) return cb(err, "", 4);
      if (!addrs?.length || addrs.some((a) => isPrivateAddress(a.address))) return cb(blocked(), "", 4);
      if (typeof options === "object" && options?.all) return cb(null, addrs);
      return cb(null, addrs[0]!.address, addrs[0]!.family);
    });
  }) as unknown as LookupFunction;
}

/**
 * POST without following redirects, a 10 s budget and the response body never read. Node skips `lookup` for IP
 * literals, so those are checked here. Resolves to the status code; rejects with BlockedAddress or TimeoutError.
 */
export function postPinned(raw: string, headers: Record<string, string>, body: string, opts: { lookup?: LookupFunction; timeoutMs?: number } = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(raw); } catch { return reject(blocked()); }
    const host = u.hostname.replace(/^\[|\]$/g, "");
    if (u.protocol !== "https:" && u.protocol !== "http:") return reject(blocked());
    if (isIP(host) && isPrivateAddress(host)) return reject(blocked());
    const send = u.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(u, { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, lookup: opts.lookup ?? guardedLookup(), timeout: opts.timeoutMs ?? 10_000 }, (res) => {
      resolve(res.statusCode ?? 0);
      res.destroy();
    });
    // a hard deadline for the whole exchange, so a receiver that trickles bytes cannot hold the function open
    const timer = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })), opts.timeoutMs ?? 10_000);
    req.on("close", () => clearTimeout(timer));
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    req.on("error", (e) => reject((e as NodeJS.ErrnoException).code === "EBLOCKED" ? blocked() : e));
    req.end(body);
  });
}
