# Security review: adversarial pass (12 Nov 2026)

Done as an attacker with an account who wants another customer's data, free paid features or code execution.
Every claim below was tried against the locally running production build (`next start`, memory DB, outbox mail),
not only read in code. Exploit specs: `tests/e2e/security.spec.ts` (9 tests, live HTTP). Unit regressions:
`tests/unit/security-review.test.ts` (each failed on the old code, 17 of 21 cases red before the fix).

## Threat model

**Assets.** (1) Customers' QuickBooks data passing through the request queue (customers, invoices, bills, raw qbXML
replies). (2) Credentials: session cookies, organisation API keys (test and production), Web Connector passwords,
connect-link tokens, webhook signing secrets, magic links. (3) Billing state: plan, active production file count,
Stripe customer. (4) Founder powers: `/admin` totals, org and key suspension. (5) Availability of `/qbwc` and `/v1`
for paying customers.

**Actors.** Anonymous internet; a signed-up customer (owner of their own org); a lower-role member or viewer of an
org; a former member; an end user holding a connect link; a malicious webhook receiver; someone who can make DNS
answer what they like; Stripe (trusted only through signatures).

**Entry points.** `/api/auth/*` (Better Auth: magic link, passkeys, TOTP, organisations, invitations, API keys),
the app API `/api/*` (cookie + Origin check), the public API `/v1/*` (API key), `/qbwc` (SOAP, Web Connector login),
`/connect/<token>` and its `.qwc`/status routes, `/api/stripe/webhook`, `/api/cron/*` (CRON_SECRET),
`/api/mail/unsubscribe` (signed token), `/api/dev/*` (E2E only), outbound webhook deliveries (server-side fetch of a
customer-chosen URL), pages under `/app` and `/admin`.

## Findings (fixed)

| # | Severity | Finding | What an attacker could do | Fix |
|---|---|---|---|---|
| S1 | **High** | Open redirect through `?next=` | `https://wirebook…/sign-in?next=/%09/evil.example` sent a signed-in visitor straight to `evil.example` (server `redirect()`), and the same value reached `window.location` after onboarding and two-factor. Browsers drop tab/newline from URLs, so `/\t/evil` becomes `//evil`. A trusted-domain link for phishing a fake "session expired, sign in again" page. | `safeNext` (src/components/app/redirect.ts) refuses any control character or whitespace and re-parses the result, which must resolve to our own origin. Live test + 8 unit cases. |
| S2 | **Medium** | Webhook SSRF through DNS rebinding and missed ranges | Delivery checked the host's DNS answer, then `fetch` resolved it again: a name that answers public then `127.0.0.1`/`169.254.169.254` made the server POST to internal addresses and record the status code (a blind internal port scanner, a real risk once this runs on a VPS). `198.18/15`, `192.0.0/24`, NAT64 `64:ff9b::/96` and 6to4 `2002::/16` were treated as public. | Production deliveries go through `postPinned` (src/lib/webhooks/outbound.ts): node:http(s) with a `lookup` that refuses private answers, so the check and the connect use the same address; IP literals checked before connecting; no redirects; body never read; hard 10 s deadline for slow receivers. Unit tests with a rebinding resolver and a local server prove it is never reached. |
| S3 | Low | Cross-org webhook delete answered "deleted" | `DELETE /api/webhooks/<other org's id>` returned `{deleted:true}` (nothing was deleted, the query is org scoped) and wrote a false `webhook.deleted` line with the other org's id into the caller's audit log. | 404 unless the endpoint belongs to the active org, before anything is written. Live test. |
| S4 | Low (defence in depth) | Dev routes guarded by one env var | `/api/dev/outbox` returns recent mails, i.e. every user's magic link. If `E2E_OUTBOX=1` were ever set on production it would be instant account takeover. | `devRoutesEnabled()` (src/lib/env.ts) also refuses on `VERCEL_ENV=production`. Unit test. |
| S5 | Low (defence in depth) | `/admin` page relied on its layout | The totals and flags page did no check of its own; App Router can render a page segment without re-running its layout. A forged RSC router state did **not** get through on Next 16.4.5 (live test), but the page now checks `isFounderAdmin` itself. | Page-level check in src/app/admin/page.tsx; live test with forged `next-router-state-tree`. |
| S6 | Info | Client IP read in three places | `/v1` and the magic-link gate parsed `x-forwarded-for` themselves. | One `clientIp()` (src/lib/http.ts) with the trust model written down (see O3). |

