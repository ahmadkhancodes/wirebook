import { dbDriver, env, appName } from "@/lib/env";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus a database ping (2 s budget): 503 when Mongo cannot be reached, so uptime checks see an outage. */
export async function GET() {
  const driver = dbDriver();
  let db: "ok" | "down" | "memory" = "memory";
  if (driver === "mongo") {
    try {
      const e = env();
      const { mongoClient } = await import("@/lib/db/mongo");
      const ping = mongoClient(e.MONGODB_URI!).then((c) => c.db(e.MONGODB_DB ?? appName(e)).command({ ping: 1 }));
      await Promise.race([ping, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 2000))]);
      db = "ok";
    } catch {
      db = "down";
    }
  }
  const ok = db !== "down";
  // Only whether a dependency is configured, never keys, hosts or error text.
  const e = env();
  const mail = e.MAIL_PROVIDER === "console" || e.MAIL_PROVIDER === "none" || (!e.MAIL_PROVIDER && !e.RESEND_API_KEY) ? "not_configured" : "configured";
  const billing = e.STRIPE_SECRET_KEY ? "configured" : "not_configured";
  return json({ ok, db, driver, mail, billing, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() }, ok ? 200 : 503);
}
