# Resolvara: independent review (2026-10-24)

Reviewer: independent pass. I did not rely on earlier reports. Scope: engine correctness against `docs/SPEC.md` and `content/standard.md`, report math, privacy, honesty of copy, build health. I changed no product code. Adversarial tests are in `src/engine/__tests__/review.adversarial.test.ts`. A failing test there marks a real defect. A few tests pin down a SPEC ambiguity; those are marked in the test names and below.

Reviewed at commit `2c91128` ("feat: integrate engine, contribute API, analytics").

## Build health

| Check | Command | Result |
|---|---|---|
| Unit tests (before this review) | `npm test` | 1 file, 7 passed. These are server tests only. vitest has `passWithNoTests`, and no engine tests exist. |
| Unit tests (with the review file) | `npx vitest run` | 54 tests: **47 failed, 7 passed**. All 47 failures are `Error: not implemented`, read from the JSON reporter. |
| Typecheck | `npm run typecheck` | clean |
| Lint | `npm run lint` (includes the new test file) | clean |
| Build | `npm run build` | green; 27 routes; `/api/contribute` is dynamic, `/benchmark` revalidates every hour |

## Prioritized findings

### CRITICAL

**C1. The engine is not implemented. Every export throws.**
- File: `src/engine/index.ts:104-159`. `detectPreset`, `parseFile`, `audit`, `toDisputeCsv`, `disputeSummaryText`, `contributionPayload` and `sampleDataset` all `throw new Error('not implemented')`. Git history shows the file only in the scaffold commit (`70e0a06`). The commit titled "integrate engine" did not add one. `src/engine/__tests__` and `src/engine/fixtures` contain only `.gitkeep`.
- Failing case: every test in the review file. In the app, "Try sample data" and every file drop end in the worker error path, which shows the message "not implemented" (`src/worker/audit.worker.ts:125,129,178,202`).
- Why `npm test` is green anyway: `vitest.config.ts` has `passWithNoTests: true`, and the only tests are in `src/server`.
- Fix: implement the engine to the SPEC (PLAN: Opus). Make `review.adversarial.test.ts` pass. Add the hand-checked fixture test the SPEC requires. Remove `passWithNoTests`, or add a smoke test that calls `audit([])`, so a missing engine can never pass CI again.
- Resolution (C1): Fixed. `src/engine/*` implemented to the SPEC (types, audit, parse, presets, scan, outputs, sample, hash, time, topic). `review.adversarial.test.ts` passes, `engine.test.ts` adds a smoke test, and `passWithNoTests` is gone, so an empty run fails.

**C2. Public copy claims engine behaviour that does not exist yet.** This follows from C1, and it is a deploy blocker on its own.
- `content/privacy.md:12` says customer ids and emails are hashed in memory with a per-session salt. Nothing hashes anything. A test covers it: "customer identifiers are not kept in clear text".
- `src/components/home/how-it-works.tsx` says presets are "detected from the headers". `content/faq.md` describes phantom counts, dispute packs and the same-topic filter. None of these work today.
- Fix: do not deploy until C1 is fixed and these behaviours are tested. The hashing test must pass before the privacy page ships.
- Resolution (C2): Fixed. The behaviour now exists and is tested: salted SHA-256 customer keys (test "customer identifiers are not kept in clear text" plus a sha256 test against node:crypto), preset detection (`detectPreset`), dispute CSV and summary. Privacy, FAQ and README wording was tightened to match.

### HIGH

