# Resolution Standard — v1 plan (working name)

Owner: Younes (public face, English). Decisions 2026-10-24: open source + public deploy after tests; analysis runs 100% in the browser, with an optional anonymous aggregate contribution and cookieless visit analytics; build with Sonnet, Opus for the engine logic and correctness review; no domain purchase without Younes's explicit OK.

## 1. The problem
AI customer-support agents (Intercom Fin, Zendesk AI agents, Gorgias AI Agent, Salesforce Agentforce, …) are increasingly billed **per resolution**. The vendor defines and counts the resolution it bills for (e.g. "customer went silent for 24h", "no handoff for 72h"). A customer who gives up and calls, or comes back two days later with the same problem, is often still billed as "resolved". Buyers have no neutral way to check. (Exact vendor terms: `docs/research/vendor-facts.md`.)

## 2. Who and when
- **Primary user:** Head of Support / CX Ops / Support Ops at a SaaS or e-commerce company that pays an AI agent per resolution.
- **Trigger moments:** the monthly invoice; renewal or price negotiation; a CFO or board asking "is the AI actually working?"; a vendor QBR quoting a resolution rate.
- **Secondary:** teams evaluating AI agents before buying (they read the definitions index and calculator); analysts/press writing about AI agent ROI.

## 3. The promise (one line)
"Drop your export. See how many of your AI agent's billed resolutions were real. Nothing leaves your browser."

## 4. What v1 ships
1. **The Auditor** (home page): drop a CSV/JSON export (Intercom, Zendesk, Gorgias presets + a generic column mapper) or try sample data → results in seconds:
   - billed resolutions vs strict resolutions, both as counts and rates;
   - **phantom resolutions** (billed but failing the strict test) and **$ at risk** at the user's price per resolution;
   - breakdown by failure reason (human handoff, reopened, repeat contact by the same customer within N days, negative CSAT, unverifiable);
   - weekly trend; sensitivity table for N = 1/3/7/14/30 days; a "pending window" bucket for conversations too recent to verify;
   - a filterable table of flagged conversations with evidence ("same customer wrote again 2.3 days later in conversation #…");
   - **Dispute pack**: CSV of flagged conversations with reasons + a plain-text summary and an email template to request a credit review from the vendor;
   - **Share card**: a PNG with only the rates (no data) for social posts.
2. **The Strict Resolution Standard v0.1** (`/standard`): open, versioned definition, parameters and defaults, edge cases, rationale, changelog, how to cite; text under CC BY 4.0, code under MIT.
3. **Definitions index** (`/definitions`) + **per-vendor pages** (`/vendors/[slug]`): how each vendor defines and bills a resolution, how to export, how to audit — sourced and dated, generated from `content/vendors.json`.
4. **Calculator** (`/calculator`): what phantom resolutions cost at your volume and price, with no data upload and no invented benchmarks (the user enters their own assumptions).
5. **Community benchmark** (`/benchmark`): opt-in anonymous aggregates; nothing is shown for a vendor until n ≥ 30.
6. **Privacy** (`/privacy`): exactly what runs where, what the optional contribution sends, how to verify in DevTools, link to source.

## 5. Principles
- **Trust is the product.** Every number traceable to rows the user can inspect; the definition is public and versioned; the code is open; no upload.
- **Honest uncertainty.** Repeat contact can be a different issue → it is labelled "likely phantom" with evidence, the window is adjustable, and a same-topic filter (local text similarity) is optional. Conversations too recent to verify are excluded from rates and shown separately.
- **No vendor bashing.** We show the user's own data and the vendors' own published definitions with sources. Aggregate per-vendor numbers only appear above n ≥ 30, with method notes and a right of reply.
- **Zero data custody.** Customer identifiers are hashed in memory with a per-session salt; nothing persists; the tool page sends no network request unless the user clicks "Contribute".

## 6. Architecture
- Next.js (App Router, TypeScript strict, Tailwind) on Vercel; most pages static; one API route `POST /api/contribute`.
- `src/engine/` — pure TypeScript, framework-free, fully unit-tested (vitest): parsers (CSV via Papaparse streaming, JSON/NDJSON), presets → canonical `Conversation`, classifier, metrics, sensitivity, dispute export. Runs inside a Web Worker for large files (target: 500k rows without freezing the page).
- `content/vendors.json` — single source of truth for vendor facts (with `sources[]` and `checkedAt`).
- Contribution store: Vercel Blob (one JSON object per contribution, no identifiers); `/benchmark` aggregates server-side with caching.
- Analytics: Vercel Web Analytics (cookieless).
- Security: strict CSP (`connect-src 'self'`), no third-party scripts on the tool page, SRI where applicable.

## 7. Build phases
A. Spec (lead): canonical schema, presets mapping from vendor facts, classifier rules, engine API contract, page list, acceptance tests. → `docs/SPEC.md`
B. Parallel build: B1 engine + tests (Opus high) · B2 app UI + pages (Sonnet high, design skill) · B3 content: standard text, vendor pages, FAQ, privacy, README (Sonnet medium).
C. Integration + contribution API + Blob + analytics (Sonnet high); independent correctness review of the engine (Opus).
D. Private GitHub repo → Vercel preview → live test with sample data in the browser (network tab shows no upload) → repo public + production deploy.
E. Record in the brain.

## 8. Success and kill rules (from the council verdict, 2026-10-24)
Kill the probe if < 100 completed audits in 6 weeks, or < 200 organic visitors in the first 2 weeks. No pricing until a vendor asks about price in 10 conversations. No marketplace/take layer before 1,000 organic visitors/week or 50 claimed vendor pages. Legal check of vendor data terms before any public per-vendor aggregate.
