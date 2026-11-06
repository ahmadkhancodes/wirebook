import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { checkSignup } from "@/lib/security/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Magic link requests double as sign-up, so they get the abuse checks first: sign-ups switched on, disposable
 * email blocklist, rate limits and ALTCHA (sent in the `x-altcha` header). Everything else goes to Better Auth.
 */
const handler = async (req: Request) => {
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/sign-in/magic-link")) {
    let email: unknown;
    try { email = ((await req.clone().json()) as { email?: unknown }).email; } catch { email = undefined; }
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const r = await checkSignup({ email, altcha: req.headers.get("x-altcha"), ip, db: await getDb() });
    if (!r.ok) {
      return json({ code: r.code.toUpperCase(), message: r.code }, r.status, r.code === "rate_limited" ? { "retry-after": "600" } : {});
    }
  }
  return (await getAuth()).handler(req);
};
export const { GET, POST, PATCH, PUT, DELETE } = toNextJsHandler(handler);