**H1. An audit makes a network request, and the page does not work offline after load.**
- File: `src/components/auditor/use-auditor.ts:194-211`. The worker is created by `ensureWorker()` only when a file or sample is chosen. The build puts the engine and Papaparse in a separate lazy chunk (`.next/static/chunks/103.*.js`), so the first drop fetches it. `freshStart` (`:226-235`) terminates the worker and creates a new one for every file. Each run then adds another request, served from disk cache.
- Failing case: load `/`, go offline, drop a file. The worker cannot load. With DevTools open, a JS request appears at the moment the audit starts.
- This contradicts `src/components/home/trust-strip.tsx:22` ("An audit makes zero requests"), `content/privacy.md:13`, `src/components/auditor/intake.tsx:112` and the SPEC acceptance criteria ("`/` works offline after load; zero requests during an audit").
- Fix: create the worker once, on mount or idle, and keep it. Reset its state with a message instead of terminating it. At minimum, preload the chunk (`modulepreload`) before the drop zone becomes active.
- Resolution (H1): Fixed. The worker is created once on mount (`use-auditor.ts`), reset with a `{type:"reset"}` message instead of being terminated, and the engine chunk is fetched at page load. Checked in a production build in the browser pane: the network log gained no entry across two sample runs and a Start over.

**H2. The `Verdict` type cannot represent a failing conversation that was not billed.**
- File: `src/engine/index.ts:43-48`. SPEC rule 3 and Standard §3.4 say an unbilled conversation with a fail signal is "not strictly resolved" but not phantom. The enum offers only `strict_pass | confirmed_pass | phantom | pending_window | unverifiable`. Any engine will mislabel these conversations. As `strict_pass` they inflate the strict rate. As `phantom` they inflate the phantom count and dollars at risk.
- Failing case: fixture conversation `f6` (unbilled, `vendorState: escalated`). The test asserts that the verdict is neither a pass nor phantom.
- Fix: add a verdict such as `fail_unbilled` to the contract, `VERDICT_LABEL` (`src/components/auditor/meta.ts:61`), and the Standard, before the engine is written.
- Resolution (H2): Fixed. New verdict `fail_unbilled` in the engine type, SPEC, Standard (section 2 and 3), `VERDICT_LABEL`, `Stamp`, and a `failUnbilled` count in the report and the results page.

**H3. The rate denominators are inconsistent, and the headline comparison misleads.**
- a) `phantomShareOfBilled = phantom / (billed - pending - unverifiable)` (SPEC; `content/standard.md` §5) subtracts all pending and unverifiable conversations, including unbilled ones. The right denominator is billed conversations that are neither pending nor unverifiable. Failing case: the fixture plus one unbilled pending conversation gives 3/5 = 0.60 under the literal formula; the correct value is 3/6 = 0.50 (test "phantomShareOfBilled subtracts only BILLED…"). The UI repeats the formula at `src/components/auditor/results.tsx:32` (`judged = billed - pending - unverifiable`), which decides the headline. Fix: have the engine return `billedJudged`, and use it in both the engine and the UI.
- b) `billedRate` is billed / all AI conversations, pending included. `strictRate` leaves pending out and also counts unbilled passes. `big-numbers.tsx:34-44` and the share card (`share-card.ts:66-67`) show them side by side as "Billed as resolved 80%" and "Strictly resolved 44%" (fixture: 8/10 vs 4/9), two different populations. Readers will take the gap for the phantom share. Fix: compute `billedRate` over the same population (AI conversations minus pending), or label both denominators. Lead the share card with `phantomShareOfBilled`.
- c) Unverifiable conversations stay in the `strictRate` denominator (Standard §5 excludes only pending), so they count as failures. Yet `results.tsx:150-158` lists them under "What is left out of the rates". Fix (recommended): remove unverifiable conversations from the `strictRate` denominator, because they are unjudged, not failed, and update the SPEC and Standard §5. Otherwise, fix the copy.
- Resolution (H3): Fixed as recommended. (a) `judged` and `billedJudged` come from the engine; `phantomShareOfBilled = phantom / billedJudged`, used by the engine and `results.tsx`. (b) `billedRate = billedJudged / judged`, the same population as `strictRate`; big numbers and share card state it, and the share card now leads with the phantom share. (c) Unverifiable conversations leave the strict denominator; Standard section 5, SPEC rule 4 and the results copy agree. Three assertions in the review's test file pinned the old numbers and were updated (see "Tests changed" below).

