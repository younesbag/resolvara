# Resolvara — v1 technical spec

Product name: **Resolvara** ("Audit your AI agent's billed resolutions"). The open definition is "**The Strict Resolution Standard**" (v0.1). Domain not purchased yet → deploy on `*.vercel.app`; keep the site URL in one config constant. Read `docs/PLAN.md` (why/what) and `docs/research/vendor-facts.md` (sourced vendor facts — never hard-code anything it marks unconfirmed).

## Stack
Next.js 15 App Router, TypeScript strict, Tailwind v4, pnpm or npm, vitest (engine), Papaparse, no UI kit required. Static pages except `POST /api/contribute` and `/benchmark` (server, revalidate 1h). Vercel Web Analytics (`@vercel/analytics`). Strict CSP via `next.config` headers: `default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline'` (adjust minimally; no third-party scripts on `/`).

## Folder contract (agents own disjoint folders)
- `src/engine/**` — pure TS, no React/Next imports. Owner: engine agent. Tests in `src/engine/__tests__`, fixtures in `src/engine/fixtures`.
- `src/app/**`, `src/components/**`, `src/worker/**`, `public/**` — UI agent.
- `content/**` (vendors.json, standard.md, faq.md, guides) — content agent.
- Root config (package.json, tsconfig, next.config, tailwind, vitest.config) — scaffold step only; later changes noted in `docs/CHANGES.md`.

## Engine API (src/engine/index.ts) — the contract both sides build against
```ts
export type Preset = 'intercom' | 'zendesk' | 'ada' | 'gorgias' | 'generic';
export type VendorState = 'assumed' | 'confirmed' | 'escalated' | 'negative_feedback' | 'handoff' | 'verified' | 'contained' | 'billed_unknown' | 'not_ai' | 'unknown';
export interface Conversation {
  id: string; customerKey: string | null; createdAt: Date; closedAt: Date | null;
  aiInvolved: boolean; vendorState: VendorState; billed: boolean;          // billed = vendor counts it as a billable resolution
  humanReplied: boolean | null; reopenCount: number | null; csat: number | null; // csat normalised 0..1 (null if absent)
  channel: string | null; topicText: string | null;                         // topicText only kept in memory, optional
  agentReplied?: boolean | null; // Zendesk: an agent reply exists but its order after the AI is unknown; counts only with countAgentReplies
  reopenedAt?: Date | null;      // when the export gives a reopen timestamp: judged against the window; else reopenCount decides
}
export interface ColumnMapping { [canonicalField: string]: string | null } // for 'generic' and overrides
export interface AuditOptions {
  windowDays: number;            // default 7
  pricePerResolution: number;    // default from preset (Intercom 0.99, Gorgias 1.00, ...) user-editable
  sameTopicOnly: boolean;        // default false; when true repeat contact needs topic similarity >= 0.35 (local TF-IDF cosine)
  negativeCsatThreshold: number; // default 0.4 on the 0..1 scale
  exportEnd?: Date;              // default = max createdAt in file
  countAgentReplies?: boolean;   // default false; count `agentReplied` (Zendesk "Agent replies") as human_handoff although the order is unconfirmed
}
export interface AuditParams { windowDays: number; pricePerResolution: number; negativeCsatThreshold: number; sameTopicOnly: boolean; countAgentReplies: boolean } // the options the audit really used
export type Verdict = 'strict_pass' | 'confirmed_pass' | 'phantom' | 'fail_unbilled' | 'pending_window' | 'unverifiable';
// fail_unbilled: a fail signal fired but the vendor did not bill the conversation (not strictly resolved, not phantom).
export type Reason = 'human_handoff' | 'reopened' | 'repeat_contact' | 'negative_csat' | 'vendor_escalated';
export interface ConvResult { id: string; verdict: Verdict; reasons: Reason[]; evidence: string[]; }
export interface AuditReport {
  standardVersion: '0.1'; preset: Preset; rowsRead: number; rowsSkipped: number; warnings: string[];
  params: AuditParams;           // effective options; the summary and the contribution read these
  period: { start: Date; end: Date };
  aiConversations: number;       // all AI conversations (after dedupe by id)
  billed: number;                // all billed AI conversations, pending and unverifiable included (what the invoice counts)
  judged: number;                // aiConversations - pending - unverifiable. ONE population for every rate below.
  billedJudged: number;          // billed conversations inside `judged` (phantom + billed passes)
  billedRate: number;            // billedJudged / judged
  verifiable: number;            // alias of judged
  strictPass: number; confirmedPass: number; phantom: number; failUnbilled: number; pending: number; unverifiable: number;
  strictRate: number;            // (strictPass+confirmedPass) / judged
  phantomShareOfBilled: number;  // phantom / billedJudged
  dollarsAtRisk: number;         // phantom * pricePerResolution (price clamped to >= 0)
  byReason: Record<Reason, number>; // reason counts over PHANTOM conversations only; one conversation can carry several
  weekly: { weekStart: string; billed: number; phantom: number; strictPass: number }[]; // Monday-start UTC weeks; billed = all billed AI, strictPass = strict + confirmed
  sensitivity: { windowDays: number; phantom: number; strictRate: number }[]; // for 1,3,7,14,30
  results: ConvResult[];         // one per AI conversation
}
export function detectPreset(headers: string[], sample: Record<string, unknown>[]): { preset: Preset; confidence: number };
export function peekFile(file: File | string, maxRows?: number, headBytes?: number): Promise<{ headers: string[]; rows: Record<string, unknown>[]; format: 'csv' | 'json' }>; // head of the file only, for preset detection and the mapper
export function parseFile(file: File | string, opts?: { preset?: Preset; mapping?: ColumnMapping; onProgress?: (p: number) => void }): Promise<{ conversations: Conversation[]; headers: string[]; warnings: string[] }>;
export function audit(convs: Conversation[], opts: AuditOptions, preset: Preset): AuditReport;
export function toDisputeCsv(report: AuditReport, convs: Conversation[]): string;
export function disputeSummaryText(report: AuditReport, opts: AuditOptions, vendorName: string): string; // plain text + email template
export function contributionPayload(report: AuditReport, opts: AuditOptions, vendor?: ContributionVendor): Contribution; // aggregates only, no ids/text; vendor defaults to the preset's vendor ('other' for generic)
export function sampleDataset(preset: Preset, seed?: number): string; // realistic synthetic CSV/JSONL for "Try sample data"
```

