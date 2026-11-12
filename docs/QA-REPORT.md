# QA report: battle test as the ICP (12 Nov 2026)

Method: the production build (`next start`, `DB_DRIVER=memory`, `E2E_OUTBOX=1`, console mail) driven by Playwright through the real UI, the way a founder or integrations engineer at a 10 to 80 person vertical SaaS would use it. Sign-in goes through the real form (ALTCHA solved in the browser), the e-mailed link and onboarding. Specs are in `tests/e2e/qa/`. Not deployed.

## Journeys covered
- `walk.spec.ts`: every public page, signed out, 375/1440: status, no horizontal scroll, every internal link resolves, no console error, failed request or 5xx.
- `walk.spec.ts`: every `/app/**` page redirects to sign-in when signed out; signed in, every app page at 375/1440 has no overflow, no unlabelled control, pointer cursor on clickables, and 44px touch targets at 375px.
- `journeys.spec.ts`: sign-in form validation, inbox state, sign out; magic link single use and garbage token; open-redirect through `?next`; onboarding with short, HTML and unicode organization names.
- `journeys.spec.ts`: API keys (blank, whitespace, HTML, duplicate names, secret shown once and works against `/v1`, Escape closes the delete dialog); profile (empty, unicode, reload); retention (0, text, valid); members (bad e-mail, duplicate invite, cancel); webhooks (bad, private and metadata URLs, add, pause, delete); billing (interval toggle, checkout without Stripe, pricing hand-off); keyboard skip link and theme toggle; mobile menu.
- `journeys.spec.ts`: a second organization cannot read or delete another organization's end user, admin routes, or `/v1` without a key.
- `api.spec.ts`: REST API with no key, bad key, wrong scheme, unknown object/id, broken/empty/array/huge JSON, hostile and blank connect-link input, bogus connect token, SOAP garbage; docs links and copy button; pricing numbers match code.
- `dashboard.spec.ts`: request log filters, clear, hostile query strings, no-match state; org switcher (Escape, create second org, switch); security/audit/export/2FA/invite pages; delete account; authenticator setup; passkey add and passkey sign-in with a virtual authenticator.
- `marketing.spec.ts`: mobile menu, pricing interval switch, plan hand-off through sign-in and onboarding to billing, FAQ, every landing link, keyboard focus ring.
- Existing `flow`, `m2`, `m3`, `m4`, `m6` specs still cover the Web Connector connect flow (simulator), live end-user status, request detail and the 3 file Developer cap is covered in unit tests (`m3`, `m5-review`).

## Defects found and fixed
| # | What the user would have seen | Fix | Regression test |
|---|---|---|---|
| 1 | **Authenticator app setup was impossible.** Every account is passwordless, and Better Auth's two-factor enable/disable demanded a password: "Set up authenticator app" showed `[body.password] Invalid input: expected string, received undefined`. | `allowPasswordless: true` in `src/lib/auth/index.ts`. | `dashboard.spec.ts` (authenticator) |
| 2 | `POST /v1/connect-links` accepted a blank or whitespace `externalId` (201) and padded or control-character ids, creating an end user nobody could address again. | `parseInput` in `src/lib/connect/index.ts` trims, rejects blank and control characters, with a clear message. | `tests/unit/qa-connect-input.test.ts`, `api.spec.ts` |
| 3 | An invalid or expired invitation page was a dead end: no heading, no way out. | Heading and "Go to your dashboard" link in `accept-invite.tsx`. | `dashboard.spec.ts` |
| 4 | "Sign out other sessions" was disabled with no reason. | Hint text plus `aria-describedby` in `security-client.tsx`. | `dashboard.spec.ts` |
| 5 | Copy contradicted the real limits: the usage banner said "Request volume is not capped" while the Developer plan has a 5,000 calls a day cap. | Banner copy corrected in `usage-banner.tsx`. | `walk.spec.ts`/review |
| 6 | At 375px the app logo link (28px), billing Monthly/Yearly toggle (32px) and the test/production switch (16px) were below the 44px tap target. | `min-h-11` on mobile in `app-shell.tsx`, `billing-client.tsx`, `end-users-client.tsx`. | `walk.spec.ts` (44px check) |
| 7 | A thrown WebAuthn error (unsupported browser) would leave the passkey buttons spinning forever. | try/catch in `security-client.tsx` and `sign-in-form.tsx`. | passkey journey in `dashboard.spec.ts` |

