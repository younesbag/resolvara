# Zendesk app — independent review and fixes (2026-10-24)

Reviewer: independent Opus pass, read-only, given the code and the requirements (not the author's conclusions). Range `e2c70e9..2a29787`. All 13 findings were checked against the code by the lead and fixed.

| # | Sev | Finding | Fix | Test |
|---|---|---|---|---|
| 1 | high | Every raw ticket kept whole and cloned to the worker (~3 GB at 200k) | `slimTicket()` keeps only mapper fields on arrival; tickets created before the period dropped on arrival (`preDropped`) | fetcher.test "slims tickets on arrival" |
| 2 | med | An in-flight `audited` lands on the state after Start over / new file | `freshStart` invalidates `latestAudit`; run generation guard | — (UI state) |
| 3 | med | Cancel during the last export request left the UI stuck on "fetching" | that path now sets `paused`; Resume goes straight to the audit | — (UI state) |
| 4 | med | Stop during the reply check could leave the panel "running" | cancel caught inside the worker loop; no progress after cancel; UI ignores late progress | fetcher.test "after Stop…" |
| 5 | med | Tickets with an unknown order (or 404) were re-read on every run and ate the cap | `replyAttempted` set; never re-read; counted in the cap; note reports unknowns | fetcher.test "never re-reads…" |
| 6 | med | An end-user CC was taken for the AI agent → confident wrong `false` | only an explicit AI marker on the comment counts; otherwise `null` | map.test "a later end-user CC…" |
| 7 | med | Copied summary/email stated the tier proxy as real billing | `withBilledBasis()` adds the basis to the summary and the email | map.test "withBilledBasis" |
| 8 | low | Start over during the reply check polluted the fresh state | run generation guard | — |
| 9 | low | Dispute download could hang on a worker error | waiters reject on error; notice shown | — |
| 10 | low | Stale scoped copy beat a newer unscoped copy; window judged against the second export's end | newer `updated_at` wins; snapshot time = end of the AI export | map.test / fetcher.test |
| 11 | low | A Usage CSV for other dates silently unbilled tickets | `aiNotInUsageCsv` reported with guidance | map.test |
| 12 | low | Missing Resolution fields not reported | `fieldsMissing` shown in the billed panel and notes | map.test |
| 13 | low | Comment pass not paced | 700 ms minimum gap across both workers | fetcher.test "paces comment reads" |

Not changed: the parity test still gives the unscoped tickets metric sets (they never affect non-AI conversations, which are not judged). UI race fixes (2, 3, 8, 9) have no automated test; the app has no component test harness. Live check after the fixes in the trial Zendesk: API run, Start over, sample (19%) all correct.

Gates: 187 tests pass, `tsc` clean, `eslint apps/zendesk` clean, bundle has no fetch/storage/beacon calls and no personal email.