**H4. The contribution's `vendor` field is free text, and the engine signature cannot fill it.**
- Files: `src/components/auditor/options-panel.tsx:192-199` (a free text input) → `vendorName` → `payload.vendor`. `src/server/contribution.ts:15-20` accepts any 64 characters that match `[A-Za-z0-9 ._()+/-]`. A user can send a company name or other text, while `content/privacy.md` and the dialog say "no text". An apostrophe ("Zendesk's") gets a 400. `contributionPayload(report, opts)` (SPEC) receives no vendor name at all.
- Fix: make `vendor` an enum of `content/vendors.json` slugs plus `other`. Pass it to `contributionPayload`, or derive it from the preset. Tighten the zod schema to the enum.
- Resolution (H4): Fixed. `vendor` is the `ContributionVendor` enum (vendors.json slugs plus `other`) in the engine type and the zod schema; `contributionPayload(report, opts, vendor?)` defaults to the preset's vendor; the contribute dialog has a picker instead of the free text; `vendors.json` slugs are checked against the enum by a test.

**H5. Sample data can be contributed to the community benchmark.**
- Files: `src/components/auditor/actions-bar.tsx:105` (the Contribute button) has no sample guard. `isSample` is known in `use-auditor.ts:146` but is not stored in state.
- Failing case: "Try sample data", then Contribute, then Send. A synthetic record enters `/benchmark` and counts toward n ≥ 30.
- Fix: keep `isSample` in state. Hide or disable Contribute for sample runs.
- Resolution (H5): Fixed. `isSample` is kept in state; the Contribute button is disabled for sample runs and the dialog gets no payload.

### MEDIUM

