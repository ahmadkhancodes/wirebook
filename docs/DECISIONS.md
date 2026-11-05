# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

## 5 Nov 2026 (Phase 0)
- **Design direction:** workbook "Ledger and Terminal" adopted (docs/DESIGN.md). Competitor audit confirms the category look (dark glow, DM Sans/Inter, teal or blue pills); we differ on four axes.
- **Fonts:** Spectral + Public Sans + JetBrains Mono. Overrides the playbook's font whitelist under its ICP override rule; the ban list (Inter, Roboto, Arial, Helvetica, Open Sans) still holds.
- **Icons:** Phosphor (regular) instead of the workbook's Tabler, to follow the factory rule (Phosphor/Solar/Iconamoon) across all seven products.
- **Dark palette** is green tinted, not the playbook's neutral black list (one colour family). No gradients anywhere.
- **Queue:** Mongo collection behind a `JobQueue` interface; BullMQ/Valkey on the VPS later.
- **Sync wait:** long poll inside the held `sendRequestXML` (about 25 s) to reach "under 5 s warm"; sync API wait 90 s on Pro, 55 s on Hobby.
- **No real QuickBooks in build:** a spec faithful QBWC simulator + golden qbXML fixtures; real acceptance run is an owner item. Docs must not claim real world parity before it.
- **Banned deps CI** kept for unapproved vendors; approved exceptions: Vercel, Mongo Atlas, Stripe, Resend (mailer), Cloudflare R2/Workers.
- **Roadmap items** (webhooks, C#, MCP) are never shown as shipped on the site; "Coming in v1" line only.
- **Primary colour (orchestrator review, 5 Nov):** near-black ledger ink (#14201A / dark #E4ECE4), not green, to stay distinct from DockCrate, Stepclimb and Hotrail. Green kept only as band tint and success state. Design approved otherwise.
- **Before kit-v1:** build qbXML codec, QBWC SOAP handler and simulator as pure TS modules with tests, no UI. DB_DRIVER=memory until MONGODB_URI arrives.
- **qbXML specs are hand-authored (5 Nov):** the Intuit XSD is login-gated and not redistributable, so `src/lib/qbxml/spec.ts` declares element order for customer (query/add/mod) and invoice (query/add) from the public reference. Golden fixtures prove self-consistency only. M2 adds `tools/gen-qbxml` to verify/extend the specs against an XSD the owner downloads from Intuit, and the remaining ~35 objects. Not claimed as verified against real QuickBooks.
- **One job in flight per file** is enforced by the queue contract; Mongo driver must use a unique partial index on `(endUserId)` where `state='sent'` plus `findOneAndUpdate`. The memory driver's concurrency test caught a real check-then-set race, now fixed.

## 5 Nov 2026 (M1-A kit adoption)
- **Plan ids:** `free` (Developer), `production`, `starter_pack`, `volume`. Enterprise is custom and not a plan row. Volume has a monthly price only (brief publishes no annual). Rank order follows the list.
- **Meter:** `MeterId = "files"` only (active company files). Limits are included files: Developer 3 (non-production), Production 1 (per-file, quantity billing comes with M1 billing work), Starter Pack 4, Volume 50.
- **Annual price cents** are the yearly charge per Stripe unit (kit convention): per-file $19.99 x 12 = 23988; pack $82.99 x 12 = 99588. Monthly: 2499, 9799, 1699.
- **Wall clock in qbwc tests:** `MemorySessions.get` checks expiry against the real clock, so the bridge test's fake clock now starts at real now (the fixed 2026-11-05T10:00Z date broke once the day passed 10:00 UTC). Logic untouched.
- **Lint:** `no-explicit-any` is off for `tools/**`, `src/lib/qbxml/**`, `src/lib/qbwc/**` (prior modules kept as written).
- **Fonts:** added a third font export `display` (Spectral) and its variable on `<html>` in layout.tsx; needed for the serif display face.

## 5 Nov 2026 (M1-B storefront)
- **Heading tokens retuned:** heading-1..4 now use Spectral (display) at 56/40/36/28 to match DESIGN.md; the kit's hero gradient utility and glass header were removed (gradients and glassmorphism are banned). Radii capped at 6px via theme tokens.
- **Single source for figures:** `src/lib/pricing.ts` derives every price on marketing pages from `product.ts`; the dated Conductor benchmark ($49, checked 3 Nov 2026) and the CTA/Intuit notice live in `product.ts`.
- **Compare:** only /compare/conductor ships (diy and apideck stay M3+). Rows state roadmap items as not shipped.
- **Docs:** webhooks doc removed (roadmap only); docs state that /v1/qbd/* is a contract being built and validated against the simulator.
- **Pages not linked until they exist:** footer links only to existing docs pages (no Changelog/Status/error pages yet). Error guide link in the log sample is plain text.
- **Legal:** retention figures (30/35 days) inherited from the kit, flagged in MANUAL_STEPS.

## 5 Nov 2026 (M2 bridge)
- **Status:** all M2 behaviour is validated against the simulator (`tools/simulate-qbwc`), never against real QuickBooks. Nothing here claims parity with a real Web Connector run.
- **Routes:** `/qbwc` (SOAP + `?wsdl`), `/v1/qbd/{object}[/{id}]`, `/v1/qbd/raw`, `/v1/requests/{id}`, `/v1/connect-links`, `/connect/<token>` (+ `/wirebook.qwc`, `/status`), `/errors/<slug>`. REST lives at `/v1/...` not `/api/v1/...` (the kit's `/api/v1/me` stays as is).
- **Tenancy:** a project is `{orgId}__{environment}`. The key's `metadata.environment` (set when the key is created in the dashboard) picks test or production; a key without it is a test key, so a legacy key can never reach production data. Every end user, request and idempotency key is scoped by projectId; test and production never see each other.
- **Bridge store:** one `Bridge` (queue, end users, sessions, idempotency, connect links) with a memory driver and a Mongo driver in `src/lib/bridge`; collections `requests`, `endUsers`, `qbwcSessions`, `idempotencyKeys`, `connectLinks`. The request log reads the `requests` collection, so a job and a request are the same record. The Mongo driver compiles and follows the memory contract but is not exercised by tests here.
- **3100 corrected:** 3100 is "name already in use" (code `duplicate_name`, 409), which the simulator and the site copy already said. `edition_not_supported` moved to 3250. The earlier mapping of 3100 to edition-not-supported came from the brief's shorthand and was wrong; the test was updated.
- **Error catalogue:** `src/lib/errors/catalogue.ts` is the single list (27 entries). Every entry has a page at `/errors/<slug>`; a test enumerates them against the route's `generateStaticParams` and against every code the mappers can produce. Guide slugs for QuickBooks codes are the number (`/errors/3140`). Thirty guides is still the launch target (M4 SEO pages).
- **Unified error object:** `{ error: { code, type, message, userFacingMessage, guideUrl (absolute), retryable, path?, requestId?, cursorExpiresAt? } }`.
- **Specs extended** (hand-authored, golden fixtures prove self-consistency only): vendor query/add/mod, item query + service item add, account query/add, bill query/add, receive payment query/add. REST keys: `expenseLines`, `itemLines`, `appliedTo`, `salesOrPurchase`. Update (Mod) exists for customers and vendors only; the other objects answer 405 `not_supported`. Items create service items only. The remaining ~33 objects and `tools/gen-qbxml` XSD verification stay M3.
- **Cursor pagination** uses the qbXML iterator (`Start`, then `Continue` with the id). The cursor is an unsigned base64url blob `{object, endUser, iteratorId, expiry}` valid 10 minutes, bound to the object and end user; it is not stored in `requests` (a stateless cursor needs no cleanup). Expired -> 410 `cursor_expired`, edited or foreign -> 400 `invalid_cursor`.
- **Idempotency:** header on writes, key scoped per project, body hash over method, path and canonical (key-sorted) JSON, 7 day expiry (Mongo TTL on a Date plus an expiry check at read). Same key + same request replays the original (marked `Idempotent-Replayed: true`, same request id, waits if still running); different request -> 409. A lost insert race cancels the loser's queued job.
- **Sync wait:** `waitMs` 55 s default (`SYNC_WAIT_MS`), poll every 250 ms, then `202` with `Location: /v1/requests/{id}`. `Prefer: respond-async` skips the wait. Long poll inside `sendRequestXML` stays off by default (`QBWC_HOLD_MS=0`): the Web Connector session ends when the queue empties, so a held request only helps once measured on a real rig (R2).
- **Raw passthrough** accepts JSON `{qbxml}` or an XML body, requires well-formed XML with exactly one request message, returns `{requestId, state, raw, parsed}`; a QuickBooks error still returns 200 with its `statusCode`. Raw jobs store the response on the request record (needed to return it); purge is M3.
- **Connect flow:** `POST /v1/connect-links {externalId, companyName?}` creates the end user (unique OwnerID, FileID, username; unique `(projectId, externalId)`), queues one cheap `customer.query` as the first-sync probe, and returns a link valid 24 h, single use (closed when the first sync is observed). Only the token hash is stored. Steps: 1 `.qwc` served, 2 first `authenticate` for that username (any result), 3 first `sendRequestXML` (the Web Connector reached QuickBooks, so the app is authorised), 4 first successful response. The Web Connector password is derived (HMAC of the end user id with `BETTER_AUTH_SECRET`) so the page can show it again; only its scrypt hash is stored, and rotating the secret breaks existing connections. A second link for an already synced file is refused (`already_connected`); reconnect links come with the health monitor in M3.
- **Request log** is now `/app` (the kit's overview page is gone; plan and usage stay on `/app/billing`). Server rendered, filters via GET, detail pane via `?req=`, keyset paging via `?before=`.
- **Connect page theme:** follows the site theme (light and dark both checked) instead of light only.
- **E2E-only helper:** `/api/dev/seed-requests` (404 unless `E2E_OUTBOX=1`) fills the log for the screenshots.
