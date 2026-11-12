# Design brief: Wirebook by BufferSol (redesign, 12 Nov 2026)

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

## 5. Concept: "Work order"

Every request is a work order dispatched to a job site: it is written up (your API call), queued, picked up when the Web Connector checks in, and signed off by QuickBooks. The UI borrows from the documents and signage of the buyer's customers, not from fintech or AI tools: a dispatch board, a work order slip with a job number, a hi-vis signal colour for "this needs you", stencil-plain labels. It stays a developer tool: mono figures, status codes and real JSON.

**Signature move: the wire.** A single signal-orange line that runs from "Your app" through "Wirebook" and "Web Connector" to "QuickBooks company file", with the request's timestamps on it. It appears once per page where it carries meaning: the hero (a request travelling the wire), the "how it works" stages and the request detail in the app. Nowhere else.

## 6. Visual system

### Palette (role tokens in `src/app/globals.css`; components never use raw hex)

Cool steel neutrals instead of cream, graphite ink, one hi-vis accent. Orange is used by no competitor in the audit and not by any BufferSol sister product (dark green, teal, navy).

| Role | Value | Use | Contrast |
|---|---|---|---|
| `surface` | #FFFFFF | Page | |
| `surface-raised` | #FFFFFF | Panels | |
| `surface-sunken` | #F1F2F4 | Steel bands, table heads, rail | |
| `surface-inverse` | #17191E | One graphite band per page, code panels | |
| `text` | #17191E graphite | Body | 17.6:1 on white |
| `text-subtle` | #4D5360 | Secondary | 7.7:1 on white, 6.9:1 on sunken |
| `border` | #DCDFE4 | Decorative hairlines | decorative only |
| `border-strong` | #767D89 | Inputs, control edges | 4.2:1 on white |
| `action` | #C0461A signal orange | Primary buttons, the wire, current nav marker | white text 5.1:1 |
| `action-hover` | #9C3712 | | white text 7.0:1 |
| `action-surface` | #FCEEE7 | Selected rows, current nav. Graphite text only (orange on it is 4.48:1) | graphite 15.5:1 |
| `focus` | #C0461A | Focus ring (3:1 rule for UI) | 5.1:1 on white |
| `link` | #17191E with orange underline | Inline links | |
| `success` / `-surface` | #17723A / #E6F4EA | Succeeded, Connected | 5.3:1 on its surface |
| `warning` / `-surface` | #845100 / #FFF4DB | Asleep, outcome unknown | 6.1:1 |
| `danger` / `-surface` | #B4173A / #FCE9ED | Failed, Broken. Crimson, kept apart from the orange accent | 5.8:1 |

Status is never colour alone: glyph plus word, always.

### Type (all `next/font/google`)

- **Display: Archivo**, variable with the width axis, set semi expanded (`wdth` 112) at 600. A grotesk with the plain, wide stance of equipment nameplates and site signage. H1 to H4 and the wordmark only.
- **Text: IBM Plex Sans** 400/500/600. Engineered, legible at 13 to 14px in dense tables, unmistakably not Inter.
- **Figures and code: IBM Plex Mono** 400/500 with tabular figures and slashed zero. Every ID, amount, timestamp and status code.

Scale (Tailwind steps only): H1 60/60 desktop, 36/40 mobile; H2 48/48; H3 36/40; H4 30/36; H5 24/32; H6 20/28; body 16/24 and 14/20; caption 12/16. Headings `text-wrap: balance`, body `pretty`. Sentence case. No italics, no 900.

### Shape and rules

- Radius: **2px** on buttons, inputs, badges; **4px** on panels and tables; 0 on section bands. No pills (status badges are 2px tags with a square glyph). Nested radius rule: inner = outer minus gap, else square.
- Depth from 1px hairlines and steel bands, not shadows. One shadow, for popovers and dialogs.
- Grid: 12 columns, 1280 container. Section headings sit in a left 3 column "label" track with a mono index (`01 Problem`) and content in the right 9 columns, like a spec sheet. The hero breaks the grid: copy in 5 columns, the product bleeds to the right edge.
- Rhythm varies on purpose: hero (tight top, white), problem (steel band, dense table), tagline (graphite band, the only dark block), what you get (white, two column spec list, not cards), how it works (the wire, three stages in a row), pricing teaser (receipt), compare (table), FAQ (two column), final CTA (orange rule, not a box).

### Density, imagery, motion, icons

- Density: marketing medium; app dense (36px rows, 14px text, sticky table heads, tabular numerals); connect flow low (one task per screen, 16px+, 48px targets).
- Imagery: only real product UI built as React components with believable data (contractor and distributor customer names, uneven amounts, real error codes). No illustrations, no photos, no logos we do not have.
- Motion: the wire draws once in the hero (stroke dash, 600ms, `cubic-bezier(0.22,1,0.36,1)`), ticks draw on log rows, the tagline words light up on scroll. Transform and opacity only. `prefers-reduced-motion`: everything appears drawn.
- Icons: Phosphor, regular weight, 16 to 20px, `currentColor`. No icon tiles.

### App UI

- Shell: a steel left rail (sunken surface) with the wordmark, org switcher, grouped nav; the current item is an orange square marker plus bold text and `aria-current`. Top of the content area has a thin page header row: title (H5), one primary action on the right.
- Tables: 4px panel, steel head row, row hover tint, mono figures right aligned.
- Forms: label above, 44px inputs with a 2px radius and a strong border, orange focus ring, hint or inline error below.
- Empty states: a short title, one sentence, one primary action and an example of what will appear (a ghost row with realistic data, labelled "example").
- Loading: skeletons shaped like the table rows. Errors: crimson panel that says what failed and what to do next.

## 7. Bans checked on every page

Centred hero over a glow; purple/indigo; Inter/Geist/system everywhere; three identical icon cards; "everything you need" grids; emoji and stock art; glassmorphism; one radius everywhere; "New" pills; uniform section rhythm; invented stats; "streamline", "seamless", "supercharge". Also the old tell: cream paper plus serif plus ink buttons.

## 8. Section plan (home)

1. Hero: H1 "QuickBooks Desktop, as a normal API"; sub with REST, SDKs, connect flow and the price; one CTA "Get a free API key"; docs link as text; risk line "No card. Unlimited sample company files."; proof line with the dated competitor price. Visual: the wire plus the request log.
2. 01 Problem: the four error strings everyone has met.
3. Tagline reveal on graphite.
4. 02 What you get: a spec list (benefit, detail, UI fragment) in two columns of uneven height.
5. 03 How it works: three stages on the wire.
6. 04 Pricing: the receipt with the footed total.
7. 05 Alternatives: dated and sourced table.
8. 06 Fit: who it is for and not.
9. 07 Questions.
10. Final CTA.
