# Design brief: Wirebook by BufferSol ("Ledger" identity, 12 Nov 2026)

Replaces the "Ledger and Terminal" system in `docs/DESIGN.md` sections 4 to 8. The founder judged the old look as generic AI output. This brief is the gate required by `docs/factory/DESIGN_PLAYBOOK.md` section 1: no UI code was written before it. Light mode only.

## 0. Why the old look read as "AI made"

Seen in our own screenshots (`/` and `/pricing` at 1440 and 375, before this change):

- Warm cream paper (#F7F8F4), a bookish serif display face (Spectral) and near-black ink buttons. That combination is the house style of AI chat products themselves, so the page looked like the tool that wrote it.
- Every section had the same 96px padding, a serif H2 at the top left and a bordered box on the right. Eight blocks in one rhythm.
- The feature area was a bento of six identical rounded boxes, each with a small UI crop on top and a title below.
- The accent was "none" (ink), so nothing on the page told you where to click except shape.
- Sage green neutrals and a perforated margin were subtle to the point of invisible at 1440; at 375 the page was a column of grey boxes.

## 1. Research (screenshots taken 12 Nov 2026 with Playwright, `docs/design/refs-2026-11/*-1440.png` and `*-375.png`)

| Site | Hero claim | Hero visual | Palette / type | Density | Proof | Pricing shape | CTA |
|---|---|---|---|---|---|---|---|
| conductor.is (leader) | "The best QuickBooks Desktop & Enterprise API on the planet" | Code editor in perspective under a green glow | Near-black, teal button, DM Sans, centred | High | Quotes, logo strip | $49 per file | "Get started", "Explore the docs" |
| desktopaccountingapi.com | "Your app. QuickBooks connected." | Faded record chips flowing to a "REST endpoint" box, code tabs | White, navy ink, electric-blue pill buttons, DM Sans | Airy | "As seen on" press logos, phone number in the nav | $49 per active file | "Get started" |
| ledgercrossing.com | "Connect AI to QuickBooks Desktop." | AI chat mock, labelled "Illustration · sample data" | Dark navy, bright blue gradient headline, Inter | Dense | Guarantee, price in the CTA | $299 once | "Buy LedgerCrossing — $299" |
| apideck.com | "Ship accounting integrations in weeks, not quarters." | Bills table card with a pastel gradient shadow | White, purple gradient headline, purple button | Medium | Customer logos | $599+/mo | "Get started for free" |
| rutter.com | "Integrations & AI Agents to ship financial products…" | Floating chat and product cards | Purple gradient wash, monospaced headline | Medium | 75+ integration logos | Custom | "Get a Demo" |
| Adjacent: docs.stripe.com | "Documentation" | Test card + live code runner | White, blurple, dotted texture | High | None needed | n/a | "Get started with Stripe" |
| Adjacent: linear.app | "The product development system for teams and agents" | The real app, full width | Near-black, Inter Display | Medium | Customer logos | n/a | "Sign up" |
| Adjacent: resend.com | "Email for developers" | 3D render | Black, serif display | Low | Logos | n/a | "Get started" |

What they all share (the category cliché to avoid): a blue, teal or purple accent; DM Sans or Inter; pill or 8px rounded buttons; a dark glow or gradient wash behind the hero; a code editor or a chat bubble as the hero picture; logo walls. Two of the five direct competitors lead with AI chat.

The gap nobody owns: nobody shows **where the request goes**. The buyer's real worry is the path from their server to a Windows PC in a contractor's back office and what happens on the way. Nobody uses the visual world of the buyer's own customers (contractors, field service, distributors) either.

## 2. Intake (one batch, assumptions stated)

- Primary action: create a free API key (`/sign-in`). Conversion: an account with a test key.
- Offer: QuickBooks Desktop API, REST plus TypeScript and Python SDKs plus hosted connect flow, $24.99 per active company file per month, free Developer tier with unlimited sample files.
- Objections: (1) a two person vendor at half price, will it last; (2) is it real time (no, it polls); (3) duplicate writes.
- Traffic: search ("quickbooks desktop api", "web connector"), Stack Overflow, Intuit developer forum. Visitors already know the Web Connector hurts.
- Proof assets: none real yet (no customers, no logos, no quotes). Proof is the published price with a dated source, the error catalogue and the product itself. No placeholders on the page; we simply do not show a testimonial section.
- Voice: a senior engineer who has fought the Web Connector. Dry, exact.
- Mobile: second screen. The engineer reads at a desk; the bookkeeper (connect flow) may be on any screen.

## 3. ICP card

Priya, founding engineer at a 5 to 30 person vertical SaaS for contractors, field service or distribution (US or Canada). 15 to 40% of her customers keep their books in QuickBooks Desktop Enterprise on a Windows PC in a site office. She lives in VS Code, Linear and the Stripe dashboard, and judges a vendor by its docs, its request log and its error messages in the first ten minutes. She pays on a card up to about $500 a month. She fears duplicate invoices, opaque 0x8004 errors and a vendor that vanishes. Her customers' world is job sites, dispatch boards, work orders, hi-vis and equipment labels; her own world is logs and status codes.

## 4. Positioning

For vertical SaaS teams whose customers keep books in QuickBooks Desktop, Wirebook by BufferSol is the QuickBooks Desktop API that turns one REST call into a tracked job on your customer's Windows PC, for $24.99 per company file, unlike running your own Web Connector server.

Layout type: **A**, classic hero plus sections, because the buyer evaluates and needs price and proof early. Pricing (A) and compare (D) pages stay separate.

## 5. Concept: "Ledger" (identity v3, 12 Nov 2026)

Seven BufferSol siblings had drifted into one house look. Each now gets its own company identity. Wirebook's is **the accounting ledger**: the book QuickBooks itself replaced, which every bookkeeper and every developer who has touched accounting recognises at a glance. Every request is an entry; the request log is a ledger page; totals are footed with a single rule above and a double rule below. It stays a developer tool: mono IDs, status codes and real JSON sit inside the ledger columns.

What changed from v2 ("Work order"): white surfaces, graphite ink, signal orange, Archivo and IBM Plex are gone. Kept: the real-product hero (the wire, the SDK call, the request log), the section order, every claim and price, the bans, the a11y rules.

Not a sibling's look: Postslot is terracotta on cream with a serif and stamps; Stepclimb is navy on blue-grey with orange; DockCrate is teal on concrete; Hotrail is cobalt on white; Inboxwire is black and lime; Straightpin is grey newsprint and yellow. Wirebook alone is green on mint, slab numerals, ruled columns.

**Signature moves**
1. **Double rules** close every section head, page header, rate card and total (`rule-double`, `footing`, `border-double`).
2. **Column rulings**: a folio column with a slab numeral (`01`) and a double vertical ruling before the entries; every table gets pale green vertical rulings (`.ledger-cols`).
3. **The wire as a double rule**: the request's path from "Your app" to QuickBooks is drawn as a ledger double line with square posting marks (hero, how it works, request detail).
4. **Ruled sheet**: the hero's product sheet carries faint 24px ledger lines (an SVG tile, not a gradient).

## 6. Visual system

### Palette (role tokens in `src/app/globals.css`; components never use raw hex)

| Role | Value | Use | Contrast |
|---|---|---|---|
| `surface` | #F1F7F2 ledger paper | Page | |
| `surface-raised` | #FBFDFB sheet | Panels, tables, cards | |
| `surface-sunken` | #E2EEE5 column band | Alternating bands, table heads, app rail | |
| `surface-inverse` | #123524 forest | The tagline band, code panels | |
| `text` | #123524 forest ink | Body, rules | 12.4:1 on paper, 13.0:1 on sheet, 11.3:1 on band |
| `text-subtle` | #46604F | Secondary | 6.3:1 on paper, 5.8:1 on band, 6.7:1 on sheet |
| `text-inverse-subtle` | #D8EADD | Secondary on forest | 10.7:1 |
| `mint-on-dark` | #A9D4B6 | Code keywords on forest | 8.2:1 |
| `border` | #B9CFC0 | Column rulings, hairlines | decorative only |
| `border-strong` | #6A8475 | Inputs, sheet edges, column double rulings | 3.7:1 on paper (UI 3:1) |
| `action` | #1A5C3C forest green | Primary buttons, links underline, focus, current nav | white text 7.9:1; 7.3:1 on paper |
| `action-hover` | #12462D | | white text 10.8:1 |
| `action-surface` | #D8EADD | Selected rows, featured plan | forest text 10.7:1, action text 6.3:1 |
| `success` / `-surface` | #16683F / #E3F2E7 | Succeeded, Connected | 5.9:1 |
| `warning` / `-surface` | #7A4E00 / #FBF1D6 | Asleep, outcome unknown | 6.4:1 |
| `danger` / `-surface` | #A3242B / #FBE8E7 | Failed, Production tag. Ledger red ink | 6.3:1; white on danger 7.4:1 |
| `highlight` | #F4E7A1 | Text selection | |

Status is never colour alone: glyph plus word, always. Unlit tagline words are #8AA897 on forest (5.2:1).

### Type (all `next/font/google`, see `src/app/fonts.ts`)

- **Display and numerals: Bitter** 500/600/700, a sturdy slab. Headings H1 to H6, the wordmark, and every amount via the `numerals` utility (lining, tabular figures).
- **Text: Libre Franklin** 400/500/600, an American gothic of the bookkeeping era; reads well at 13 to 14px in dense tables.
- **Code and IDs: JetBrains Mono** 400/500 (`figures` utility, tabular, slashed zero). Not preloaded.

Scale unchanged (Tailwind steps only): H1 60/60 desktop, 36/40 mobile; display 72/72 at xl; H2 48/48; H3 36/40; H4 30/36; H5 24/32; H6 20/28; body 16/24 and 14/20; caption 12/16. Headings `balance`, body `pretty`, sentence case, tracking -0.015em on large slab sizes.

### Shape, rules, grid

- Radius: **3px** buttons and inputs (`rounded-md`), **2px** tags (`rounded-xs`/`sm`), **0** on sheets, tables and panels (`rounded-lg` maps to 0). Never one radius everywhere, never pills.
- Depth from rulings and bands, not shadows. One shadow for popovers and dialogs.
- Grid: 12 columns, 1280 container. Section heads: folio in 3 columns, closed by a double vertical ruling; title and intro in 9; a double rule under the head. Hero: a running head over a double rule, claim in 7 columns, a double column ruling, the published prices footed in 5 columns, the product sheet full width below.
- Section rhythm still varies: hero (paper), problem (band, error ledger), tagline (forest), what you get (paper, spec list), how it works (band, the wire), pricing (paper, footed receipt), compare (band, ruled table), fit, questions, final CTA (a double rule, not a box).

### Density, imagery, motion, icons

Unchanged from v2: marketing medium, app dense (36px rows, sticky heads, tabular numerals), connect flow low with 48px targets. Only real product UI as React components with believable data. Motion: the wire draws once (scaleX, 900ms, `cubic-bezier(0.22,1,0.36,1)`), ticks draw, tagline words light on scroll; reduced motion shows everything drawn. Phosphor icons, regular, 16 to 20px.

### App UI

- Shell: the rail is the column band (`surface-sunken`) closed by a double vertical ruling; current item is a forest marker, bold text and `aria-current`.
- Page header: H5 slab title, one line of purpose, one primary action, closed by a double rule.
- Tables and panels: square sheets with a `border-strong` edge, column-band head row over a double rule, pale green column rulings, mono IDs, slab amounts right aligned.
- Forms: label above, 44px inputs, 3px radius, forest focus ring.

### E-mail, OG, icons

E-mails: paper background, sheet card with a double top rule, slab-style wordmark over a double rule, forest button. OG image: paper, forest ink, a double rule under the running head. Favicon and Apple icon: paper "W" on forest, 3px corners. `themeColor` is the paper.

## 7. Bans checked on every page

Centred hero over a glow; purple/indigo; Inter/Geist/system everywhere; three identical icon cards; "everything you need" grids; emoji and stock art; glassmorphism; one radius everywhere; "New" pills; uniform section rhythm; invented stats; "streamline", "seamless", "supercharge". Also the old looks: cream paper plus serif plus ink buttons (v1), white plus graphite plus signal orange (v2). `tests/unit/design-system.test.ts` fails if any old token, hex or face comes back.

## 8. Section plan (home)

1. Hero: running head over a double rule; H1 "QuickBooks Desktop, as a normal API"; sub with REST, SDKs, connect flow and the price; one CTA "Get a free API key"; docs link as text; risk line "No card. Unlimited sample company files."; proof column: the published Conductor and Wirebook prices footed with their difference, plus the dated source. Visual: the ledger entry (the wire) plus the SDK call and the request log.
2. 01 Problem: the four error strings everyone has met.
3. Tagline reveal on graphite.
4. 02 What you get: a spec list (benefit, detail, UI fragment) in two columns of uneven height.
5. 03 How it works: three stages on the wire.
6. 04 Pricing: the receipt with the footed total.
7. 05 Alternatives: dated and sourced table.
8. 06 Fit: who it is for and not.
9. 07 Questions.
10. Final CTA.