- **M1. Benchmark medians mix windows and groupings.** `src/server/contribution.ts:86-105` aggregates contributions with any `windowDays` (1-365) and any period, so the medians compare unlike quantities. It also groups by preset, while `content/faq.md:57` promises "a vendor's numbers … 30 contributions exist for it". The `generic` group lumps many vendors together. Fix: aggregate only `windowDays === 7` (or stratify) and group by the vendor enum from H4.
- Resolution (M1): Fixed. Aggregation is per vendor and only over `windowDays === 7`; tests cover both.
- **M2. CSAT on "any scale" has no defined rule.** `meta.ts:114` says "Any scale. It is normalised to 0..1". If the scale is inferred from the observed min and max, a file with only 4s and 5s turns 4/5 into 0, and `negative_csat` fires falsely. Covered by the test "CSAT on a 1-5 scale is normalised by the scale". Fix: the user picks the scale in the mapper (1-5, 1-10, 0-100, 0-1), with a default guessed from the maximum value. Never use the data's own min and max.
- Resolution (M2): Fixed. Scale-based normalisation (1-5, 1-10, 0-100, 0-1), chosen in the mapper (`csatScale`) or guessed from the highest value only; unknowable scales are ignored with a note. Tests cover 4s-and-5s files, 1-10, 0-100, 0-1, words, and an unknowable file.
- **M3. "Human reply after the AI" is not supported by the Intercom fields.** `meta.ts:38,110`, `strict-test.tsx` and Standard §4 say "after the AI". `statistics.last_admin_reply_at` alone does not prove the order. An admin may have replied before Fin took over. Fix: fire only when `last_admin_reply_at > ai_agent.created_at`. Otherwise, relabel the reason as "human reply in conversation".
- Resolution (M3): Fixed. The Intercom preset sets `humanReplied` only when `last_admin_reply_at` is later than `ai_agent.created_at`; with no AI start time it is null and a note says so.
- **M4. "Explicit positive rating" is undefined.** It decides `confirmed_pass` (Standard §2, SPEC rule 4). Fix: define it (for example normalised CSAT ≥ 0.75, or `ai_agent.rating` ≥ 4) in the Standard and the engine.
- Resolution (M4): Fixed. Explicit positive rating = normalised CSAT >= 0.75, defined in the Standard section 2, the SPEC and the engine (`POSITIVE_RATING`).
- **M5. "No other signal available" is undefined in the unverifiable rule.** It is unclear whether `humanReplied === false` counts as an available signal. With a null `customerKey`, repeat contact cannot be checked, so a pass is never fully verified. Fix: decide the rule (recommended: null customer key and no fail signal → `unverifiable`) and write it into the Standard. The tests cover the clear cases only: all signals null → unverifiable; null key with `humanReplied: true` → phantom.
- Resolution (M5): Fixed with the recommended rule: no customer key and no fail signal means unverifiable. Written into Standard sections 2, 3 and 5 and the SPEC.
- **M6. `byReason` and `byReasonShare` lack defined populations.** It is unclear whether they cover phantom conversations only or every failing AI conversation, and what the share's denominator is. Define both in the SPEC and the Standard.
- Resolution (M6): Fixed. `byReason` counts phantom conversations only; `byReasonShare` is the share of phantom conversations carrying the reason. Defined in the Standard section 5 and the SPEC.
- **M7. The worker cannot read wrapped or large JSON files.** `src/worker/audit.worker.ts:68-97`: an Intercom REST list response (`{"type":"conversation.list","conversations":[...]}`) or a pretty-printed JSON array over 64 MB falls into line mode, which reads fragments and ends in "Could not read any JSON records". Fix: unwrap the known array keys and stream-parse large arrays.
- Resolution (M7): Fixed. The engine reads JSON arrays, wrapped lists (`{"conversations":[...]}`) and JSONL with an element scanner, never as one value; the worker peeks through the same `peekFile`. Tests cover pretty-printed arrays, wrapped lists, a 30,000-record array, brackets inside strings and a corrupt line.
- **M8. Async message handling in the worker can mix runs.** `audit.worker.ts:121` uses an async `onmessage`. A debounced `audit` message (from `setOpts`) that arrives while `parseFile` is awaiting runs on the previous `convs` but under the new `lastPreset`. The result is a short-lived wrong report. Fix: queue messages, or drop audits while a parse is running.
- Resolution (M8): Fixed. The worker queues messages and handles them one at a time; only the newest queued audit runs; the preset is committed together with the parsed conversations; a reset drops stale work.
- **M9. The rate limit is per serverless instance.** `contribution.ts:40` keeps it in memory, and the first `x-forwarded-for` hop is the key. It is documented as best effort, but nothing stops one person from padding the n ≥ 30 gate. Fix: also deduplicate by a hash of the payload plus the day.
- Resolution (M9): Fixed. Object names are `<utc-day>-<sha256(payload)[:24]>.json` with overwrite allowed, so the same numbers sent twice on one day count once. The per-instance rate limit stays best effort, as documented.
- **M10. The price field accepts negative values.** `options-panel.tsx:103` accepts any finite number, so dollars at risk can go negative. Fix: clamp the price to ≥ 0.
- Resolution (M10): Partly invalid, fixed anyway. Evidence: the price input already stripped every character except digits and a dot (`options-panel.tsx`, `replace(/[^0-9.]/g, "")`), so a minus sign could not be typed or pasted. The engine now also clamps the price to >= 0 and the input rejects negatives, with a test (`a negative price never produces negative dollars at risk`).

### LOW

