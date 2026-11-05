# Landing page section plan (/)

Layout type A (classic hero plus sections). One offer, one audience, one primary action: **Get a free API key** (Developer tier, no card). Secondary: read the docs (text link). Indexed, with FAQ schema. All copy is drawn from `docs/brief.md`. Nothing invented: no customer counts, logos or testimonials. Placeholders are `{{marked}}` and listed at the end. Sentence case, no hyphens in headings, no banned words (see DESIGN.md section 9).

Nav (4 links): Docs · Pricing · Compare · Sign in, plus the button "Get a free API key". Test/Production is not shown here.

## 1. Hero
- H1 (display-xl, Spectral, two lines): **QuickBooks Desktop,**
  **as a normal API**
- Sub (body-lg, max 680): REST, typed TypeScript and Python SDKs, and a connect flow your customers can finish alone. $24.99 per company file.
- Primary CTA: **Get a free API key**. Under it, risk reversal in small text: No card. Unlimited sample company files.
- Secondary: Read the docs →
- Adjacent proof line: **Conductor lists $49 per company file per month (conductor.is, checked 3 Nov 2026). Wirebook by BufferSol charges $24.99.** Every price is published.
- Hero visual (right on desktop, below on mobile, cropped to one panel at 375): the **request log as a ledger**, a real React component with believable sample data labelled "sample data": rows like `req_01JC... POST /v1/qbd/invoices · Acme Builders · 1,284.50 · succeeded ✓ · 2.1 s`, one `queued`, one `failed` with `3140` and a red pencil note "Invalid reference. Guide: /errors/3140", one `outcome_unknown`. Beneath it the footing row with the double rule: "7 requests · 5 succeeded · 1 failed · 1 outcome unknown". Above the log, a three line SDK snippet (TypeScript) whose response lands as the first row. Ticks draw in on load (60ms stagger).

## 2. Problem (split layout, left prose, right annotated terminal)
- H2: **QuickBooks Desktop has no cloud API**
- Copy: To read one invoice you host a SOAP server for the Windows only Web Connector, speak order sensitive qbXML, decode errors like 0x80040400, and support your customers' Windows machines.
- Right: a short log of real error strings the buyer knows (QBWC1085, 0x80040408, 3140, 3100), each with a red pencil circle and a one line plain meaning. Marked "from our error catalogue".

## 3. Tagline reveal (mandatory, full width, large h2 style, max 680)
Words activate on scroll from 30% to full: **Your app makes a normal API call. Wirebook by BufferSol handles the Web Connector.**

## 4. What you get (asymmetric bento, not three equal cards)
Each tile pairs a bold benefit with a real UI fragment.
1. **One call, one invoice, never two.** Idempotency-Key on every write, replayed for 7 days. A different body with the same key returns 409. Fragment: two identical POSTs, second row marked "replayed".
2. **Errors that say what to do.** Unified error object with type, code, userFacingMessage, guideUrl, retryable, requestId. Thirty guides at launch. Same input, same message, no AI model. Fragment: JSON error with the fix link.
3. **A request log with lifecycle states.** queued, sent, succeeded, failed, outcome_unknown. Timeout after send? We reconcile by RefNumber before you retry. Fragment: detail timeline (queued 0.4 s, sent, QuickBooks status 0, 1.7 s).
4. **A connect flow your customer finishes alone.** Four steps, each turns green only when our server saw it. Link valid 7 days. Fragment: step rail with perforation.
5. **Typed SDKs and a raw escape hatch.** TypeScript (async iterators, retries) and Python (sync and async), generated from OpenAPI 3.1. Any valid qbXML works through passthrough. Fragment: language tabs (TypeScript, Python, cURL).
6. **Test and Production keys, separate.** Keys shown once, stored as SHA-256 hashes, revocable within 5 seconds. Fragment: printed receipt style key panel.

