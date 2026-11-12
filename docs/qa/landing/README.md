# Landing page compliance pass (12 Nov 2026)

Before/after at 375 and 1440 (`before-*.png`, `after-*.png`), mobile menu open at 390 (`after-menu-390.png`).

## Uniqueness proof

| | Wirebook "Ledger" |
|---|---|
| Palette | paper `#F1F7F2`, sheet `#FBFDFB`, column band `#E2EEE5`, ruling `#B9CFC0`, control edge `#6A8475`, subtle ink `#46604F`, forest ink `#123524`, forest action `#1A5C3C` (hover `#12462D`), ledger red `#A3242B` |
| Fonts | Bitter 600 (display, slab numerals) / Libre Franklin 400 to 600 (body) / JetBrains Mono 400 (IDs, code) |
| Radius feel | square: sheets and tables 0, controls 3px, tags 2px |
| Layout type | A, classic hero plus sections: an engineer understands the product from the hero's real request log and SDK call; FAQ and a dated compare strip carry the objections |
| Hero composition | ledger page: running head closed by a double rule, the claim left, a double column ruling, the footed price column right (Conductor $49.00, Wirebook $24.99, difference), the ruled product sheet (wire, SDK, request log) underneath |
| Signature element | double rules and column rulings as structure, slab tabular figures footed like a ledger |

Different from the other six: the only mint paper and forest ink palette with square sheets and slab numerals. Postslot is warm paper with a stamp, DockCrate steel stencil, Hotrail navy rail, Stepclimb blueprint, Inboxwire white API docs, Straightpin newsprint.

## Lighthouse mobile (local `next start`, lighthouse 12)

| Page | Before | After |
|---|---|---|
| `/` | 91 | 94 to 98 over five runs, median 96 |
| `/pricing` | 72 (TBT 1,250 ms) | 96 to 98 |