## Classification rules (Strict Resolution Standard v0.1)
Applies to every conversation with `aiInvolved = true`. Let W = windowDays. Conversations are deduplicated by id first (first row wins).
1. If `createdAt > exportEnd − W` → `pending_window` (cannot verify yet; excluded from all rates, shown separately). Nothing else is evaluated.
2. Fail reasons: any that fire are recorded, each with an evidence string:
   - `vendor_escalated`: vendorState ∈ {escalated, handoff, negative_feedback}.
   - `human_handoff`: `humanReplied === true` (a human/admin reply after the AI took part; see the Intercom preset for how the order is established). Zendesk `Agent replies` cannot show the order, so it goes to `agentReplied` and counts only when `countAgentReplies` is on (default off, with a report warning).
   - `reopened`: `reopenCount > 0` (any time), or, when the conversation has a `reopenedAt` timestamp, a reopen within W days of `createdAt` (inclusive).
   - `repeat_contact`: same `customerKey` created another conversation (AI or not, billed or not) with `createdAt` in (this.createdAt, this.createdAt + W]; if `sameTopicOnly`, only when topic similarity ≥ 0.35 and both have topic text. Evidence names the other id and the gap in days (1 decimal).
   - `negative_csat`: `csat !== null && csat < negativeCsatThreshold` (strictly below).
3. Verdict, in order:
   - any fail reason and `billed` → `phantom` ("billed but not strictly resolved"; never "fraud");
   - any fail reason and not billed → `fail_unbilled` (counts as not strict, never phantom, never dollars);
   - no fail reason and `customerKey === null` → `unverifiable` (the repeat-contact test cannot run, so a pass cannot be shown; another signal being present does not change that);
   - no fail reason and (`vendorState === 'confirmed'` or `csat >= 0.75`, an explicit positive rating) → `confirmed_pass`;
   - otherwise `strict_pass`.
4. Rates share one population, `judged = AI conversations − pending − unverifiable` (unverifiable conversations are unjudged, not failed): `strictRate = (strictPass+confirmedPass)/judged`, `billedRate = billedJudged/judged`, `phantomShareOfBilled = phantom/billedJudged` where `billedJudged` counts billed conversations inside `judged`. All rates are 0 when the denominator is 0.
5. `byReason` counts reasons over phantom conversations only. `byReasonShare` (contribution) is `byReason[r] / phantom`: the share of phantom conversations carrying that reason (shares can add up to more than 1).
6. A billed conversation that is `phantom` is a **phantom resolution**. Never call it "fraud"; UI copy says "billed but not strictly resolved".
7. CSAT is normalised to 0..1 by a scale, never by the file's own min and max: 1-5 → (v−1)/4, 1-10 → (v−1)/9, 0-100 → v/100, 0-1 → v. The scale is chosen in the mapper (generic, Ada, Zendesk, Gorgias); if not chosen, it is guessed from the highest value (≤1 with fractions or zeros → 0-1, ≤5 → 1-5, ≤10 → 1-10, ≤100 → 0-100) and a note says so; values that cannot reveal a scale (for example only 1s) are ignored with a note. Intercom ratings are 1-5. The words good/bad (and positive/negative) map to 1/0.
Edge cases to test: duplicate rows (dedupe by id), time zones (parse ISO with offset; naive timestamps treated as UTC with a warning), missing columns (warning, not crash), customer with many conversations (chain: each judged against the next within W), conversations exactly at W boundary (inclusive), empty file, 500k rows performance (< 10s in worker on a laptop), CSV with BOM / semicolon delimiter / quoted newlines, JSONL, a JSON array (pretty-printed or very large), and a wrapped list such as `{"conversations":[...]}`.
Customer ids and emails are replaced by a salted SHA-256 digest (random salt per session, 64 bits kept) during parsing; the engine does not keep the raw value afterwards.

