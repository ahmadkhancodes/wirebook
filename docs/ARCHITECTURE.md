# Architecture: Wirebook by BufferSol on Vercel + MongoDB Atlas + Stripe + the kit

Status: Phase 0. Reads with `docs/brief.md` (scope = every P0), `docs/factory/BATCH1_PLAN.md` (standing decisions) and `docs/factory/UNIVERSAL_KIT.md` (modules we copy from `postslot` @ `kit-v1`).

## 0. Where we deliberately differ from the workbook (all logged in DECISIONS.md)

| Workbook | Here | Why / how it moves back |
|---|---|---|
| Postgres 16 + Drizzle, RLS by org | **MongoDB Atlas** via the kit's DB interface (Mongo + memory drivers); tenant scoping by `projectId` in the repository layer, enforced by a contract test | Standing decision. Swap = new driver behind the interface |
| Fastify + BullMQ on Valkey, 2 Hetzner nodes | **Next.js route handlers on Vercel functions**; the per-file queue is a Mongo collection with atomic claim | No always-on servers yet. Queue sits behind a `JobQueue` interface; a Valkey/BullMQ implementation drops in on the VPS |
| Postfix + Rspamd own mail | Kit `Mailer` interface, provider adapter now (Resend when the key arrives, console until then) | Standing decision; SMTP adapter on the VPS later |
| Forgejo registry at `/sdk`, npm/PyPI mirror | `/sdk` is a static route listing tarballs/wheels built in CI and stored on **Cloudflare R2**; npm and PyPI publication is the primary channel | Forgejo moves to the VPS. SDK publish needs owner tokens (MANUAL_STEPS) |
| Paddle or Stripe | **Stripe** behind the kit billing adapter, test mode first | Standing decision |
| Zero third-party APIs, banned-deps CI | Keep the *spirit* for the data path: no AI vendor, no analytics SaaS, no email API in the path of customer accounting data (payload bodies never reach Resend/Vercel Analytics). Mailer provider, Stripe, Vercel, Mongo Atlas, R2 are the owner-approved exceptions. `tools/banned-deps.json` still fails CI for the unapproved list (Sentry, Datadog, Auth0, OpenAI SDKs, ...) | Owner chose the new Vercel account |
| Grafana/Loki/GlitchTip | Structured logs to Vercel + a `/status` page fed from our own probes table; Vercel Web Analytics only on marketing | Move to VPS later |
| Own Windows rig with QuickBooks | **Not available to this session.** QBWC behaviour is covered by a faithful simulator (see risk R1) | Rig is a MANUAL/owner item |

## 1. What runs where

| Concern | Runs on | Notes |
|---|---|---|
| Marketing, docs (MDX), dashboard, connect flow | Vercel (Next.js App Router, RSC + client islands) | One project `wirebook`, host `wirebook.buffersoltech.com` |
| REST `/v1/qbd/*`, `/api/*` | Vercel Node functions (`runtime = 'nodejs'`, `maxDuration` = 300 on Pro; Hobby caps at 60 so sync wait is capped to 55 s there) | Sync wait blocks inside the function while polling Mongo (no change streams on serverless) |
| `/qbwc` SOAP endpoint | Vercel Node function, **stateless**: tickets, sessions and queue live in Mongo | Hand-rolled SOAP 1.1 over `fast-xml-parser`; the WSDL is tiny (8 operations) |
| Cron: reconciler, health monitor, metering, purge, webhook retries | `/api/cron/[job]` guarded by `CRON_SECRET`. Daily jobs on Vercel Cron; **per-minute/5-minute jobs from the kit's Cloudflare Worker cron template** (`infra/cron-worker`) | Hobby has 1 cron/day |
| Live dashboard (SSE) | Route handler streaming, 25 s lifetime then client reconnects (`Last-Event-ID`), reading a Mongo `events` capped collection | Moves to a long lived process on the VPS unchanged |
| Files: SDK artifacts, payload exports, CSV exports | Cloudflare R2 (S3 API) | Own account |
| Vercel Sandbox | **Not needed** for Wirebook. (Optional: running the qbXML fixture suite in CI is plain GitHub Actions.) | |
| Windows + QuickBooks regression | Owner supplied Windows machine + GitHub self hosted runner (later) | Out of scope for the build; simulator covers contract level |