Roadmap items (webhooks, C# SDK, MCP read only mode) appear only as a labelled "Next" line, never as shipped features: *Coming in v1: webhooks, a C# SDK, and a hosted MCP server with read only mode.* (The brief says to test before claiming parity.)

## 5. How it works (three steps, each with a UI fragment, vertical ledger rail)
1. **Create a key and an end user.** Sign up, create sk_test_ key, add your customer, get a connect link valid 7 days.
2. **Your customer connects.** They open the link on the QuickBooks PC, download a .qwc file, choose "Yes, always allow access even if QuickBooks isn't running", paste the password. Status turns Connected.
3. **Call the API.** `POST /v1/qbd/invoices`. Wirebook validates, translates to ordered qbXML, queues it per company file, and returns JSON on the next Web Connector poll. Honest caveat in the same block: *Requests run when QuickBooks next checks in, so this is polling, not real time. If the connector isn't running you get a 202 queued and a guide after 30 seconds.*

## 6. Pricing teaser (ruled table, footed total; links to /pricing)
- H2: **Same job. Half the price. Every price on this page.**
- Ruled table rows (real prices from tab 06): Developer $0 · Production $24.99 per active file per month · Annual $19.99 per file per month · Starter Pack (4 files) $97.99 per month · Volume $16.99 per file at 50+ files · Enterprise custom.
- Footed example (arithmetic shown): 10 files: 10 × $24.99 = **$249.90 per month**; the same 10 files at $49 = $490 (Conductor, checked 3 Nov 2026).
- Note: A file counts only if a data request succeeded that month. Sample files never count.
- CTA: **Get a free API key**. Link: See all plans.

## 7. Compare strip (type D teaser; links to /compare/conductor, /compare/diy, /compare/apideck)
A four row table, every competitor cell dated and sourced: Conductor $49 per file; Desktop Accounting API $49 per active file (30 day trial); Apideck Launch $599 per month for 25 consumers (QuickBooks Desktop in beta); DIY: free code, you own SOAP, sessions, qbXML order and retries. Sentence: *Need one schema across QuickBooks Online, Xero and NetSuite? Use a unified API such as Apideck. We only do QuickBooks Desktop, and we do it for half the price.*

## 8. Who it's for and not for (two column, honest)
For: vertical SaaS (construction, field service, distribution, logistics, property management, nonprofits) and fintech teams syncing to the ledger. Not for: QuickBooks for Mac, UK QuickBooks Desktop, on premise only processing, teams that need SOC 2 Type II or a HIPAA BAA on day 1 (we have a self attested security pack, DPA, payload logging off by default).

## 9. FAQ (accordion, FAQPage schema; answers from the brief)
1. Is half price a sign of half quality? 2. Will a two person vendor be around in three years? 3. Is it real time? (polling caveat) 4. What counts as an active file? 5. How do you stop duplicate writes? 6. What do you log, and who sees it? (payload logging off by default in production; no email API, analytics SaaS or AI vendor in the data path) 7. Do you have SOC 2? (No, not at launch; security pack, DPA) 8. Which QuickBooks versions? (Desktop 2024 fully; 2023 and older best effort; Pro, Premier, Enterprise on Windows) 9. Mac or UK? (No) 10. Can I try it without buying QuickBooks? (Yes, sample company files, unlimited, $0) 11. What does migration cost? (First 2 months at $0 for files moved from another QuickBooks Desktop API or a home grown Web Connector server) 12. Is Intuit involved? (No. Trademark notice.)

## 10. Final CTA (identical to hero)
H2: **Your first request in about 15 minutes.** (the brief's "aha" target; shown as a target, not a promise) · **Get a free API key** · No card. Unlimited sample files.

## 11. Footer
Columns: Product (Docs, Pricing, Compare, Changelog, Status), Resources (Error guides, Quickstart, SDKs), Company (BufferSol Technologies, Contact), Legal (Privacy, Terms, DPA, Security, Sub-processors). "A BufferSol product." Mandatory line: *QuickBooks is a trademark of Intuit Inc. Wirebook by BufferSol is a product of BufferSol Technologies and is not affiliated with or endorsed by Intuit.*

## SEO and metadata
- Title: "Wirebook by BufferSol: QuickBooks Desktop API, $24.99 per file". Description: "REST and typed SDKs for QuickBooks Desktop. A connect flow your customers finish alone, a request log with lifecycle states, every price published."
- OG image generated per page (ledger log crop). JSON-LD: Organization, SoftwareApplication, FAQPage.
- Secondary pages for search intent (M1 stubs, filled in M3-M5): /pricing, /compare/conductor, /compare/diy, /compare/apideck, /errors/{QBWC1085,0x80040408,3140,3100}, /docs, "Web Connector explained", "qbXML element order".

## Placeholders to resolve before launch (no invented facts)
- `{{testimonials}}` and `{{customer_logos}}`: none yet; the page has no proof wall by design. Proof is the product plus dated competitor prices. Design partners (free for 6 months) may supply quotes later.
- `{{founder_name_and_photo}}`: optional "who builds this" strip on /company.
- `{{support_email}}`, `{{status_page_url}}`: set at M1 with the mail stub and /status.
- `{{uptime_claim}}`: not shown (no SLA until Enterprise).
- Real annotated QuickBooks screenshots need a Windows machine with QuickBooks; until then connect-flow screens are labelled mockups.
