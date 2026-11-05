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