Always-on / VPS-bound behind interfaces: `JobQueue` (Mongo now, Valkey later), `Mailer` (provider now, own MTA later), `Realtime` (Mongo tail over SSE now, Valkey pubsub later), `ObjectStore` (R2 now, MinIO possible), `PackageRegistry` (static R2 now, Forgejo later), `Billing` (Stripe, Paddle possible).

## 2. Repository layout (single Next.js app + internal packages by folder, no cross-repo imports)

```
src/app/(marketing)/          landing, pricing, compare/*, errors/*, changelog, legal
src/app/docs/                 MDX docs + llms.txt, /api-reference from openapi.json
src/app/app/                  dashboard (end users, requests, keys, usage, billing, settings)
src/app/connect/[token]/      hosted end-user flow (light only)
src/app/api/                  auth, stripe webhook, cron, health, sse, internal
src/app/v1/qbd/[object]/      REST objects; /v1/qbd/qbxml passthrough; /v1/end-users
src/app/qbwc/                 SOAP endpoint + /qbwc/wsdl
src/lib/qbxml/                codec generated from Intuit XSD: build/parse, per object schemas
src/lib/queue/                JobQueue interface + mongo impl + simulator tests
src/lib/errors/               catalogue (30 codes) + mapper (statusCode / HRESULT -> error)
src/lib/billing/              kit billing + active file metering
src/config/product.ts         kit constants (name, host, plans, limits, flags)
packages/sdk-ts, packages/sdk-python   generated from openapi.json, hand tuned
tools/simulate-qbwc/          Web Connector simulator used by tests and the dashboard "try it"
```

## 3. Data model (MongoDB, database `wirebook`; ids are prefixed ULIDs: `org_`, `prj_`, `end_`, `req_`, `key_`)

All collections carry `createdAt`; every tenant document carries `projectId` and every query goes through `repo.forProject(projectId)`. TTL fields are `Date` (kit rule).

- `orgs`, `users`, `members(role owner|developer|support)`, `passkeys`, `sessions`: Better Auth adapter collections plus `members.role`.
- `projects {orgId, environment test|production, logPayloads(false in prod), payloadRetentionDays:14}`; one test and one production per org, auto created at sign up.
- `apiKeys {projectId, name, prefix, hash(sha256), createdBy, lastUsedAt, revokedAt}`; key `sk_test_…`/`sk_live_…`, shown once.
- `endUsers {projectId, externalId, companyName, status pending|connected|asleep|broken, lastPollAt, lastSuccessAt, qbEdition, qbVersion, qbxmlVersion, qbwcUsername, qbwcPasswordHash, ownerGuid, fileGuid, companyFileFingerprint, isSampleFile, billingExempt}`; unique `(projectId, externalId)`, unique `ownerGuid`, unique `fileGuid`.
- `connectSessions {tokenHash, endUserId, expiresAt(Date, TTL 7d), stepState{welcome, qwcDownloaded, qwcOpened, firstPoll}}`.
- `qbwcSessions {ticket, endUserId, expiresAt(TTL), cursor, jobsRemaining}`.
- `requests {_id req_ULID, projectId, endUserId, method, path, objectType, operation, state queued|sent|succeeded|failed|outcome_unknown, qbStatusCode, errorCode, durationMs, queuedMs, idempotencyKey, createdAt, completedAt, qbxmlOut?, qbxmlIn?, body?}`; bodies encrypted AES-256-GCM only when `logPayloads`. Indexes: `(projectId, createdAt desc)`, `(endUserId, state)`, `(endUserId, state:queued, createdAt)` for the claim, partial TTL on bodies. Find by id is a `_id` lookup (<1 s at 1M rows).
- `idempotencyKeys {projectId, key, bodyHash, requestId, expiresAt(TTL 7d)}`, unique `(projectId, key)`.
- `usagePeriods {projectId, period, activeFiles[endUserId], quantity}`; `subscriptions` and `stripeEvents` (kit).
- `errorGuides` are static MDX in the repo (catalogue is code), not in the DB.
- `auditLog` (append only), `emailSuppressions`, `rateLimits` (kit), `events` (capped, for SSE), `probes` (status page).
- v1 stubs created now but unused: `webhookEndpoints`, `webhookDeliveries`.