No CSP-class failure was found: every form and fetch in the app is same-origin or a navigation to Stripe, and the walks record no CSP console violation.

Also fixed: three existing specs had gone stale against shipped copy and failed on main before this work (`flow.spec.ts` looked for "Sample request log"/"sample data", the landing now says "Example request log"/"example"; `m2` and `m4` looked for a link named "Open request" but the accessible name is "..., open request req_..."). Assertions were updated to the current wording, not loosened.

## Open items
- **Low:** React hydration error #418 appears on roughly 1 in 50 loads of `/sign-in` in the production build. It never reproduced in `next dev` or in 100 isolated loads, so the cause is not found. The public walk tolerates it (`ignoreHydration`); all other specs assert none.
- **Low:** methods a route does not implement (for example `GET /v1/end-users/{id}`) answer Next's empty 405 instead of the JSON error object.
- **Low (design call):** a person invited to an organization who has no account is sent through "Name your organization" before they can accept, so they end up with an extra empty organization. Needs a decision on skipping onboarding when the next step is an invitation.
- **Low:** the sign-in form says "Too many attempts from here" for the per-address limit as well as the per-IP one.
- **Info:** `/status` and `/sdk` are listed in the brief but not built (nothing links to them).
- **Info:** a 3 real file Developer plan limit journey through the UI was not added; the gate is covered by unit tests and the Web Connector simulator.
- Not testable locally: Stripe checkout return, real QuickBooks, e-mail deliverability.

## Handy and hardened pass (12 Nov 2026)
Added: `tests/unit/handy-hardening.test.ts` (CSV escaping, CSP pins, bundle secret scan) and a Playwright journey in `dashboard.spec.ts` (checklist, `/` shortcut, CSV export needs a session and answers `text/csv`). lint, typecheck, 301 unit tests and build green. **The Playwright suite could not be run in this environment: no Chromium is installed and there is no network to download it** (every browser test fails at launch, with or without these changes). Run `npx playwright install chromium && npx playwright test` before merging; the new journey is untested in a browser.

## Post-redesign regression pass (12 Nov 2026)
After the dark-mode removal, the Ledger redesign and the hardening round. Specs in `tests/e2e/qa2/`, run against `next start` with the memory DB and outbox mail; unit guards in `tests/unit/qa2-regression.test.ts`. Not deployed.

**Journeys covered**
- `audit.spec.ts`: every page in the sitemap (all docs, all 27 error pages, legal, compare) plus the 404, unknown docs/error slugs, a bogus connect token and sign-in, then every signed-in screen (including unknown request/end-user ids and onboarding), each at 375 and 1440. Per page it checks: horizontal scroll, a dark class on `<html>`, any colour (text, background, border) outside the Ledger tokens, old fonts, clipped text, text under 10px, WCAG contrast (4.5, or 3 for large text) against the nearest opaque background, pointer cursor on enabled controls, unlabelled controls, images without alt, disabled buttons without a reason, console errors/warnings, failed requests, 5xx.
- `journeys.spec.ts`: new visitor at both widths (every header, hero, pricing and footer link resolves, external links https only, hero CTA); sign-in redirect keeps `?next`, a signed-in visitor on `/sign-in` is sent into the app, sign-out ends the session; checkout return (canceled, success, unknown session); a user at the Developer limit (three real company files connected through the Web Connector simulator, the 4th connect link is refused with 402 `file_limit_reached`, billing and banner state).
- `interact.spec.ts`: on every signed-in page every internal link resolves and every enabled, non-destructive button changes the page, fires a request or downloads (a dead button fails the test), with no console error or CSP violation; Escape closes the API key dialog; the shell's tab stops all show a focus indicator; OG, Twitter image and icons return PNGs.

