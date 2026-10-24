# Zendesk P0 spike — report (2026-10-24)

Account: Zendesk trial (14 days), admin role. App: `apps/zendesk-spike` (private ZAF 2.0, `nav_bar`), served by `zcli apps:server` and opened with `?zcli_apps=true` (Chrome needs the Local Network Access permission for localhost).

Run all checks: **10 PASS, 1 SKIP, 0 FAIL**.

| # | Check | Result | Evidence | Go/No-go |
|---|---|---|---|---|
| 1 | env | PASS | ZAF client initialised inside the iframe | GO |
| 2 | worker | PASS | classic and module Blob workers both run (16 ms) | GO — engine runs off the main thread as on the website |
| 3 | memory/compute | PASS | 200k synthetic conversations, 49,016 customers audited in 498 ms | GO — no batching/sampling needed at this size |
| 4 | download | PASS (no exception) | `a[download]` Blob click raised no error; the file landing on disk was not confirmed by hand | GO pending one manual click |
| 5 | storage | PASS | IndexedDB and localStorage available | GO (not needed: nothing is persisted) |
| 6 | api.me | PASS | role = admin | GO |
| 7 | api.ticketFields | PASS | system fields present on a fresh account (below) | GO |
| 8 | api.aiTickets | PASS (0 rows) | incremental cursor export with `support_type_scope=ai_agent` returns 200, 0 tickets | **BLOCKED** — no AI-agent conversations yet |
| 9 | api.normalTickets | PASS | 1 ticket (the sample ticket) | GO |
| 10 | api.ratings | PASS (0 rows) | satisfaction ratings endpoint returns 200 | GO |
| 11 | api.comments | SKIP | needs an AI ticket | **BLOCKED** |
| 12 | seed | not run | creates 5 fake normal tickets; does not create AI tickets, so it does not unblock 8/11 | — |

## Resolution fields (live, `/api/v2/ticket_fields.json`)
| Field | key | Options (label = API value) |
|---|---|---|
| Resolution type | `standard::resolution_type` | Automated = `zd_automated_resolution`; Assisted = `zd_assisted_resolution` |
| Resolution tier | `standard::resolution_tier` | Non-automated = `zd_resolution_tier_non_automated`; Assisted escalation = `zd_resolution_tier_assisted_escalation`; Contained resolution = `zd_resolution_tier_contained_resolution`; **Verified resolution = `zd_resolution_tier_core_resolution`** |
| Channel group | `standard::resolution_channel_group` | Digital = `zd_channel_group_digital`; Voice = `zd_channel_group_voice` |

**Finding fixed in the engine:** API values and ticket tags carry option *values*, and the billed tier's value is `core_resolution`, not "verified". `zendeskTier()` matched only the word "verified" (CSV labels), so API data would have fallen to `billed_unknown`. Now it also accepts `core_resolution` and maps `non_automated` to not-AI (test: `src/engine/__tests__/zendesk-api-values.test.ts`). The app should still resolve values to labels via the field's options for display.

Practical consequence: the billed proxy can be read from ticket tags too (`zd_resolution_tier_core_resolution`), which allows a Search API pre-count before a full export.

## Verdict
Platform risks from the plan (Workers, memory, downloads in the iframe; admin API access; field shape) are **cleared**. The only open item is the AI-data shape: the shape of `support_type_scope=ai_agent` rows with `metric_sets`, and whether comments let us prove "human replied after the AI". That needs real AI-agent conversations in the trial (launch the AI agent, hold 5–10 test chats through the messaging widget, solve some, reopen one, then re-run checks 8 and 11). Rate-limit behaviour at 50k tickets cannot be tested in a trial; P2 builds the fetcher with progress, backoff on 429/`Retry-After`, and resume.

P2 (build) can start in parallel; checks 8/11 confirm the mapping before the results view is finalised.
