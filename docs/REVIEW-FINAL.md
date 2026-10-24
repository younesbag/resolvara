# Resolvara: final engine review (2026-10-24)

This is an independent pass over the engine as it was implemented after `docs/REVIEW.md`. The engine code itself had not been reviewed before. Scope: `src/engine/*` and `src/worker/*`, checked against `docs/SPEC.md` and `content/standard.md`. The question was whether the numbers a customer sees, and might take to a vendor, are right.

Reviewed at commit `267d4d4` ("fix: review findings"). New tests are in `src/engine/__tests__/final.review.test.ts` (21 tests).

## Method

- I read every engine module and the worker line by line.
- I wrote a separate reference classifier in the test file, using only `docs/SPEC.md`. It is naive and O(n²), and shares no code with the engine. The tests run `sampleDataset → parseFile → audit` and compare every conversation's verdict and reason set with the reference:
  - Intercom: two seeds, and every sensitivity window (1, 3, 7, 14, 30).
  - Generic: one seed.
  - Result: zero mismatches.
- Every preset sample, with the same-topic filter on and off, must satisfy these report invariants:
  - The populations add up, and verdict counts match the totals.
  - All rates are in [0,1] and share the `judged` population.
  - phantom ≤ billedJudged ≤ billed ≤ AI conversations.
  - `dollarsAtRisk` = phantom × price.
  - `byReason` matches the phantom results exactly.
  - Weekly buckets start on a Monday, are in ascending order, and add up to the totals.
  - Every sensitivity row equals a full audit at that window.
  - The dispute CSV has one row per phantom.

## Build health (after this review)

