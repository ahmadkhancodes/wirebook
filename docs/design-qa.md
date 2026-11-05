# Design QA: M1-B storefront (5 Nov 2026)

Screenshots: `docs/qa/` (/, /pricing, /compare/conductor, /docs, /sign-in at 375 and 1440, light and dark). No horizontal overflow at 375 (checked by `scripts/screenshots.ts` and the e2e).

| Category | Score | Worst problem |
|---|---|---|
| 1 Message clarity | 4 | Hero shows the ledger beside the claim; the proof line is small text. |
| 2 ICP fit | 5 | Serif, paper, ink, square radii, ledger hero: differs on four axes from competitors. |
| 3 Hero and product proof | 4 | Log is sample data (labelled); real QuickBooks screenshots wait on a Windows machine. |
| 4 Structure and rhythm | 4 | All 11 plan sections present; tagline reveal present. Bento tiles are mockups, labelled. |
| 5 Typography | 4 | Spectral H1/H2, Public Sans, mono figures; named utilities only. |
| 6 Spacing and radius | 4 | Token spacing, max 6px radius. |
| 7 Color and contrast | 4 | Ink primary, no gradients; dark mode green tinted. Contrast not re-measured in browser. |
| 8 Motion and states | 4 | Tick draw with reduced motion fallback; hover/focus present. |
| 9 Content honesty | 4 | Only brief facts; competitor prices dated; roadmap items labelled "Coming in v1". |
| 10 Responsive and ship | 4 | No overflow at 375; CTA in first screen; OG image uses a Georgia fallback, not Spectral. |

Total 41/50. No category below 3. Hard fails clear.

## Greps (all run on `src`)
- `text-[ p-[ m-[ gap-[ rounded-[ w-[ h-[`: no hits in marketing code.
- Banned fonts (Inter, Roboto, Arial, Helvetica, Open Sans): none.
- `bg-gradient`, `linear-gradient`, `ease-in-out`, `ease-linear`, `transition-all`: none (one `radial-gradient` draws the perforation dots, a dot pattern, not a fill).
- Banned words (supercharge, revolutionize, seamless, effortless, unlock, magical, on the planet): none after rewording.
- `href="#"`: none.
- `postslot|web3forms|submission`: none.
- Hex literals in tsx: only metadata theme colours and the OG/icon images (satori cannot read CSS variables).

## Residual
- Playwright hover/focus captures not taken. Dark mode contrast of the new tiles is judged by eye only.
- Tab "Errors" guides are short stubs; full guides come in M3.
