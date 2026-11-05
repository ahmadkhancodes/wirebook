# Progress: Wirebook by BufferSol

## State (5 Nov 2026)
- **Phase 0 done:** competitor refs (docs/design/refs/), DESIGN.md, SECTION_PLAN.md, ARCHITECTURE.md, ROADMAP.md, MANUAL_STEPS.md, DECISIONS.md, design mock + screenshots (docs/design/mock.html, mock-1440.png, mock-375.png, mock-1440-dark.png).
- No app code yet. Env: no MONGODB_URI (use DB_DRIVER=memory), Stripe/Resend/Cloudflare keys absent (stubs). Vercel: use VERCEL_TOKEN_NEW_ACCOUNT via CLI/REST only (team ahmad-code); the Vercel MCP connector is the OLD account.
- Next: wait for orchestrator design approval and "kit-v1 ready", then copy the kit and build M1 (see docs/ROADMAP.md).
- Biggest risk: no real QuickBooks/Web Connector available in the build; covered by a simulator, real acceptance run needs the owner's Windows machine (ARCHITECTURE R1).