- **L1. vitest config.** `vitest.config.ts`: `passWithNoTests` hides C1, and Vite warns that the config is ESM loaded as CJS. Rename it to `vitest.config.mts`.
- Resolution (L1): Fixed. `vitest.config.mts` (ESM) replaces `vitest.config.ts`; `passWithNoTests` removed.
- **L2. CSP and HSTS.** The CSP allows `https://vitals.vercel-insights.com` (`next.config.ts:16`), but nothing uses it: `@vercel/analytics` posts to same-origin `/_vercel/insights`. Remove it. HSTS `preload` does nothing on `*.vercel.app`.
- Resolution (L2): Fixed. `connect-src 'self'` only; HSTS no longer says `preload`.
- **L3. Invisible BOM in a regex.** A literal U+FEFF sits in the regex at `audit.worker.ts:65,79`. Use `﻿`.
- Resolution (L3): Fixed. The regex with the literal U+FEFF is gone; BOM handling is `stripBom()` using `charCodeAt(0) === 0xfeff`.
- **L4. Double memory on JSON arrays.** `audit.worker.ts:75` reads JSON arrays up to 64 MB in full just to preview 40 rows, and `parseFile` then reads them again.
- Resolution (L4): Fixed. The worker no longer reads a whole JSON file to preview it; `peekFile` reads the first 768 KB only.
- **L5. Gorgias defaults and labels.** The default price is the $1.00 monthly rate (`meta.ts:24`); the $0.90 annual rate and $1.50 overage are not mentioned next to the field. `vendors.json` marks Gorgias `presetSupport: "native"`, but the UI always sends Gorgias through the mapper.
- Resolution (L5): Fixed. Gorgias is `presetSupport: "generic"` in `vendors.json` (it always goes through the mapper); the price help lists $1.00 monthly, $0.90 annual and $1.50 overage.
- **L6. "Nothing leaves your browser."** The hero (`hero-copy.tsx:14`) and the OG image say this, but Vercel Analytics page views do leave. The privacy page discloses this. Suggested wording: "Your file never leaves your browser."
- Resolution (L6): Fixed. Hero, OG image and mapper now say the file never leaves the browser / stays in the tab.
- **L7. Benchmark cap keeps the oldest records.** `src/components/lib/benchmark.ts:262` stops listing at about 5000 blobs. Listing order is by timestamp key, so after the cap the newest contributions are ignored.
- Resolution (L7): Fixed. The loader keeps the newest 5,000 contributions (it lists up to 50,000 names and drops the oldest).
- **L8. The build needs network access.** `next/font/google` downloads fonts at build time (not at runtime), so an offline build fails.
- Resolution (L8): Accepted, not fixed. `next/font/google` is a build-time download and Vercel builds have network access; nothing is fetched from Google at runtime. Documented in README. Self-hosting the fonts would add binary files and a package, which is out of scope for this commit.

## Hand recomputation (fixture in the test file)

Export end E = 2026-10-31T00:00Z, W = 7, price $0.99, CSAT threshold 0.4.

| id | AI | billed | customer | created | signals | expected verdict |
|---|---|---|---|---|---|---|
| f1 | y | y | A | E-30d | none | strict_pass |
| f2 | y | y | B | E-30d | state confirmed | confirmed_pass |
| f3 | y | y | C | E-29d | humanReplied | phantom (human_handoff) |
| f4 | y | y | D | E-28d | f5 at +2.0d | phantom (repeat_contact) |
| f5 | y | y | D | E-26d | none | strict_pass |
| f6 | y | n | E | E-25d | state escalated | failing, unbilled (not phantom) |
| f7 | y | n | F | E-20d | none | strict_pass |
| f8 | y | y | none | E-27d | all null | unverifiable |
| f9 | y | y | G | E-2d | none | pending_window |
| f10 | y | y | H | E-15d | csat 0, reopens 2 | phantom (negative_csat, reopened) |
| f11 | n | y | I | E-10d | none | out of scope |

- AI conversations 10; billed 8; billedRate 0.8.
- Pending 1; unverifiable 1; phantom 3; strict 3; confirmed 1.
- strictRate = (3+1) / (10-1) = 0.444.
- phantomShareOfBilled = 3 / (8-1-1) = 0.5.
- dollarsAtRisk = 3 × 0.99 = 2.97.
- Sensitivity:
  - W=1: phantom 2, strictRate 6/10. Nothing is pending, and the 2-day gap from f4 to f5 no longer counts.
  - W=30: phantom 0, strictRate 2/2. Only f1 and f2 sit outside the pending window, because they fall exactly on the boundary.

## What the adversarial tests cover