**Defects found and fixed**
| # | What the user saw | Fix | Regression test |
|---|---|---|---|
| 1 | Returning from Stripe with `?checkout=canceled` showed the billing page with no word on what happened. | "Checkout was canceled. Nothing was charged." notice (`billing/page.tsx`, `billing-client.tsx`). | `journeys.spec.ts` (checkout return), `qa2-regression.test.ts` |
| 2 | A user with exactly 3 of 3 real files was told "You are over your limit"; they are at it, not over it, and the 4th file is what is refused. | Banner says "You have reached your limit" at the limit and "over" only above it (`usage-banner.tsx`). | `journeys.spec.ts` (plan limit), `qa2-regression.test.ts` |

Checked and found clean: no off-palette colour, old font or dark class on any public or signed-in page; contrast passes everywhere; e-mails use only design tokens and no dark-mode query (unit test); OG, Twitter, favicon and Apple icons render; no dead link or dead button; no CSP violation; no hydration warning in this run; Escape and focus order behave.

**Open**
- **Low:** the End users page opens on the Test tab. A user whose files are all production sees "No test company files yet" until they press Production (the empty state names the environment, so it is not misleading).
- **Low:** save buttons on Profile and Data retention are disabled until the form changes, with no hint text (the label already says what they do).
- **Info:** the "by BufferSol" mark in the wordmark is 10px; legible but the smallest text on the site.
- Still open from the earlier pass: sign-in hydration #418 (rare), empty 405 bodies on `/v1`, invitee onboarding detour, `/status` and `/sdk` not built. Lighthouse and Stripe checkout return with a real session were not run here.

## Usefulness pass: first ten minutes, working docs, billing path (12 Nov 2026)
Production build (`next start`, memory DB, outbox mail, Web Connector simulator as the QuickBooks PC), driven by Playwright. Not deployed.

### Personas and their week (`tests/e2e/personas.spec.ts`)
- **Priya, founding engineer at a 20 person field-service SaaS** (TypeScript, 25% of customers on QuickBooks Desktop Enterprise, a deal blocked on it). Day 1: sign up, create a test key, connect a sample file, list its customers. Day 7: wants to see her calls in the log.
- **Marcus, integrations PM at a spend platform.** Day 2: invites the engineer who will own the integration; that engineer has no account yet.
- **Dana, engineering lead moving off legacy middleware.** Connects three real customer files in production in her first week; on day 7 the fourth is refused and she has to decide whether to pay.

**Friction found on the walk (before this pass)**
| # | Persona, moment | What happened | Impact |
|---|---|---|---|
| 1 | Priya, day 1 | Checklist step "Add company file" opened End users, which had no way to add one ("Create one with POST /v1/connect-links"). First value needed a key, a terminal and the API reference. | Dead end at step 2 of 3 |
| 2 | Priya, day 1 | The checklist said "List customers with the quickstart snippet"; the quickstart only had `GET /api/v1/me` and never showed a list call or `X-End-User-Id`. | Dead end at step 3 |
| 3 | Priya, day 1 | Docs, OpenAPI and landing promise `sk_test_`/`sk_live_` keys; the product issued `wire_...` for both, and the key list did not say which environment a key is for. | Confusion, wrong-key incidents |
| 4 | Priya, day 1 | After creating a key, nothing to paste: no command, no next step. The checklist never ticked "Create a test API key". | Extra steps, no sense of progress |
| 5 | Priya, docs | `curl https://.../v1/qbd/customers?limit=25` unquoted fails in zsh (macOS default) with "no matches found"; `-d @invoice.json` referred to a file nobody has; resource examples referenced ListID `80000001-1`, which no sample file contains (QuickBooks 3140); the SDK page used an undefined `body` and a `"<txnId>"` placeholder. | Copied commands failed |
| 6 | Marcus, day 2 | The invited engineer was sent through "Name your organization" and ended up with a stray empty organization before reaching the invitation. | Confusion, extra org |
| 7 | Dana, day 7 | End users opened on the empty Test tab although all her files are production (earlier open item). | Looks like her files are gone |

