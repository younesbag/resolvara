# Resolvara for Zendesk — app plan (2026-10-24)

Facts and sources: `docs/research/zendesk-app-research.md`. Goal: the audit runs **inside Zendesk** with no manual export, and the Zendesk Marketplace becomes a free distribution channel.

## Shape of the app
- **Client-side ZAF app, no backend.** Location `nav_bar` (full-page audit view); optional `ticket_sidebar` badge later ("this ticket was billed as resolved; the customer came back 2 days later").
- **Data path:** `client.request` (user's Zendesk session, no tokens stored) →
  1. `GET /api/v2/incremental/tickets/cursor?start_time=…&support_type_scope=ai_agent&include=metric_sets` (per_page ≤ 1000, 10 req/min, admin only) for AI-agent tickets: requester, created/solved, reopens, replies;
  2. the same for normal tickets of those requesters (repeat-contact signal);
  3. comments/audits only for AI tickets with agent replies (to prove a human replied **after** the AI);
  4. satisfaction ratings endpoint.
  Billed flag: `Resolution tier = Verified` as proxy; exact billed list only from the emailed Usage › Resolutions CSV, which the user can drop into the app (optional).
- **Engine:** reuse `src/engine` unchanged (shared package); results UI ported from the web app. Everything stays in memory; nothing persisted; no network except Zendesk's own API.
- **Not in the Zendesk app:** anonymous contribution / benchmark pooling (Developer Terms §3.6(iii) "no other Customer", §3.3(ii) benchmarking). The public website keeps its opt-in contribution for file uploads.
- **Name:** "Resolvara" only (names may not include "Zendesk").

## Phases
| Phase | What | Done when | Needs Younes |
|---|---|---|---|
| P0 Spike (1–2 days) | Test in a real Zendesk: Web Workers / memory / downloads inside the ZAF iframe; what `support_type_scope=ai_agent` returns; JSON shape of `Resolution type/tier`; incremental export via `client.request`; rate-limit behaviour on 50k tickets | written spike report with go/no-go per item | **a Zendesk trial/sandbox account** (I cannot create accounts) |
| P1 Legal clarity (parallel) | Email Zendesk partner support: is a client-side app that shows a customer only its own derived audit allowed under §3.6(iii)–(v)? Is a derived report a "bulk export"? Paid-app revenue share? | written answer | **send the email** (draft below) |
| P2 Build (≈1 week) | `apps/zendesk` (ZCLI React scaffold, Webpack 5), fetcher with progress + resume, engine integration, results view, dispute CSV, Usage-CSV drop-in, settings (window, price, count agent replies) | `zcli apps:validate` green; audit of the trial account matches the web tool on the same data | — |
| P3 Design partners (2–3 weeks) | Private/preview app shared by link to 3–5 support teams that pay Zendesk per resolution | ≥3 teams ran it; feedback logged | outreach under his English face |
| P4 Marketplace (1–3 weeks review) | Free public listing, screenshots, privacy text, support URL | listed | partner account (his) |
| P5 Later, only on demand | Scheduled monthly report (needs a backend → conflicts with "no persistent copies" §3.6(v); legal answer first) as the first paid tier | demand from ≥10 teams | pricing decision |

## Risks
- Developer Terms read narrowly could restrict even derived reports → P1 before P4.
- ZAF iframe limits (Workers, memory) could force batching or sampling → P0.
- Billed flag is only a proxy without the Usage CSV → label it clearly in the UI.
- Competition: Zendesk's own Usage dashboard and QA add-on; MaestroQA, Qvasa (QA/analytics); an Apify actor "Reconcile" ($0.49/audit, 3 users). No Marketplace app found that audits billed resolutions.
- Price conflict to re-verify: some snippets show $1.50 per Zendesk resolution; vendor-facts.md treats it as unpublished → keep price user-entered.

## Draft email to Zendesk partner support (for Younes to send)
Subject: Developer Terms question — client-side app that audits a customer's own AI-agent resolutions

Hello, we are building Resolvara, an open-source, client-side Zendesk app (no backend). It reads a customer's own tickets through ZAF `client.request` and shows that customer, inside their own Zendesk, how many AI-agent automated resolutions pass a stricter resolution test. Nothing is stored or sent outside the customer's account, and no data is combined across customers. Could you confirm this is allowed under the Developer Terms §3.3 and §3.6 (in particular §3.6(iii)–(v)), whether a downloadable CSV of the customer's own flagged ticket IDs counts as "bulk export", and what revenue share applies to paid Marketplace apps? Thank you.