- Window boundaries: a conversation exactly W days before the export end is not pending; 1 ms later it is. Repeat contact uses (t, t+W]: exactly +W counts, +W+1 ms does not, the same instant does not. `exportEnd` defaults to the latest `createdAt`. Pending takes priority over fail signals.
- Repeat contacts: a chain of four; evidence names the other id and the gap to one decimal; a later non-AI or unbilled contact counts; a later contact inside the pending window counts; input order does not matter; the same-topic filter, including words common across the corpus (a TF-IDF idf=0 trap).
- Fail signals: the three escalation states; null signals never fire; CSAT is strictly below the threshold; confirmed plus a failure is phantom; a null customer key with a signal is phantom; unbilled failures carry no dollars; one verdict per AI conversation; duplicate ids are deduplicated; empty and all-pending inputs give no NaN.
- Parsing: BOM, semicolon delimiter, quoted newlines; time offsets, naive UTC with a warning, unix seconds; duplicate rows; missing columns and bad dates produce warnings; empty file; customer key hashing; CSAT scale (1-5, with only 4s and 5s present); Intercom current and legacy states (`routed_to_team`, `abandoned`, `procedure_handoff`); `created_at` as unix seconds or ISO; rating 2 becomes 0.25.
- `detectPreset` for Intercom, Zendesk, Ada and generic headers.
- Dispute CSV: one row per phantom; formula injection is neutralised (an id starting with `=HYPERLINK(...)`).
- Summary text: no "fraud"; names the vendor, the version and the window.
- Contribution payload: passes the server schema and contains no ids, keys or topic text.
- Sample datasets: deterministic for a given seed; their rates fall within [0,1].
- Performance: auditing 500k conversations and parsing a 500k-row CSV each take under 10 s.

## Verified as correct

- Network: a grep of `src` for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource` and `importScripts` finds only `src/components/auditor/contribute-dialog.tsx:30` (POST `/api/contribute`, sent only on click, with the exact JSON shown first). The other network source is `<Analytics />` in `layout.tsx`. The worker has no network code. H1 is the one exception: the worker's own chunk loads lazily.
- CSP: set on every route (`next.config.ts`). In production, `script-src` allows no third-party origin.
- Contribution server: strict zod schema rejects extra fields; 4 KB body cap; Origin check; private Blob; per-process salted IP hash, not stored.
- Vendor facts: `content/vendors.json` and `content/vendor-guides/*.md` match `docs/research/vendor-facts.md`. Each vendor has `sources[]` and `checkedAt`, and unconfirmed items are labelled. Zendesk and Ada prices are null, and `DEFAULT_PRICE` is 0 for them; Intercom $0.99 and Gorgias $1.00 are sourced. The Standard text never says "fraud" except to deny it.

## Fix commit: tests changed and what stays open

Tests changed (the review's own file, `review.adversarial.test.ts`). Only the three numbers that depend on the H3 decisions moved; every other assertion passes unchanged.

- `billedRate` 0.8 became 6/8. The old value divided all billed conversations (8, pending and unverifiable included) by all AI conversations (10), a different population from `strictRate`. The review's own finding H3b asks for one population.
- `strictRate` 4/9 became 4/8, and the W=1 sensitivity 6/10 became 6/9. The old denominators counted the unverifiable conversation f8 as a failure; the review's H3c recommends leaving unverifiable conversations out, and M5 makes unverifiable common when a file has no customer column.
- `engine.test.ts` adds 35 tests for H2-H5, M2-M7, M10, the presets, the JSON shapes and an engine smoke test.

Verified after the fixes: `npm test` (92 tests), `npm run typecheck`, `npm run lint` and `npm run build` are green. A production build served locally ran the Intercom and Zendesk samples with no network request during the audits.

Known limitations that remain:

- Files are read whole into a string, up to 400 MB; larger exports must be split by date (the 500k-row targets in the SPEC are met: audit 1.4 s, parse 2.7 s).
- Zendesk: the optional second file (Usage > Resolutions CSV) is not joined; only a ticket export is read. Header names for Zendesk, Intercom CSV and Ada values are matched fuzzily because the vendors' exact names are unconfirmed (vendor-facts.md), so the mapper is always offered.
- The rate limit on `/api/contribute` is per serverless instance, and the benchmark still depends on self-selected contributors.
- `content/about.md` still has TODO placeholders for the maintainer, contact and repository link, and `GITHUB_URL` is a placeholder.
- `/_vercel/insights/script.js` returns 404 outside Vercel, which shows as a console error in local runs.
- The same-topic filter compares plain word overlap (TF-IDF); it does not understand synonyms.