## 4. The Web Connector bridge (the core)

SOAP 1.1 at `POST /qbwc` (HTTPS only; `GET /qbwc?wsdl` returns the WSDL). Stateless; each call loads state from Mongo.

- `authenticate(user, pass)`: look up `endUsers` by `qbwcUsername`, verify `qbwcPasswordHash` (scrypt), lockout after 20 failures/h. Returns `[ticket, ""]` if queued work exists or the connect flow is still waiting for a first poll, `[ticket, "NONE"]` if no work, `[ "", "nvu"]` on bad credentials. Writes `lastPollAt`, flips `pending -> connected` on first success (step 4 of the connect flow).
- `sendRequestXML(ticket, …, qbXMLMajorVers, qbXMLMinorVers)`: unknown ticket ends the session (empty string, never a SOAP fault). Atomically claims the oldest `queued` request for that end user (`findOneAndUpdate` state queued -> sent, with `sentAt`). Per file serial: if one is `sent` and not finished, it is not claimed again. Builds qbXML at `min(16.0, version reported)` from the stored operation. If none, returns "".
- `receiveResponseXML(ticket, response, hresult, message)`: matches the response to the `sent` request, parses the `statusCode`, maps to `succeeded`/`failed`, writes `durationMs`, returns percent: **less than 100 while queued jobs remain**, else 100. HRESULT failure maps through the catalogue.
- `connectionError`, `getLastError`, `closeConnection`, `clientVersion`, `serverVersion`: implemented per the QBWC spec. `connectionError` records the HRESULT (0x80040408, etc.) on the end user and returns `done` so the session ends cleanly.
- Adaptive `RunEveryNSeconds`: the generated `.qwc` ships a conservative `RunEveryNSeconds` (e.g. 60). **Latency risk is covered in R2:** inside a session the server may hold `sendRequestXML` open for up to ~25 s waiting for a new job (long poll) so a warm session answers in seconds.
- Reconciler (cron, 5 min): requests `sent` for over 5 minutes -> `outcome_unknown` and a RefNumber reconciliation query is queued before any retry is allowed.
- Health monitor (cron, 5 min, two check anti flap): `lastPollAt` older than 6 h -> `asleep`; failing HRESULT or lockout -> `broken`; recovery flips to `connected`. Alert emails rate limited 1 per file per 12 h.

## 5. qbXML codec

