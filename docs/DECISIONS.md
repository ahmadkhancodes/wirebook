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
