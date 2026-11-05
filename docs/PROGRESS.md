# Progress: Wirebook by BufferSol

## State (5 Nov 2026)
- **Phase 0 done:** competitor refs (docs/design/refs/), DESIGN.md, SECTION_PLAN.md, ARCHITECTURE.md, ROADMAP.md, MANUAL_STEPS.md, DECISIONS.md, design mock + screenshots (docs/design/mock.html, mock-1440.png, mock-375.png, mock-1440-dark.png).
- **5 Nov 2026 M1-A done:** kit-v1 adopted: product.ts renamed (Wirebook, plans free/production/starter_pack/volume, meter `files`), qbxml + qbwc modules merged (`src/lib/*`, `tools/simulate-qbwc`, `tests/*.test.ts`, `fast-xml-parser` in root package.json), design tokens + Spectral/Public Sans/JetBrains Mono wired, lint/typecheck/test (70)/build green, `*.product.json` removed. **Next: M1-B, landing and pricing** (marketing pages, compare, docs content and demo components still carry kit sample copy).
- (Older note) No app code yet. Env: no MONGODB_URI (use DB_DRIVER=memory), Stripe/Resend/Cloudflare keys absent (stubs). Vercel: use VERCEL_TOKEN_NEW_ACCOUNT via CLI/REST only (team ahmad-code); the Vercel MCP connector is the OLD account.
- **Pure modules done (branch m0-bridge-core):** qbXML builder/parser + specs (customer, invoice), status code mapping, 8 operation SOAP bridge (`src/lib/qbwc`), memory queue/stores, `.qwc` generator, spec-faithful simulator (`tools/simulate-qbwc`). 25 tests pass, `tsc` clean. Minimal package.json/tsconfig are placeholders; kit-v1 copy will replace them.
- Design approved by orchestrator with one change (primary now ink, PR #2).
- Next: wait for orchestrator design approval and "kit-v1 ready", then copy the kit and build M1 (see docs/ROADMAP.md).
- Biggest risk: no real QuickBooks/Web Connector available in the build; covered by a simulator, real acceptance run needs the owner's Windows machine (ARCHITECTURE R1).