## Presets (from vendor-facts.md)
- **intercom**: API/S3 JSONL or CSV. Fields: `id`, `created_at` (unix seconds or ISO), `ai_agent_participated`, `ai_agent.resolution_state` (assumed_resolution→assumed & billed, confirmed_resolution→confirmed & billed, escalated, negative_feedback, procedure_handoff→handoff; legacy routed_to_team→escalated, abandoned→negative_feedback), `statistics.count_reopens`, `conversation_rating.rating|score` (1–5 → 0..1), `ai_agent.rating`, contact id/email for customerKey, `statistics.last_admin_reply_at` → humanReplied only when it is later than `ai_agent.created_at` (order known); with no AI start time the reply order is unknown, humanReplied is null and a note says so. CSV header names are unconfirmed → detect by fuzzy header matching and always allow mapping overrides. Default price $0.99.
- **zendesk**: ticket export (CSV/JSON) with `Resolution type`/`Resolution tier` (Verified → billed; Contained/Assisted escalation → not billed) or legacy tag `ai_agent_automated_resolution`; requester id/email; created/solved; reopens; satisfaction. Optional second file: Usage › Resolutions CSV (billed ticket IDs) joined on ticket id. Default price: user must enter (no confirmed public price).
- **ada**: `automated_resolution_classification` (resolved→billed), `is_escalated`, `handoffs`, `csat`, `end_user_id`, timestamps. Price: user enters.
- **gorgias**: no AI column → infer AI-resolved when agent message count = 0 and AI tag/integration present; user confirms in mapper. Default $1.00.
- **generic**: column mapper UI: user picks columns for id, customer, created, "billed as AI resolution" (column + value), human reply, reopen, CSAT, topic text.

## UI (Resolvara)
Design: an audit-report / ledger feel — precise, calm, trustworthy; tabular numerals; verdict "stamps" (Strict ✓ / Phantom); avoid generic AI-SaaS gradients and the clichés listed in the design skill. Load skill `design-taste-frontend` before designing. Light + dark. Mobile works (results readable at 390px).
Pages: `/` (hero + drop zone + Try sample data + live results in place; How it works; trust strip; FAQ teaser), `/standard` (renders content/standard.md), `/definitions` (table from vendors.json), `/vendors/[slug]` (static per vendor), `/calculator`, `/benchmark` (n≥30 rule, shows "collecting: n so far"), `/privacy`, `/about`. Header nav + footer (GitHub link, standard version, "Runs in your browser").
Results view: big numbers (billed rate vs strict rate, phantom count, $ at risk), reason bars, weekly chart (SVG), sensitivity table with window slider, flagged table (filter by reason, search id, paginate), buttons: Download dispute CSV, Copy summary/email, Download share card (PNG via canvas: only rates + vendor + "Strict Resolution Standard v0.1" + site), Contribute anonymously (shows exact JSON before sending), Start over. Processing in a Web Worker with progress bar. No network calls except Contribute.

## Contribution API
`POST /api/contribute` body = `Contribution { standardVersion, preset, vendor, periodDays, aiConversationsBucket ('<1k'|'1k-10k'|'10k-100k'|'>100k'), billedRate, strictRate, phantomShareOfBilled, windowDays, byReasonShare }`. `vendor` is an enum: the slugs in `content/vendors.json` plus `other` (never free text; the contribute dialog offers a picker). Validate with zod, reject extra fields, per-IP rate limit (hash, 5/hour, in-memory best effort), store as one JSON object in Vercel Blob (`contributions/<utc-day>-<sha256(payload)[:24]>.json`, private, overwrite allowed so the same numbers sent twice on one day count once). Sample data is never contributed (the button is disabled for it). `/benchmark` aggregates per vendor over contributions with `windowDays === 7` only: n, median billed rate, median strict rate, IQR — hidden unless n ≥ 30. When more than 5000 contributions exist the newest 5000 are used.

## Acceptance (must pass before deploy)
- `npm run build` and `npm test` green; engine coverage of all rules and edge cases above.
- Sample datasets for intercom/zendesk/generic produce sensible, hand-checked numbers (a test asserts exact counts on a small fixed fixture whose expected verdicts were computed by hand).
- Lighthouse-level sanity: no console errors; `/` works offline after load; DevTools shows zero requests during an audit.
- Every vendor fact on the site carries a source link and checked date.