## Tried and held (no change needed)

- **Tenant isolation:** with two orgs, org B tried A's webhook endpoint (update, test, delete), delivery (read,
  replay), company files (read, reconnect link, revoke, query through `x-end-user-id`), request ids via `/v1/requests`,
  and every list/export (`/api/webhooks`, deliveries filtered by A's endpoint id, `/api/audit`, `/api/end-users`,
  request CSV, account export): all 404 or empty. Better Auth org endpoints with A's org id (set-active, get-full,
  update, delete, invite, API key create/list/delete): all refused.
- **Roles:** a member cannot promote itself to admin/owner, remove the owner, mint API keys, invite, manage webhooks,
  billing or retention; `/api/admin/*` is 404 for customers. Invitations can only be accepted by the invited address.
- **Auth:** magic links are single use (replay from another browser gets no session), 10 minute expiry; sign-out
  invalidates the session token server side (a stolen `session_data` cache cookie stays readable for up to its
  5 minute cache window, Better Auth's cookie cache trade-off); session cookie is HttpOnly + SameSite=Lax (and `__Host-` + Secure on
  https); a `callbackURL` of another origin (`https://`, `//`, `/\t/`) never ends in an off-site redirect; ALTCHA and the per-IP/per-address limits cannot be
  skipped through path variants (`/magic-link/`, `%2D`, case, `//`, `./`, `;x`).
- **CSRF:** every state-changing cookie route answers 403/4xx to a foreign `Origin` (app API and Better Auth).
- **Injection:** `$ne`/`$gt`/`$where` objects, `__proto__` and `constructor.prototype` in JSON bodies are rejected
  (400) by zod or the explicit field checks; e-mail templates escape every user string; CSV export is formula-safe;
  React escapes company and org names on pages.
- **Webhooks in:** Stripe signature on the raw body (`constructEventAsync`, 5 min tolerance); entitlement is
  recomputed from Stripe on each event, so replays and out-of-order events converge; other apps' customers ignored.
- **Billing tampering:** checkout plan/interval are an enum; the price comes from the server catalogue; file caps are
  enforced on connect-link creation and again when the Web Connector asks for work.
- **Exposure:** `/api/health` reports only configured/not configured; error bodies carry codes, never stacks;
  `.env`, `.git` and traversal paths 404; no secrets or source maps in `.next/static` (existing bundle test plus a grep).
- **Availability:** JSON bodies capped at 1 MB, list limits bounded, exports capped at 5000 rows and rate limited,
  per-IP and per-key limits on `/v1`.
- **Dependencies:** `npm audit --omit=dev`: 0 vulnerabilities.

## Open (needs a product or infra decision)

| # | Severity | Item | Recommendation |
|---|---|---|---|
| O1 | Medium | One account can create unlimited organisations, and each gets the Developer plan's free production files. Free paid capacity by multiplying orgs (or accounts). | Decide the abuse policy: cap organisations per user (Better Auth `organizationLimit`, e.g. 3) and/or require a card on file before a second org's first production file. |
| O2 | Low | Login CSRF is inherent to magic links: an attacker can send a victim a link that signs the victim into the attacker's account. | Keep the signed-in e-mail visible in the app shell; optionally bind the link to the browser that asked for it (cookie nonce). |
| O3 | Low | Per-IP limits trust the first `x-forwarded-for` entry. Safe on Vercel (it overwrites the header); behind another proxy it is spoofable. | When moving to a VPS, make the proxy overwrite `x-forwarded-for`, or change `clientIp()` to the proxy's header. |
| O4 | Low | `script-src 'unsafe-inline'` in the CSP (needed for Next's inline bootstrap on static pages). | Nonce-based CSP would force dynamic rendering of the marketing pages; revisit if third-party scripts are ever added. |
| O5 | Info | `npm audit` (dev only): `minimatch` ReDoS inside `typescript-eslint`, reachable only from the linter. The suggested fix is a breaking downgrade of `eslint-config-next`. | Pick up with the next eslint-config-next release. |
