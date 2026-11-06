# Manual steps for Wirebook (owner only, deep link first)

None of these block the build; each one has a stub until done. Listed in the order they will be needed.

## 1. Stripe test secret key (M1)
https://dashboard.stripe.com/test/apikeys
- Reveal the test secret key and store it as the env var `STRIPE_SECRET_KEY_TEST` in the cloud environment.
- Done when: `stripe-setup` creates the `wirebook_*` products. (Until then I use the Stripe connector in test mode.)

## 2. Email provider key (M1)
https://resend.com/api-keys
- Create a key with "Sending access" for the domain buffersoltech.com and store it as `RESEND_API_KEY`.
- Done when: magic link mail arrives in Gmail. (Until then: console mailer; the sign in link prints in logs.)

## 3. Cloudflare token for DNS, R2 and the cron worker (M1/M4)
https://dash.cloudflare.com/profile/api-tokens
- Create a token with Zone:DNS:Edit on buffersoltech.com and Account:R2:Edit, store it as `CLOUDFLARE_SAAS_TOKEN`, plus the account id as `CLOUDFLARE_SAAS_ACCOUNT_ID`.
- Done when: `wirebook.buffersoltech.com` resolves to Vercel and the SDK bucket exists.

## 4. Vercel Pro (before taking real money)
https://vercel.com/account/billing
- Upgrade the team `ahmad-code` to Pro (Hobby is non commercial, 60 s functions, 1 cron/day).
- Done when: sync waits of 90 s work. (Not needed for the test mode build.)

## 5. npm and PyPI tokens (M4/M5)
https://www.npmjs.com/settings/~/tokens and https://pypi.org/manage/account/token/
- npm: granular token with publish for the `@buffersol` scope; store as `NPM_TOKEN`. PyPI: token for project `buffersol-wirebook`; store as `PYPI_TOKEN`.
- Done when: `npm view @buffersol/wirebook` and `pip index versions buffersol-wirebook` resolve.

## 6. Windows machine with QuickBooks Desktop 2024 Enterprise (acceptance run, M5)
https://developer.intuit.com/app/developer/qbdesktop/docs/get-started
- A Windows mini PC (about $600) with the developer or NFR copy of QuickBooks Desktop and the Web Connector. We cannot test against real QuickBooks without it; until then claims say "validated against the simulator".
- Done when: the owner gives the session SSH or GitHub runner access, or runs the acceptance script I provide and sends the log.

## 7. Trademark clearance (before launch)
https://tmsearch.uspto.gov/
- Formal clearance for "Wirebook" (brief recommends USPTO/UKIPO/CIPO). Fallback names: DeskRelay, BookRelay.

## Legal placeholders to resolve before launch (M1-B)
- `{{jurisdiction}}` and `{{registered address}}` (from `product.legal` in `src/config/product.ts`) appear highlighted on the legal pages. Also `{{refund policy}}` and `{{cap}}` in terms. The owner supplies the governing jurisdiction, the registered address, the refund wording and the liability cap.
- Retention periods in privacy/DPA (30 and 35 days) were carried over from the kit. Confirm they match what M2 stores.

## Before the bridge runs on Mongo (M2)
- Once `MONGODB_URI` exists (Atlas project "BufferSol SaaS", database `wirebook`, user `wirebook-app`), run `npm run db:indexes` once. It creates the bridge indexes, including the unique partial index `one_sent_per_file` on `requests` that keeps one job in flight per company file, and the unique OwnerID, FileID and username indexes on `endUsers`. The Mongo bridge driver (`src/lib/bridge/mongo.ts`) has not been run against a real cluster in this build; only the memory driver is covered by tests.
- Set `SYNC_WAIT_MS=90000` on Vercel Pro (default 55 s fits Hobby). Raise `maxDuration` in the `/v1/qbd` routes at the same time.
- Retention check for legal: raw passthrough jobs keep the qbXML response on the request record so it can be returned to the caller; a purge of that body is M3 work. Dashboard request rows keep no other body.
- Existing API keys have no `metadata.environment` and are treated as test keys. Create production keys under Settings, API keys.

## M4 follow-ups (owner, before launch)
- **Redeploy the Cloudflare cron worker** (`cd infra/cron-worker && npx wrangler deploy`). `webhook-retries` and `health-tick` are already in `JOBS`; without the worker, `vercel.json` retries failed webhooks once a day (Hobby allows 2 daily crons, both used by `webhook-retries` and `purge`). On Vercel Pro the schedule of `webhook-retries` in `vercel.json` can be changed to `*/5 * * * *`.
- **CI workflow:** no change needed for M4. If CI should run the new SDK model check, it already runs under `npm test` (`tests/sdk-models.test.ts`). To run the Python SDK tests in CI add a step `cd packages/sdk-py && python3 -m unittest discover -s tests` to `.github/workflows/ci.yml` (not touched here).
- **Run `npm run db:indexes`** again once MongoDB exists: nothing new is required, but the `org_settings` documents now also hold `suspended` and `suspendedKeys`.
- **Review the privacy text** (`src/content/legal/privacy.ts`, DPA, security page): it now says payloads are kept for 14 days at most and request metadata 90 days, which is what the code does. Confirm with counsel.
- **Pricing copy:** the plan highlights now state a daily API cap (Developer 5,000, Production and Starter Pack 250,000, Volume 1,000,000). Change the numbers in `product.abuse.dailyRequests` if you want different caps.
