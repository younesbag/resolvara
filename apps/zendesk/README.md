# Resolvara for Zendesk

A private Zendesk Support app (ZAF 2.0, location `support.nav_bar`) that audits the account's own AI-agent
tickets with the Resolvara engine in `src/engine`. It runs entirely in the browser: no backend, nothing
persisted, no network except Zendesk's own API through ZAF `client.request`.

Plan and rationale: `docs/ZENDESK-APP-PLAN.md`. Feasibility results: `docs/P0-SPIKE-REPORT.md`.

## Two data sources

The intro screen offers both; they end in the same results view, parameters, dispute CSV and summary.

1. **Read from this Zendesk.** Period 30, 60 or 90 days. The app reads the ticket fields, the AI-agent
   incremental export (`support_type_scope=ai_agent`, with metric sets) and the unscoped export (for
   repeat contacts). Extra for this source only: the Usage CSV override for "billed" and the "Check reply
   order" pass.
2. **Upload an export file.** Same path as the website: Zendesk CSV, Intercom, Ada, Gorgias, generic CSV or
   JSON, or the built-in sample data. The format is detected; a select lets you change it, and the engine's
   parse warnings (for example columns it could not map) are shown in the notes. The website's column mapper
   is not part of this app.

## Build

```
npm run zendesk:build
```

`apps/zendesk/build.mjs` does three things: bundles `src/worker.ts` to an IIFE string, bundles `src/main.tsx`
(React 19) to `assets/app.js` with that string injected (the page starts the worker from a Blob URL, because a
URL to an asset file would be cross-origin inside the ZAF iframe), and compiles `src/app.css` with the
Tailwind v4 CLI to `assets/app.css`. The built assets are committed because Zendesk serves the `assets`
folder as it is.

`src/app.css` copies the design tokens and component classes from `src/app/globals.css`; keep them in sync by
hand. The results view reuses `BigNumbers`, `ReasonBars`, `WeeklyChart`, `SensitivityTable` and `FlaggedTable`
from `src/components/auditor` unchanged.

Tests: `npx vitest run` (the config includes `apps/zendesk/src/**/*.test.ts`).

## Run locally

```
npx @zendesk/zcli apps:server apps/zendesk
```

Then, in the same browser, open

```
https://<subdomain>.zendesk.com/agent/apps/resolvara?zcli_apps=true
```

Chrome asks for Local Network Access to `localhost:4567`: allow it. Sign in as an **administrator**: Zendesk
only lets admins read the incremental ticket export.

Validate the package: `npx @zendesk/zcli apps:validate apps/zendesk`.

## What data is read

Only through `client.request`, using the signed-in user's own session (no token is stored or asked for):

- `GET /api/v2/ticket_fields.json` to find the Resolution tier and Resolution type fields.
- `GET /api/v2/incremental/tickets/cursor.json?start_time=...&per_page=1000`, twice: with
  `support_type_scope=ai_agent&include=metric_sets`, and unscoped.
- Optional, on a button press: `GET /api/v2/tickets/{id}/comments.json?include=users` for AI tickets whose
  metric set shows agent replies, to prove a human replied after the AI.

Customer identifiers are replaced by a salted hash inside the worker before any rule runs; the salt is random
per page session. Ticket subjects are used only in memory for the optional same-topic test.

## Privacy guarantees

- Everything runs in this tab. Nothing is sent to Resolvara or any third party.
- Nothing is written to storage: no localStorage, IndexedDB, cookies or files, except the two files the user
  asks for (dispute CSV, and the copied summary).
- No anonymous contribution and no benchmarks. The Zendesk Developer Terms forbid combining data across
  customers, so this app has no such feature. The public website keeps its own opt-in for uploaded files.
- A failed or cancelled run keeps what it read in memory so **Resume** can continue; closing the tab discards it.

## Known limits

- **Billed is a proxy by default.** A conversation counts as billed when its Resolution tier is "Verified
  resolution" (`zd_resolution_tier_core_resolution`). The exact billed list is only in the Usage, Resolutions
  CSV that Zendesk emails from Admin Center. Drop it into the app to replace the proxy; the app shows which
  column it used and how many ids matched an AI conversation in the period.
- **Reply-order check is capped.** It reads one comments request (or more) per ticket, two at a time, default
  cap 500 tickets, newest first. The app reports how many were skipped. Without it, agent replies count as
  human handoff only if "Count agent replies without order proof" is on.
- **Rate limit.** The incremental export allows 10 requests a minute, so the app spaces export requests at
  least 6.1 seconds apart (about 10,000 tickets a minute) and waits `Retry-After` on a 429. Large accounts
  therefore take minutes, not seconds.
- **Admin only.** A non-admin gets a 403 and a clear message.
- **Not yet confirmed on real AI-agent tickets:** how Zendesk marks AI-agent comments (P0 checks 8 and 11 are
  pending). When the AI comment cannot be told apart, the order check answers "unknown" and the audit falls
  back to the reply count.
- The author email in `manifest.json` is a placeholder (`hello@resolvara.com`); replace it before submitting
  to the Marketplace.
