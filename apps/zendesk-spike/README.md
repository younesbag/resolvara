# Resolvara P0 spike (Zendesk ZAF app)

Throwaway feasibility app for phase P0 in `docs/ZENDESK-APP-PLAN.md`. It runs checks inside a real Zendesk
account and produces one JSON blob that answers the P0 questions (Workers, memory, downloads, storage, and
what the Zendesk API returns for AI-agent tickets). Plain ZAF v2: no build step, no dependencies, no backend.

Privacy: results contain only key names, counts, ids, roles, timestamps, tags and resolution-field values.
Never ticket bodies, subjects, names or emails. Nothing is sent anywhere except Zendesk's own API
(through `client.request`, using the logged-in user's session).

## What you need

- A Zendesk **sandbox or trial** account (do not use a production account), with AI agents enabled if possible
  so `support_type_scope=ai_agent` returns something.
- You logged in to that account **as an admin** (the incremental export is admin-only).
- Node 18+ and a Chromium-based browser (Chrome/Edge).
- Chrome/Edge may ask for **Local Network Access** permission to `http://localhost:4567`: allow it.

## Steps

1. From the repo root, start the local app server (port 4567):

   ```
   npx @zendesk/zcli apps:server apps/zendesk-spike
   ```

   Leave it running. No `zcli login` is needed for the server.

2. In the same browser, open your Zendesk agent URL with the extra query parameter (replace `SUBDOMAIN`):

   ```
   https://SUBDOMAIN.zendesk.com/agent/?zcli_apps=true
   ```

   If the page asks to load scripts from localhost, allow it (Local Network Access prompt).

3. In the **left nav bar** click the **Resolvara** check-mark icon ("Resolvara P0 spike").

4. Click **Run all checks** and wait (about 10-30 seconds). Each check shows PASS / WARN / FAIL / SKIP with a
   summary and a collapsible JSON of details. Checks can also be re-run one by one.

5. **Check 4 (download) needs your eyes**: confirm that a file `resolvara-spike-test.csv` (5 rows) actually
   appeared in your browser's downloads. The check only proves that no exception was thrown.

6. Click **Copy results JSON** and paste it to Claude/Younes. If the iframe blocks the clipboard, the JSON is
   shown in the box at the bottom of the page: select all and copy it manually.

7. Optional, only if the account has no AI-agent tickets to test with: click **Create 5 test tickets**
   (check 12; it needs a second click to confirm; it is not part of "Run all"). It creates 5 tickets with fake
   requesters `test+1@example.com` ... `test+5@example.com`, subjects "Resolvara test ticket N" and the tag
   `resolvara_spike`. Real AI-agent resolutions can only come from the AI agent itself, so these tickets only
   exercise the normal-ticket paths.

8. Stop the server with Ctrl+C when done. To clean up, delete the tickets tagged `resolvara_spike` in Zendesk.

## The checks

| # | id | What it tells us |
|---|----|------------------|
| 1 | `env` | User agent, `crossOriginIsolated`, `deviceMemory`, opaque-origin/sandbox hints, storage quota, ZAF context |
| 2 | `worker` | Whether classic and module Web Workers can be created from a Blob URL in the ZAF iframe |
| 3 | `compute` | 200,000 synthetic conversations built, grouped by customer and sorted in a worker: time, completion, main-thread responsiveness (main-thread fallback if the worker fails) |
| 4 | `download` | Blob CSV + `<a download>` click: no exception (confirm the file manually) |
| 5 | `storage` | IndexedDB open/write/read/delete and localStorage |
| 6 | `api.me` | `GET /api/v2/users/me.json`: role (admin needed for the incremental export) |
| 7 | `api.ticketFields` | `GET /api/v2/ticket_fields.json`: fields whose title matches `/resolution\|channel group\|ai/i` with id, type, options |
| 8 | `api.aiTickets` | Incremental cursor export, last 90 days, `support_type_scope=ai_agent`, `include=metric_sets`, `per_page=100`: count, key names, first 3 tickets' shape, resolution field ids/values, rate-limit headers, errors verbatim |
| 9 | `api.normalTickets` | Same without `support_type_scope`: count and key names |
| 10 | `api.ratings` | `GET /api/v2/satisfaction_ratings.json?per_page=10`: count and key names |
| 11 | `api.comments` | First AI ticket's comments: author roles in order (via `/api/v2/users/{id}.json`) and timestamps, no bodies |
| 12 | `seed` | Manual only: creates 5 fake test tickets |

Check 7 is intentionally broad: the regex contains `ai`, which matches many unrelated field titles. Look at the
`matched` list for the real Resolution type / Resolution tier / Channel group fields.

## Notes

- `apps:validate` (and `apps:create` / `apps:update`) call the Zendesk API and need `zcli login`; they were
  not run for this spike. `apps:server` is purely local.
- The `private: true` manifest and the name "Resolvara P0 spike" are fine for a private test install, not for the
  Marketplace (P4).
- Everything runs in memory; the only thing written to browser storage is a throwaway IndexedDB database and a
  localStorage key that check 5 deletes again.
- The nav icon (`assets/icon_nav_bar.svg`) uses `currentColor`; if it renders invisible in the nav bar, change the
  stroke to a fixed color.