**Fixed (top five by impact, plus two small ones)**
1. **Add company file in the dashboard** (`/app/end-users`, form at `#add`): your id for the customer and an optional company name make a connect link through `POST /api/end-users` (same code, validation and plan gate as the API). The result shows the link with Copy and Open, its expiry, and the list-customers command for that customer. A refused 4th file shows the plain message with **Choose a plan** (to billing) and **What this means** (the fix guide).
2. **The quickstart is the real path:** create key, check it, create a connect link, connect the file, list its customers, see it in the log. Every command reads `$WIREBOOK_API_KEY` and is shared with the dashboard (`src/lib/snippets.ts`).
3. **Keys say their environment** (`sk_test_`/`sk_live_`, set server side) and the key list has an Environment column.
4. **"Try it now" after creating a key:** the export line with the real key plus the check call, and the connect-link call, each with a Copy button. The checklist ticks the key step from server state.
5. **Docs commands fixed** as above and executed by a test (below).
6. Invitees skip onboarding and land on the invitation.
7. End users opens on Production when that is where the files are.

**Click budget:** Priya goes from the empty dashboard to a connect link and a ready list-customers command in **at most 6 clicks** (measured 5: Create key, Create key, Requests, Add company file, Create connect link). The test fails above 6.

### Docs must work (`tests/e2e/docs-run.spec.ts`)
Every code block on every `/docs` page is read from the rendered page (what a reader copies) and run against the app: bash blocks with real `curl` in bash, TypeScript with `tsx` against the SDK source, Python with `python3` against the SDK source, JSON compared with real answers (pagination keys, the 3140 error object), webhook verify snippets checked against the product's own signer (valid accepted, tampered refused). QuickBooks is the Web Connector simulator holding what a sample file holds. Substitutions are only the ones a reader makes: the production origin, the key, and the id of the record the sample just created. A final test fails if any non-table block on any docs page is not covered. **One block is not run:** the registry install (`npm install @wirebook/sdk`, `pip install wirebook`), because the packages are not published and this runner has no network; the test asserts the page says "not published to npm or PyPI yet".

### Billing path (`tests/unit/billing-journey.test.ts`)
With the Stripe fake (no card entry possible here): for every paid plan and interval the Checkout Session uses the `wirebook_` lookup key's price, carries `metadata.app=wirebook` (session, subscription and customer) and returns to `/app/billing?checkout=success&session_id=...` or `?checkout=canceled`; a Developer org at 3 of 3 real files is refused a 4th, `checkout.session.completed` lifts the limit, the portal opens for that customer, `customer.subscription.deleted` puts the 3 file limit back (files already active that month keep working). Through the UI, Dana's 4th file leads to billing, "You have reached your limit" and Choose Production (which, without Stripe keys here, shows "Billing is not connected yet").

**Gates:** lint (0 errors; the 2 warnings predate this pass), typecheck, 349 unit tests, build, and the full Playwright suite (75 passed, 8 on-demand screenshot specs skipped) green.

### Left open
- The registry install commands cannot run until the SDKs are published (owner step).
- Stripe test-mode Checkout with a real session, the portal and a real webhook were not run (no Stripe key or network here).
- Keys created before this pass keep their `wire_` prefix; nothing to migrate before launch.
- Still open from earlier passes: sign-in hydration #418 (rare), empty 405 bodies on `/v1`, `/status` and `/sdk` not built.