`src/lib/qbxml/` is generated by a script from the Intuit qbXML 16.0 XSD (the XSD is downloaded by the build script from Intuit's SDK, not redistributed in the repo; the generated TypeScript is). Generator emits for each of the ~40 objects: Zod schemas for request bodies, ordered element builders (order follows the XSD sequence, never string concatenation), and typed parsers. Downgrade: unsupported elements dropped or rejected per version; the response parser tolerates unknown elements. `Mod` requests require `revisionNumber` (EditSequence) and return 409 if stale. Pagination uses `MaxReturned` + `Iterator`/`IteratorID` mapped to an opaque cursor stored in `requests` (expires after 10 minutes -> 410 with `cursorExpiresAt`). Tests: golden fixture per endpoint (request XML and canned response XML) run in CI against the simulator; the sample-company-file acceptance run is executed on the owner's Windows rig later.

## 6. REST surface and acceptance criteria per P0

Auth: `Authorization: Bearer sk_…`, `X-End-User-Id: end_…` (or the external id). Errors use the unified object. Sync wait up to 90 s (55 s on Hobby), else `202` with `Location`; `Prefer: respond-async` returns `202` immediately.

| # | P0 (brief) | Built how | Routes / functions | Acceptance criteria (testable now with the simulator unless marked R) |
|---|---|---|---|---|
| 1 | SOAP bridge + per file serial queue | Section 4 | `POST /qbwc`, `GET /qbwc?wsdl`, `JobQueue` | Simulator authenticates and exchanges a `CustomerQuery`; `GET /v1/qbd/customers` returns JSON in under 5 s with a warm (long poll) session; all 8 operations; percent <100 while jobs remain; unknown ticket ends session with no fault; two jobs for one file never overlap; two files never block each other. **R:** real QBWC 2024 run |
| 2 | qbXML codec from XSD | Section 5 | `src/lib/qbxml` | Golden fixtures pass for every shipped object; element order asserted by schema; `statusCode` 1 = empty OK, 3100 -> `edition_not_supported`, 3140 -> `invalid_reference`; Mod without revisionNumber -> 400 |
| 3 | REST for ~40 objects | One generic handler over a typed object registry (customers, vendors, employees, items by type, accounts, classes, terms, invoices, estimates, sales orders, sales receipts, credit memos, receive payments, bills, bill payments, checks, deposits, journal entries, purchase orders, company info) | `/v1/qbd/{object}` GET list, GET `/{id}`, POST, POST `/{id}` (update) | List/retrieve/create/update pass fixture tests for every object; OpenAPI 3.1 generated from the registry; Bearer key + end user header enforced |
| 4 | Raw qbXML passthrough | Validate well formedness, forward, parse best effort | `POST /v1/qbd/qbxml` | Any valid qbXML returns `{raw, parsed}`; malformed -> 400 with position |
| 5 | Validation, idempotency, pagination, concurrency | Zod -> 400 with JSON path; `idempotencyKeys` | middleware in `src/lib/api` | Invalid field -> 400 + path; replay returns original, different body -> 409; cursor `{data,nextCursor,hasMore,cursorExpiresAt}`, expired -> 410; filters map to qbXML filters; stale revisionNumber -> 409; sync wait and `Prefer: respond-async` |
| 6 | Unified errors + 30 guides | `src/lib/errors/catalogue.ts` (code, type, message, userFacingMessage, guideUrl, retryable) + 30 MDX guides at `/errors/{code}`; lifecycle states | all handlers | Same input -> same message (snapshot test); every catalogue code has a guide page (test enumerates); states queued/sent/succeeded/failed/outcome_unknown observable |
| 7 | Hosted connect flow + .qwc | `/connect/[token]`, `GET /connect/[token]/qwc` | step state machine in `connectSessions` | Each step green only when the server observed it; unique OwnerID/FileID per end user (unique index); link valid 7 days then 410 page; Mac/phone -> "open on the QuickBooks computer" + email link (Mailer); Playwright walk through with simulator; **R:** unaided tester under 10 minutes |
| 8 | Auth + orgs/projects/keys | Kit Better Auth; Test and Production projects at sign up; key hashing | `/api/auth/*`, `/app/keys` | Magic link sent in under 60 s (provider; console stub locally); no card at sign up; key shown once, SHA-256 stored, revoked key fails within 5 s (cache TTL 2 s); passkeys, optional TOTP |
| 9 | Dashboard | `/app/*`, SSE `/api/stream/end-users` | end users list + detail, request log with filters + detail timeline, payload logging toggle, usage meter with projected bill | Statuses Connected/Asleep/Broken/Pending update via SSE within 5 s; request find by id fast; with logging off no body is ever written (test inspects DB); meter shows projected bill = per plan formula |
| 10 | SDKs + docs + registry | openapi-ts and openapi-python-client from `openapi.json`, hand tuned; docs MDX + Pagefind search + `llms.txt` | `/docs`, `/sdk`, `/errors` | TS SDK: async iterators, retries, typed errors, `tsc` strict; Python: sync + async, `mypy --strict` clean; `/sdk` lists built artifacts from R2; quickstart snippet tested in CI against the simulator with registries blocked; docs Lighthouse a11y 95+ |
| 11 | Billing | Kit Stripe adapter; metering from `usagePeriods` (file counts when first successful data request of the month; sample files and fingerprint duplicates excluded); sync quantity to the subscription item | `/api/stripe/webhook`, cron `meter` | Quantity sync passes in Stripe test mode; sample files never billed; same file from two PCs billed once; Starter Pack and annual prices exist with `lookup_key` `wirebook_*` and `metadata.app=wirebook` |
| 12 | Own email + abuse + observability | Kit Mailer, ALTCHA, disposable blocklist, rate limits (10 bad keys -> 429 for 60 s), structured logs, banned-deps CI | kit middleware, `tools/banned-deps.json` | Bounce/suppression handled via provider webhook; rate limit and ALTCHA covered by tests; CI fails on a banned dependency. SPF/DKIM/MTA-STS are DNS items: provider side (MANUAL_STEPS) |

MVP definition of done, end to end test (Playwright + simulator): sign up -> create key -> create end user -> connect via hosted flow -> create an invoice with the TS SDK -> see it in the request log with a tick -> upgrade via Stripe test checkout -> active file count equals billed quantity.

Plans in `product.ts`, exactly per the brief: Developer $0; Production $24.99/file/month; Production annual $19.99/file/month prepaid yearly; Starter Pack 4 files $97.99/mo (then $24.99 per extra file); Starter annual $82.99/mo billed yearly; Volume $16.99 at 50+ files (invoiced, contact); Enterprise custom. Stripe products carry `metadata.app=wirebook`, lookup keys `wirebook_production_monthly`, `wirebook_production_annual`, `wirebook_starter_monthly`, `wirebook_starter_annual`, `wirebook_volume_monthly`.

## 7. Risks

- **R1 (biggest): no real QuickBooks in the build.** Nothing here can run an actual Web Connector against QuickBooks Desktop. Mitigation: a spec faithful simulator (`tools/simulate-qbwc`) that speaks real QBWC SOAP, golden qbXML fixtures from the XSD and Intuit samples, and an owner supplied Windows mini PC with QuickBooks Desktop 2024 Enterprise developer copy for the acceptance run. We will not claim parity or real world success until that run passes; docs say "validated against the simulator" until then.
- **R2: latency on serverless.** QBWC only polls every N seconds, so "under 5 s warm" needs a held open session. A Vercel function can hold a request about 25 s, which fits inside QBWC timeouts, but concurrency and function minutes cost money at scale. Mitigation: long poll only while a request is queued or in the last 2 minutes of activity; move to a persistent process on the VPS if costs bite.
- **R3: Vercel Hobby limits** (60 s functions, 1 cron per day, non commercial). Mitigation: the Cloudflare cron worker; Pro upgrade before charging customers (MANUAL_STEPS).
- **R4: outcome unknown.** A timeout after `sent` risks a duplicate. Mitigation: mandatory idempotency, reconciler by RefNumber, retries blocked until reconciled.
- **R5: Mongo as a queue.** Contention on `findOneAndUpdate` per file is fine at beta scale; the interface lets Valkey replace it. Index and claim tested concurrently in CI.
- **R6: trademark and Intuit licensing.** Nominative use only, no installers redistributed, formal clearance before launch (brief).
- **R7: SDK name availability** (`@buffersol/wirebook`, `buffersol-wirebook`). Check in M1, tokens needed for publishing.
