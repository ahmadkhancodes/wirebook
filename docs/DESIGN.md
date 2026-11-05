# Wirebook by BufferSol: visual system

Status: Phase 0 draft for orchestrator approval. Source of truth for tokens: workbook tabs 19-21 (in docs/brief.md "Design direction"), refined by the competitor audit below. Proof: `docs/design/mock.html` (+ `mock-1440.png`, `mock-375.png`).

## 1. Research (live sites, 5 Nov 2026; screenshots in `docs/design/refs/`)

| Site | Hero claim | Hero visual | Palette / type | Density | Proof | Notes |
|---|---|---|---|---|---|---|
| conductor.is (leader) | "The best QuickBooks Desktop & Enterprise API on the planet" | Code editor crop with autocomplete, then an AI chat mock | Near-black + green glow, teal buttons, DM Sans 58px, centred | High: bullets, stats (1,700+, 256 endpoints), testimonial wall | Logo strip, many mostly unattributed quotes | Bold claims, "unreasonably sexy dashboard". Dark glow hero is the category look. |
| desktopaccountingapi.com | "Your app. QuickBooks connected." | Faded record chips (INV-1042 · $1,250.00) + REST endpoint + 4-language code tabs | White page, navy ink (#081D2D), electric-blue pill buttons (999px), DM Sans 60px | Airy | "As seen on" press logos, phone number | Stripe-like. Phone number in the nav is a trust move worth noting. No prices on the home page. |
| ledgercrossing.com | "Connect AI to QuickBooks Desktop" | Fake AI chat labelled "Illustration · sample data" | Dark oklch navy, Inter 60px, 6px radius | Dense, long single scroll | Forum complaints quoted, fake QBWCLog.txt error log, 30-day guarantee | Fear-based, combative. Honest labelling of sample data is good. |
| apideck.com/pricing | "Plans to fit your scale" | None (pricing page) | White, system font stack, 0px radius buttons | High: 19 FAQ, logo strip, slider, matrix | Logos | Big-platform SaaS. Slider from 25 to 500 consumers. |
| Rutter (pricing, from brief) | Custom quote | n/a | n/a | n/a | Fintech case study | Hides price, so the contrast is useful. |

**Category cliches (avoid):** centred hero over a dark glow; DM Sans or Inter; teal or electric blue accent; pill buttons; logo wall; generic feature-card grid; bold superlatives.
**The gap we own:** nobody looks like what this buyer actually works with: **accounting**. QuickBooks Desktop users and the engineers who serve them live in ledgers, green-bar reports, tabular figures and rubber-stamped ticks. Everybody else dresses a SOAP bridge as a generic dev tool. We dress it as a well-kept set of books.

Adjacent products this ICP trusts (reference for feel, nothing copied): Stripe docs (exactness, code beside prose), Postmark/Fastmail (calm, typographic), Linear changelog (dry precision), printed ledger and green-bar tractor-feed reports.

## 2. ICP card

Priya, founding or senior engineer at a 5-30 person vertical SaaS (construction, field service, distribution) in the US or Canada. 15-40% of her customers keep books in QuickBooks Desktop Enterprise on a Windows PC. She has been asked three times this quarter for "QuickBooks sync". She fears the Web Connector (SOAP, qbXML element order, opaque 0x8004xxxx errors), duplicate invoices, and a vendor that disappears. She reads in a code editor and on a second monitor, judges docs, the SDK and the request log in the first ten minutes, and can put up to about $500 a month on a card. Second reader: Dana, who is migrating off legacy middleware and wants a published price. Third reader, on a different screen: the **connector** (a bookkeeper on the QuickBooks PC), who needs one task per screen and plain words.

## 3. Positioning

For **vertical SaaS and fintech teams whose customers keep books in QuickBooks Desktop**, **Wirebook by BufferSol** is the **QuickBooks Desktop API** that gives you REST, typed TypeScript and Python SDKs and a connect flow your customers finish alone, for **$24.99 per company file** (half the leader's published $49), unlike running your own Web Connector server.

Layout type: **A, classic hero plus sections**, with a dedicated pricing page and comparison pages (type D) for search intent. Justification: the buyer is evaluating, needs the product and the price early.

## 4. Concept: "Ledger and Terminal"

Green-bar ledger paper meets a modern terminal. The request log reads like a printed ledger: banded rows, tabular figures, a perforated left margin, footed totals with a double rule. No retro kitsch: no dot-matrix fonts, no paper textures, no CRT scanlines.

**Signature move (one per page):** the **request log as a ledger**. On the home page the hero shows a live-looking request log with ticks that draw in; on pricing, the total is **footed with a double rule** like an adding-machine tape. The tick (a hand-ruled check mark in redpencil green) is the brand mark for "the server observed this".

Wordmark: "wirebook" in Spectral 600 lowercase on a thin green-bar band, "by BufferSol" in Public Sans small caps beneath. Favicon: two stacked ledger bands with a tick.

## 5. Palette (CSS variables, role names; components never use raw hex)

Raw ramp lives in `@theme`, roles switch on `data-theme` and `prefers-color-scheme`. One accent only (ledger green, saturation under 80%). Semantic red, amber, green for state only. Never colour alone: status always has a glyph and a word.

| Role | Light | Dark ("night terminal") | Use |
|---|---|---|---|
| `bg` (paper) | #F7F8F4 | #0E1411 | Page |
| `surface` | #FFFFFF | #151D18 | Panels, tables |
| `band` | #E8F1E4 | #18241D | Green-bar rows, nav bands |
| `ink` | #14201A | #E4ECE4 | Text |
| `ink-muted` | #4A5A50 | #9DB0A3 | Secondary text (4.5:1 on bg, verified below) |
| `rule` | #C9D3C6 | #2A3A30 | Decorative hairlines, perforation, row dividers |
| `border-strong` | #4A5A50 | #9DB0A3 | Input borders, control edges (3:1) |
| `primary` | #0F5B3A | #4FBF85 | The one accent: buttons, ticks, active nav |
| `primary-hover` | #0B4A2F | #6FD39A | |
| `on-primary` | #FFFFFF | #0E1411 | Text on primary |
| `carbon` | #24489A | #8FB0FF | Links and focus ring |
| `redpencil` / `redpencil-bg` | #B3261E / #FBE9E7 | #FF8A80 / #2A1614 | Errors, failure ticks, annotation circles |
| `warn` / `warn-bg` | #7A5200 / #FFF3D6 | #F2C14E / #2A2210 | Asleep, outcome unknown |
| `success` / `success-bg` | #1F7A45 / #E3F3E8 | #6FD39A / #13261B | Succeeded |
| `highlight` | #FFF1A8 | #3B3A14 | Marker highlight for the changed value in diffs |

Contrast checks (computed with the WCAG formula, 5 Nov 2026): light: ink on paper 15.7:1; ink-muted on paper 6.9:1 and on band 6.3:1; primary on paper 7.6:1; white on primary 8.1:1; carbon on paper 8.0:1; redpencil on redpencil-bg 5.6:1; warn on warn-bg 6.3:1; success on success-bg 4.6:1. Dark: ink on bg 15.5:1; ink-muted 8.1:1; primary 8.1:1 (and bg on primary 8.1:1); carbon 8.7:1; redpencil 8.2:1. `rule` is decorative only (1.4:1 on paper); anything that must be perceivable as a control edge (inputs, focus targets, table outer border of interactive tables) uses `border-strong` = ink-muted (#4A5A50 light, #9DB0A3 dark), which clears 3:1. Re-verified by axe in M5.

Deliberate overrides vs the playbook, recorded per its override rule: dark-mode backgrounds are green-tinted (#0E1411 etc.) instead of the neutral-black whitelist, because the concept needs one family; no gradient fills or gradient text anywhere (the perforation dots are a CSS dot pattern, not a fill); no tints on the accent.
Not used on purpose: QuickBooks green (#2CA01C) and Intuit logos, purple-blue gradients, glow blobs.

## 6. Type

One family does the work; the serif is a deliberate, documented second voice and mono is functional only. All via `next/font/google`, `display: swap`.

- **Display: Spectral** 500/600, H1 and H2 only. It is the "bookkeeper's serif": exact, calm, readable, and nobody in the category uses a serif. No italics, no 900.
- **Body and UI: Public Sans** 400/500/600 (fallback Segoe UI, system-ui). Public Sans is a US-government-grade neutral that stays legible at 13px in dense tables.
- **Mono: JetBrains Mono** 400/500 with `font-feature-settings: "tnum" 1, "zero" 1`. For code, IDs, money and every figure in tables.

Playbook override logged: the playbook's whitelist (Geist, Manrope, Poppins) and its ban on non-whitelisted faces is superseded by the ICP rule (Section 3 of the playbook) and the workbook's written direction. The ban on Inter, Roboto, Arial, Helvetica and Open Sans stands, and the workbook's own ban on Inter/Space Grotesk/Geist stands.

Scale (size/line height; all snap to the playbook's spacing rule, no arbitrary values in components; defined as named utilities):

| Token | Size / LH | Weight | Use |
|---|---|---|---|
| `display-xl` | 56/64 (mobile 36/40) | Spectral 600 | Home H1 only |
| `h1` | 40/48 (mobile 32/40) | Spectral 600 | Page titles |
| `h2` | 28/36 | Spectral 500 | Section titles |
| `h3` | 20/28 | Public Sans 600 | Card and panel titles |
| `body-lg` | 18/28 | 400 | Connect flow, hero sub |
| `body` | 16/26, max 72ch | 400 | Prose |
| `ui` | 14/20 | 500 | Nav, tables, buttons |
| `small` | 13/18 | 400 | Meta, captions (never under 12) |
| `code` | 13.5/22 mono | 400 | Code, log rows |

Headings use `text-wrap: balance`, body `pretty`. Sentence case everywhere. No hyphens in headings or labels (rewrite).

## 7. Shape, spacing, rules

- Radius: none 0, sm 3, md 6. Max 6px. No pills except status badges. Buttons and inputs 3px, panels 6px. Nested radii follow outer minus gap, but never below 0.
- Spacing on a 4px grid, only these steps: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96. Section padding 80-96 desktop, 48-64 mobile. Rows 32px dense (dashboard, log) or 40px comfortable.
- Widths: container 1200, prose 72ch, hero heading max 680.
- **Rules instead of shadows.** Depth is `rule` hairlines and band fills. One shadow only (popover): 0 4px 16px rgb(20 32 26 / 12%). Borders go all the way round or not at all; row dividers are separate 1px elements.
- **Footing:** `border-top: 3px double ink` under totals (pricing total, usage meter, log summary).
- **Perforation:** a left gutter with 1px dotted `rule` and 6px holes every 24px, aria-hidden, only on the request log, code panels and the connect progress rail.
- Breakpoints 640 / 900 / 1200 / 1440.

## 8. Density, layout, iconography, imagery

- **Density:** marketing medium; docs medium (3 columns: nav / content / sticky code panel, with a ledger margin gutter); dashboard dense (13-14px, left rail, tables, detail view 60/40); **connect flow low** (one task per screen, 18px body, light only by default, 24px+ targets, keyboard-complete). Dark mode is first class for docs and dashboard.
- **Test vs Production** is shown as a coloured ledger divider tab (green for Test, red-pencil for Production) with a text label, never colour alone.
- **Icons:** Phosphor Icons (regular weight, 20px, one stroke weight sitewide), imported as SVG components, `currentColor`. The playbook's whitelist (Phosphor/Solar/Iconamoon) replaces the workbook's Tabler to keep one rule for all 7 products; logged in DECISIONS.md. Custom glyphs: tick, footing, perforation. No emoji, no icon-in-circle on every card, no AI sparkle.
- **Imagery:** no stock photos, no illustrations of people. Real product UI built as React components with believable (not round) data, plus **annotated real QuickBooks and Web Connector screenshots with numbered red-pencil circles** in the connect flow and guides (taken from our own Windows test machine; until then, drawn faithfully as HTML mockups and labelled as such). Data viz: small multiples, green sparkline bars, red-pencil ticks for failures. Charts follow the dataviz skill's accessibility rules.
- **Motion:** the playbook's easing `cubic-bezier(0.22,1,0.36,1)`; 120/160/200 ms for UI, tick draw 200 ms, scroll reveals once, 600 ms, 24px rise (transform and opacity only). `prefers-reduced-motion`: opacity only, ticks appear drawn. One orchestrated entrance (log rows tick in, 60ms stagger) and the **mandatory tagline reveal** (words 30% to 100% on scroll). No parallax, no cursor effects.
- **Buttons:** primary (green fill), secondary (1px ink outline), tertiary (text with carbon underline), destructive (redpencil). States: default, hover, pressed (translate 1px), focus (2px carbon ring + 2px offset), disabled, loading (skeleton bar, no spinner).

## 9. Voice

A senior engineer who has fought the Web Connector and won. Plain, exact, dry, short sentences. Quietly witty, never hyped. Say what failed and what to do next. Cite and date every competitor price. Do not use: revolutionary, magical, seamless, effortless, unlock, supercharge, "on the planet", "AI-powered", "real-time" (without the polling caveat), exclamation marks in system messages. Do not lead with price alone; do not name-call the leader. Use "for QuickBooks Desktop" nominatively; footer carries the Intuit trademark notice on every page.

## 10. Do and don't

Do:
- Show the request log, the SDK call and the error with its fix guide as real UI.
- Use tabular mono figures for every number that is money, time or an ID.
- Put the price and the docs link next to the primary CTA.
- Mark every placeholder `{{like_this}}` and list it in the hand-off; sample data labelled "sample data".
- Give every status a glyph and a word; keep Test and Production visibly different.

Don't:
- Centre the whole page, use three equal icon cards, a logo wall, a testimonial wall or invented "1,000+ teams".
- Use purple-blue gradients, glow blobs, glassmorphism, emoji headings, QuickBooks green or Intuit logos.
- Use dot-matrix fonts, paper textures, CRT scanlines.
- Say "Built with AI" (the product runs no model).

## 11. Why this fits the ICP better than the competitors

1. **Recognition.** The buyer's customers live in ledgers; the engineer is selling into accountants. A ledger voice signals "built by people who read the books", where competitors signal "another dev tool".
2. **Trust through exactness.** Serif display plus tabular figures and double-ruled totals read as audited, which a two-person vendor needs. Bold superlatives ("on the planet") are the weakness the brief names.
3. **Differs on four axes from the three closest competitors:** light paper vs dark glow or white-blue; Spectral/Public Sans vs DM Sans/Inter; square 3-6px radii vs pills; request-log-as-hero vs code-editor or record-chip hero. (Playbook requires two.)
4. **Honest by construction.** The hero is the actual product surface (the request log with lifecycle states), the pricing page shows the arithmetic, and sample data is labelled.
5. **Two audiences, one system.** Dense and dark for the developer, calm and large for the bookkeeper, same tokens.

## 12. Scorecard target (DESIGN_PLAYBOOK section 9)

Pass is at least 40/50, no category under 3, no hard fail. Hard-fail greps are wired into CI in M1: arbitrary `text-[` / `p-[` values, banned fonts, `bg-gradient`, `transition-all`, banned words.
