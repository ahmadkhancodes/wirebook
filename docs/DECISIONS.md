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