| Check | Result |
|---|---|
| `npm test` | 4 files, 113 tests, all passed |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` | green |

## Fixed in this review (each with a test)

**F1. HIGH. Intercom JSON whose first records were not AI-handled read as "nothing billed".**
- Cause: `parse.ts` resolved JSON paths only if they appeared in the first 200 records. An export that starts with conversations Fin never touched has no `ai_agent` object in those records. Two plausible cases: an export that begins before Fin was switched on, or a busy human queue.
- Effect: three paths never resolved, `ai_agent.resolution_state`, `ai_agent.created_at` and `ai_agent.rating`. `conversation_rating.rating` also failed when the sampled ratings were `null`: it matched the bare `conversation_rating` key, whose value is an object.
- Result for the customer: every conversation was unbilled, with 0 phantom and $0 at risk. The human-reply signal was switched off for the whole file. Ratings were dropped.
- Fix: `resolveJsonField` in `parse.ts` now picks a field in this order:
  1. A dotted path seen in the sample, or a key whose sampled value is a plain value.
  2. Otherwise, the preset's own dotted path, read blind. A missing path reads as missing.
  3. Otherwise, the matching used before.
- A path read blind does not decide which Intercom conversations are AI-handled. The "treated as AI-handled" note still fires when needed.
- Tests: "Intercom JSONL whose first records have no ai_agent object" and "Intercom JSON without an ai_agent_participated field".

**F2. MEDIUM. Intercom resolution states written as display names were not recognised.**
- Intercom's CSV dataset column values are unconfirmed (`vendor-facts.md`). A value such as `Assumed resolution` or `Routed to team` fell through to `unknown`, which is unbilled. A whole CSV export could show nothing billed.
- Fix: `intercomState` turns spaces and hyphens into `_` before it matches the value.
- Test: "Intercom resolution states written as display names".

**F3. LOW. An object-valued customer id was hashed as the string "[object Object]".**
- Every such row then counted as one customer, which inflates repeat contacts.
- Fix: `hash.ts` hashes `JSON.stringify` of objects.
- Test: "two different object-valued ids never collapse into one customer".

**F4. LOW. The note "admin reply but no AI start time" counted non-AI conversations.**
- In F1's file it reported 250 conversations whose signal was off. None of them was an AI conversation.
- Fix: only AI conversations are counted.
- Test: "...note counts AI conversations only".

## Open items (not fixed here)

| Sev | Item | Suggested fix |
|---|---|---|
| MEDIUM | **Zendesk `human_handoff` has no order evidence.** `humanReplied` comes from `Agent replies` (a count > 0). The export cannot show that the reply came after the AI took part. Standard §4 says the signal is then not used, and the report says so. The engine uses it silently. Ada `handoffs` are fine: a handoff is from the bot to a human. Generic files are fine: the user maps a column labelled "Human reply after the AI". | Choose one: (a) for Zendesk, set `humanReplied = null` with a note unless the user confirms the column in the mapper; (b) keep it and add a warning, then update Standard §4. This is a product decision for the lead. |
| LOW | **Intercom customer key can fall back to `source.author.email/id`.** This happens when no contact path is in the sampled records. For admin-initiated (outbound) conversations the author is a teammate, so their conversations merge into one "customer" and create false repeat contacts. | Use `source.author.*` only when `source.author.type` is `user`/`lead`, or drop those candidates. |
| LOW | **The summary and the contribution read `opts`, not the values `audit` used.** `audit` replaces a window ≤ 0 or NaN with 7 and a NaN CSAT threshold with 0.4. The summary would print "0-day window" or "NaN". `contributionPayload` rounds a fractional window, so 7.4 is filed as 7 and enters the 7-day benchmark. The UI slider is an integer from 1 to 30, so the UI cannot reach this today. | Add the effective parameters to `AuditReport` (`params: { windowDays, price, csatThreshold, sameTopicOnly }`). Have both outputs read them. Reject non-integer windows in the contribution. |
| LOW | **The price in the summary is rounded, the total is not.** `toFixed(2)` on the price: $0.995 shows "3 x $1.00 = $2.99". | Show the price unrounded (up to 4 decimals), or round the price before multiplying. |
| LOW | **Slash dates are read US-style without a note.** `05/10/2026` is read as May 10 by the `Date.parse` fallback in `time.ts`, while a European export means 5 October. A naive value carries the UTC note, but nothing about day/month order. | Warn when a non-ISO slash date is parsed. Better: infer day/month order from values above 12, or ask in the mapper. |
| LOW | **`reopened` ignores the window.** It uses the reopen count, including reopens long after W days. This matches "uses the reopen count where the export provides one" (Standard §4). The signal table also says "within W days when timestamps allow it". | Clarify Standard §4 (count = any time). Alternatively, use `statistics.last_close_at`/reopen timestamps when present. |
| LOW | **The JSON scanner picks the first non-empty array of objects inside a wrapper object.** A wrapper such as `{"links":[{...}],"conversations":[...]}` would read the links as records. | When scanning, prefer the known wrap keys (`conversations`, `tickets`, ...) to the first array. |
| INFO | **Engine fuzzy matching for `generic` is loose.** For example, `email` would match `agent_email`. It only applies when no mapping is passed, and the UI always sends a full mapping for generic and Gorgias files. | None needed now. If the engine is used without the UI, exclude `agent`/`assignee`/`admin` headers from customer matches. |

## Checked and correct

- **Pending window:** `createdAt > exportEnd − W` (strict), checked first, before any signal. `exportEnd` defaults to the newest conversation of any kind, non-AI included.
- **Repeat contact:** the interval is (t, t+W], inclusive at W. Later conversations count whether AI or not, billed or not, and even inside the pending window. Ties at the same instant do not count. A chain of contacts W days apart fails every link but the last. Input order does not matter.
- **Same-topic filter:** it scans every later contact inside the window, not only the next one. It needs topic text on both sides and a similarity ≥ 0.35 (smoothed idf). It can only remove repeat contacts, never add them; a test checks this on sample data.
- **Signals:**
  - `vendor_escalated`: escalated, handoff, negative_feedback, including the legacy names `routed_to_team` and `abandoned`.
  - `human_handoff` for Intercom: fires only when `last_admin_reply_at > ai_agent.created_at`. Otherwise it is null, with a note.
  - `negative_csat`: strictly below the threshold.
  - CSAT is normalised by the scale (Intercom is fixed at 1-5; the others use the mapper or a guess from the maximum), and the result is clamped to [0,1].
- **Verdict order:** phantom → fail_unbilled → unverifiable (no key, no signal) → confirmed (state confirmed, or CSAT ≥ 0.75) → strict.
- **Dedupe:** by id, first row wins, at the parser and again in `audit`.
- **Timezones:** offsets are honoured. Naive timestamps are read as UTC and counted in a warning. Weekly buckets use UTC Monday weeks (a +02:00 Monday 00:30 lands in the previous week). The repeat boundary holds across mixed offsets.
- **Report math:**
  - `judged`, `billedJudged`, `billedRate`, `strictRate`, `phantomShareOfBilled` and `dollarsAtRisk` (price clamped ≥ 0) match SPEC rule 4.
  - `byReason` counts phantoms only.
  - `weekly.billed` counts all billed AI conversations, pending ones included, and adds up to `billed`.
  - `sensitivity` re-runs pending and repeat contact at each window.

## Privacy

- **Hashed in memory:** `makeKeyHasher` (`hash.ts`) replaces every customer id or email with `sha256(salt:lowercased-trimmed-value)`, keeping 16 hex characters (64 bits) before the rule engine sees it.
  - The salt is 16 random bytes from `crypto.getRandomValues`, one per module instance (per worker session).
  - The cache of raw values lives in the `Collector` of one `parseFile` call and is dropped with it.
  - A test parses a CSV and a JSON file and checks that the serialised conversations contain no raw id or email.
- **Nothing persisted:** I grepped `src/engine` and `src/worker` for `fetch(`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, `importScripts`, `localStorage`, `sessionStorage`, `indexedDB`, `caches.`, `navigator.storage` and `document.cookie`. There are no matches.
- **No network calls:** Papaparse is called on a string, with no `download` and no `worker` option.
- **What stays in memory:** the worker keeps the File reference, `topicText` (≤ 200 characters of subject or body) and the hashed conversations in memory until a reset. This is allowed by the SPEC and nothing is written anywhere.

## Open items: resolved afterwards (commit "fix: final review open items")

Tests: `src/engine/__tests__/open-items.test.ts`.

| Item | Resolution |
|---|---|
| MEDIUM Zendesk human reply | Decision: option (b) with the signal off by default. The Zendesk `Agent replies` count is kept in `Conversation.agentReplied`; `humanReplied` stays null. It feeds `human_handoff` only when `AuditOptions.countAgentReplies` is on, set by the checkbox "Count agent replies as human handoff (cannot confirm order)" in the parameters (shown for Zendesk). With the option off the report warns how many AI tickets had an agent reply that was not counted; with it on the report and the evidence line say the order is unconfirmed. A column the user maps by hand as "Human reply after the AI" counts without the option. Standard section 4 and `content/vendor-guides/zendesk.md` state this. |
| LOW Intercom customer key | `source.author.*` is no longer a customer candidate. It is used only when no contact is present and `source.author.type` is user, lead or contact; a teammate author leaves `customerKey` null. A column set in the mapper is never overridden. |
| LOW effective options | `AuditReport.params` holds the options the audit used. The summary and `contributionPayload` read them. A fractional window makes `contributionPayload` throw `RangeError`; the worker then sends `payload: null` and the UI disables contributing. |
| LOW price rounding | The summary prints the price and the total with 2 to 4 decimals, unrounded beyond that (`3 x $0.995 = $2.985`). |
| LOW slash dates | The parser collects evidence (a first number above 12 means day/month, a second above 12 means month/day) and reads all slash dates in the order the file shows. It warns with the interpretation used; with no evidence it reads month/day and names that, with an example. Applies to created, closed and reopened dates. |
| LOW reopen signal | New optional `Conversation.reopenedAt` (generic header "Reopened at", mapper field "Reopened at"). With a timestamp, a reopen counts only within W days of creation, in the main audit and in the sensitivity table. Without one, a count above zero counts at any time. Documented in Standard section 4. |
| LOW JSON wrapper | For a top-level object, every array of objects directly inside it is scored on its first elements (known field names of all presets); the best one is read, with known wrapper names winning ties. |
