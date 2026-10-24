# Zendesk Marketplace app for Resolvara: research

All facts seen on **2026-10-24** via WebFetch/WebSearch (no sign-ups, no posts). Quotes are 25 words or fewer. Tags: **[C]** confirmed on a primary Zendesk page I read; **[S]** search-engine summary of a primary page I did not open; **[3P]** third-party or competitor-authored; **[U]** unconfirmed (do not hard-code). Not legal advice.

Context read first: `docs/research/vendor-facts.md` (Zendesk section) and `docs/SPEC.md` (engine runs in the browser, `Conversation` fields).

---

## 1. Zendesk Apps Framework (ZAF) today

**Locations (Support).** [C] https://developer.zendesk.com/api-reference/apps/apps-support-api/introduction/ lists: `ticket_sidebar`, `new_ticket_sidebar`, `ticket_editor` (icon), user sidebar, organization sidebar, custom object record sidebar, `nav_bar` (icon, left bar), `top_bar` (icon, top right), `background` ("no UI and runs continuously to receive special events"), and modal. `nav_bar`, `top_bar`, `ticket_editor` each need an SVG icon in `assets` [S]. Ticket sidebar width is fixed at 320px; only apps on the ticket page can read/set ticket properties (https://developer.zendesk.com/documentation/apps/app-developer-guide/manifest/ [C]). Modals: Support only; recommended max 80vw x 80vh (https://developer.zendesk.com/documentation/apps/app-developer-guide/using-the-apps-framework/ [C]).
- **Fit for Resolvara:** `nav_bar` (full-page audit view) is the natural home. `top_bar` or a modal are alternatives. `ticket_sidebar` is only useful for a per-ticket "would this be a phantom resolution?" badge.

**Runtime.** [C] "Apps run in iframes in the product" (https://developer.zendesk.com/documentation/apps/app-developer-guide/glossary). The SDK loads from `https://static.zdassets.com/zendesk_app_framework_sdk/2.0/zaf_sdk.min.js` (auto-updates within 2.0). An app is client-side if the manifest points to a local HTML file, server-side if to a remote URL [S] (https://developer.zendesk.com/documentation/apps/app-developer-guide/deploying/).

**Calling Zendesk APIs.** [C] https://developer.zendesk.com/documentation/apps/app-developer-guide/making-api-requests-from-a-zendesk-app/
- `client.request({url:'/api/v2/...'})` returns a Promise. For Zendesk APIs, "the client uses the browser's Zendesk session cookie" and only the path goes in `url`. Zendesk API calls always run in the browser and never use the proxy.
- Rate-limited Zendesk calls are auto-retried by ZAF after a delay; `autoRetry:false` disables it.
- No binary upload or download through `request()`.
- Blocked APIs: Chat, Conversations, Sales CRM Search/Firehose (irrelevant to Resolvara).
- **No payload-size or timeout limit is documented** on that page [U].
- External hosts go through a Zendesk proxy by default (`cors:false`); `cors:true` goes straight from the browser, with no secure settings, OAuth or JWT. Secure settings are only available through the proxy, need `domainWhitelist`, and are capped at 1,024 characters. The target must allow Zendesk IPs and have a full certificate chain. The ZCLI server does not support secure settings.
- **Resolvara needs none of this.** The data source is Zendesk itself and the engine is local, so there are no external calls and no secrets.

**Limits.** [C] https://developer.zendesk.com/api-reference/introduction/rate-limits/ (requests per minute, Support/Help Center API): Team 200, Professional 400, Enterprise 700, Enterprise Plus 2,500, High Volume add-on 2,500. **Incremental Export API: 10/min** (30 with the add-on). Counts are per account, so they are shared with the customer's other integrations.

**Web Workers, big in-memory processing, CSP.** [U] No Zendesk doc states the iframe's sandbox flags or CSP. Indirect evidence:
- The app iframe is served from `apps.zdusercontent` with a `sandbox` attribute lacking `allow-modals` (community thread, 2022, no resolution seen): https://support.zendesk.com/hc/en-us/community/posts/5101680135962-allow-modals-for-Iframe-within-apps-zdusercontent [3P/S].
- Web Workers in a sandboxed iframe without `allow-same-origin` have been buggy in some browsers (WebKit bug 170075, https://bugs.webkit.org/show_bug.cgi?id=170075, marked fixed, date unknown) [S].
- **Action: one-day spike.** Build a hello-world ZAF app that (a) spawns a module Worker from a bundled file and from a Blob URL, (b) parses a 200 MB CSV in memory, (c) uses IndexedDB and `localStorage`, (d) triggers a Blob download. Fall back to chunked main-thread processing (the engine is pure TS) if Workers fail. A browser download may also be blocked without `allow-downloads` [U].

**Tooling.** [C] https://developer.zendesk.com/documentation/apps/app-developer-guide/zcli/
- `zcli apps:new` (add `--scaffold=react` for the Zendesk React scaffold), `zcli apps:create <dir>` (validate, package, install as a private app), `zcli apps:validate`, `zcli apps:package <dir>` (runs validation, writes a ZIP to `tmp/`), `zcli apps:server` (port 4567, add `?zcli_apps=true` to a ticket URL; no secure settings).
- Private upload needs Suite Growth+ or Support Professional+ (https://developer.zendesk.com/documentation/apps/app-developer-guide/deploying/ [C]).
- The official scaffold (https://github.com/zendesk/app_scaffold) uses **Webpack 5**, Node >= 18.12.1 [C]. A Vite template is [U]. Vite should work, since ZAF only needs `manifest.json`, `assets/iframe.html`, `translations/en.json` and static assets, but I did not find official support. Manifest `private` must be `false` for Marketplace submission [C].

---

## 2. Getting the audit data from inside the app

| Audit need | Endpoint (all via `client.request`) | Notes / limits |
|---|---|---|
| Ticket list, requester id, created/solved/status, tags, CSAT summary | `GET /api/v2/incremental/tickets/cursor` (+ `include=metric_sets`) | See below |
| Reopen count, solved_at, public replies | Ticket metrics: `reopens`, `replies`, `solved_at`, `full_resolution_time_in_minutes`, `latest_comment_added_at` | `GET /api/v2/ticket_metrics` (cursor, max 100/page, **excludes archived tickets**) or sideload `metric_sets` [C] https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_metrics/ |
| Satisfaction | `GET /api/v2/satisfaction_ratings` (`score` good/bad/offered/unoffered, `ticket_id`, `requester_id`, `created_at`); cursor [C] | Page says it covers legacy CSAT; newer CSAT survey responses are a separate API [C] https://developer.zendesk.com/api-reference/ticketing/ticket-management/satisfaction_ratings/ |
| Human reply AFTER the AI | Per ticket: `GET /api/v2/tickets/{id}/comments` (`author_id`, `created_at`, `public`, `via`; 100/page) [C]. Bulk: ticket events export with `include=comment_events` (full comment data in `child_events`) [C] | Need a user-role lookup to tell agent from end user from bot. No AI-agent marker found on the comments endpoint [U]. Per-ticket calls cost one request each and are the slow path. |
| Audits | `GET /api/v2/tickets/{id}/audits` (cursor, 100/page, `filter_events[]`) | Page says the all-audits endpoint "should not be used for capturing change data"; use Incremental Ticket Events [C] https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/. `last_audits` is not supported on incremental endpoints [C]. |

**AI-agent resolution data.**
- **AI-agent tickets are hidden by default.** [C] https://support.zendesk.com/hc/en-us/articles/9204149016346: "By default, these exclude AI agent tickets", retrievable with `?support_type_scope=ai_agent` on `/api/v2/tickets` and `/api/v2/incremental/tickets`. The incremental export page confirms `support_type_scope` accepts `all`, `agent`, `ai_agent`, default `agent` [C]. Resolvara must request `ai_agent` (or `all`) or it will see nothing. What exactly `ai_agent` returns (AI-only vs any AI involvement) is [U].
- **Fields.** `Resolution type` (value "Automated" when an automated resolution is consumed) and, since the 2026-05-18 change, `Resolution tier` (Assisted escalation / Contained resolution / Verified resolution) and `Channel group` (Digital/Voice) are ticket fields [C] https://support.zendesk.com/hc/en-us/articles/10677925692698-Announcing-changes-to-AI-agent-reporting. Tiers also appear in the ticket event log. In Explore, AI-agent tickets are excluded "except for the Resolution type field" [C]. For voice AI agents, resolution types "are not populated" [C].
- **Unconfirmed:** how these fields serialize in the API (field ids in `/api/v2/ticket_fields`, or as custom fields on the ticket / event objects), and the status of the legacy tag `ai_agent_automated_resolution`. I found no deprecation notice; the tag article is https://support.zendesk.com/hc/en-us/articles/5352026794010 (platform "prior to resolution tiers"). **Spike on a sandbox account to confirm.**
- **Billed resolutions list (Usage > Resolutions): no API found.** [C] The only documented path is Admin Center > Account > Usage > Resolutions > "Export contributing resolutions": CSV (ticket ID, tier, channel group, brand, resolution timestamp, cost), emailed, link valid 14 days (https://support.zendesk.com/hc/en-us/articles/10479485915290-Managing-resolution-usage). The monitoring article (https://support.zendesk.com/hc/en-us/articles/8922391373978) also describes UI only. A programmatic Usage endpoint is [U] (searches found none).
  - **Design consequence:** the "billed" flag must come from (a) the usage CSV the admin uploads into the app (join on ticket ID), or (b) the ticket's `Resolution tier = Verified` / `Resolution type = Automated` in API data as a proxy. Offer both.

**Bulk history: Incremental Export API.** [C] https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/
- `GET /api/v2/incremental/tickets/cursor?start_time=<epoch>` first, then `cursor=` (response gives `after_cursor`, `end_of_stream`). `per_page` up to 1,000 (default 1,000); reduce on timeouts.
- **Admins only.** Rate limit 10 requests/minute (30 with High Volume add-on) [C]. `start_time` must be more than one minute old; the latest minute is excluded. `exclude_deleted=true` available. Sideloads: `include=metric_sets`; events export supports `include=comment_events`.
- No retention limit stated for `start_time` [U]. Ticket field list in the export is not on that page [U]; Zendesk documents `satisfaction_rating`, `tags`, `requester_id` on the ticket object elsewhere, not re-verified here.
- My arithmetic (not from Zendesk): at 1,000 per page and 10 req/min, a 100k-ticket history is about 10 minutes for tickets; events with comments multiply rows several-fold, so budget tens of minutes and show progress.
- **Callable from `client.request`?** [U, likely yes]. The doc says Zendesk API calls from ZAF run in the browser with the user's session; the incremental endpoints are ordinary `/api/v2/...` paths. The admin-only restriction means non-admin agents will get 403: gate the app with a role check or message. Needs a spike.

**What this means for the engine's `Conversation`:** `customerKey` = `requester_id`; `humanReplied` = derive from comments/events ordered after the last AI comment (else `agentReplied` with the `countAgentReplies` option, which the engine already supports); `reopenCount` = `metric_sets.reopens`; `csat` from satisfaction ratings; `billed` from usage CSV or Verified tier; `vendorState` = `verified` / `contained` / `escalated` from `Resolution tier`.

---

## 3. Marketplace: private vs public, review, paid, backend, branding

**Distribution paths.** [C] https://developer.zendesk.com/documentation/marketplace/publishing-to-the-marketplace/submit-your-app/
- **Public:** listed and discoverable.
- **Preview:** not discoverable, shared by link to selected accounts via the Availability tab. Good for early adopters.
- **Private:** manifest default, installable only in the developer's own account. Customers can run their own private apps without review; [C] "This does not apply to private apps built by customers for their own internal use" (https://support.zendesk.com/hc/en-us/articles/9590471542170-Developer-update-Enhanced-security-guidelines-for-third-party-apps-integrations-and-bots). Anything distributed to multiple customers must go through Marketplace review (same article, 2025-08-12).
- A self-hostable "download the zip and upload it as a private app" route for customers is technically possible (it is their own internal app), but Developer Terms §2.1 says distribution to other customers needs Zendesk approval [C]. Treat zip-sharing to third parties as risky [interpretation].

**Review.** [C] Register the organization on the developer portal; upload a ZIP (automatic checks; red errors block, yellow are advisory); answer compliance questions; accept terms. "Expect 1 to 3 weeks for new apps and 1 to 2 weeks for updates"; approved listings go live by 10am PST the next day. Rejected: fix and use Submit Update. Profile is reviewed with the first submission (https://developer.zendesk.com/documentation/marketplace/publishing-to-the-marketplace/create-a-zendesk-marketplace-profile/).
- **Listing disclosure:** must "Disclose in the listing what Zendesk data the app accesses and why" [C] https://developer.zendesk.com/documentation/marketplace.
- **Security review:** no pre-listing pentest requirement found [U]. Developer Terms §3.7 lets Zendesk run periodic Security Assessments (7 days' notice where practicable) and says that if any part runs outside Zendesk systems it may include remote testing [C].

**Backend needed?** Not for a client-side ZAF app. Server-side calls to Zendesk APIs from your own server require a **global OAuth client** (refresh-token flow mandatory for global OAuth clients from 2026-01-31) plus custom headers `X-Zendesk-Marketplace-Name / -Organization-Id / -App-Id`; customers' API tokens or basic auth may not be used [C]. **The header requirement "doesn't apply to API requests from apps using the Zendesk Apps framework"** [C] https://developer.zendesk.com/documentation/marketplace/building-a-marketplace-app/request-header-requirements-for-marketplace-apps/. So a pure client-side app avoids OAuth, headers and any server, which also keeps data off Resolvara servers (matches §3.6 below).
- Extra rules apply to "autonomous AI ticketing agents" (stream all messages, dedicated bot agent account) [C]. Resolvara is not one.

**Paid apps.** [C] https://developer.zendesk.com/documentation/marketplace/publishing-to-the-marketplace/set-up-paid-app-or-theme/
- Billing through **Stripe** (connect via Zendesk's Stripe app, get a Stripe Integration ID); models: one-time, per account/month, per agent/month; recurring USD prices; trial 1-90 days (card required); Stripe Tax and 3DS required; Zendesk disables the app while an invoice is unpaid; refunds through Stripe.
- **Revenue share: not stated** on any page I read [U]. Developer Terms §4.3: "Zendesk bears no financial responsibility" for Purchase Fees and may initiate refunds taken from your Stripe account; §4.4: Zendesk may charge fees "at its sole discretion" at listing or on 10 days' notice [C]. The rate (if any) must be asked of Zendesk partner support.
- Per-agent pricing fits poorly for an audit tool used by one admin a month; per-account/month or one-time fits better. Also, outside-pricing arrangement: "If your app requires an external subscription or extra fees, you must provide a URL with pricing details" [C], so selling the Pro tier via your own site is allowed but must be disclosed.

**Branding / trademark.** [S] https://developer.zendesk.com/documentation/marketplace/building-a-marketplace-app/create-app-brand-assets/: app names must not use Zendesk trademarks "or anything that might be construed as related to Zendesk", must not include descriptive adjectives, and icons may not use Zendesk marks. [C] Developer Terms §2.2: no license to Zendesk Marks; use must follow Trademark Usage Guidelines (https://www.zendesk.com/company/tmguidelines). **Name the app "Resolvara"** (not "Resolvara for Zendesk"). Descriptive references in the listing text ("works with Zendesk AI agents") are normal but check the guidelines and let the reviewer flag them.

---

## 4. Developer Terms: what binds an app that audits AI-agent billing

Source read in full: **Zendesk Developer Terms, Effective Date August 12, 2025** (formerly "Application Developer and API Agreement"), https://www.zendesk.com/company/agreements-and-terms/zendesk-developer-terms/ (WebFetch returned 403; I downloaded the HTML with curl and parsed the text). The older URL `.../application-developer-and-api-license-agreement/` serves the same page. Note: the "Licensee" definition includes a Customer using the APIs "solely for its internal purposes" [C], so the data clauses bind private apps too.

| § | Text (<=25 words) | Meaning for Resolvara |
|---|---|---|
| 3.3(ii) | "monitor the availability, performance, or functionality of any API or the Services, including for any similar benchmarking purposes" | Targets monitoring/benchmarking of Zendesk's own API/Services. Auditing whether *billed resolutions were real* is arguably about the customer's tickets, not API performance. But a Zendesk reviewer could read "monitor ... functionality of the Services" broadly [interpretation]. Never market it as "benchmark Zendesk AI agent performance/quality across customers". |
| 3.3(iv) | "repackage or resell the Services, APIs, or API Data" | Do not sell dataset access. |
| 3.3(v) | "circumvent any Service Plan, Agent licensing, pricing, or scope of use restrictions (including ... pricing related to Automated Resolutions)" | Explicitly names Automated Resolutions pricing. A tool that helps dispute a charge is not circumventing, but do not offer features that suppress/avoid metering. Wording of the listing matters. |
| 3.6(i) | "provide a conspicuous privacy notice that clearly discloses to Customers how API Data is accessed, used, stored, and shared" | Required; a "100% local, nothing leaves your browser" notice is the ideal content. |
| 3.6(ii) | "limit its access, use, and storage of API Data to the minimum extent necessary ... and promptly delete API Data once the specific need is met" | Read only needed fields; do not retain after the run. Skip transcripts unless a check needs them. |
| 3.6(iii) | "not use API Data for any purpose other than to provide its Application functionality to the specific Customer associated with the API Data" | **Hard stop for pooling.** Parenthetical: "(and no other Customer or other third party)". Also bars creating, training or improving "any general AI model". |
| 3.6(iv) | "not directly or indirectly use the APIs to develop Applications that allow bulk export of API Data" | Risk: a "download CSV of all conversations" button. Export only derived verdicts/IDs, not raw API Data [interpretation]. |
| 3.6(v) | "not create persistent copies, archives, indexes, or long-term data stores using API Data" | Keep data in memory for the session. Persisting raw API Data to IndexedDB/localStorage is risky; persisting the user's own settings is fine [interpretation]. Resumable multi-hour pulls need care. |
| 3.6(vi)(b) | "disclose API Data to any third party, except as authorized by the Customer and disclosed in the Application privacy notice" | No telemetry carrying ticket content. |
| 2.1 | Applications for multiple Customers must be submitted for review | Public/preview listing is mandatory for other customers. |
| 3.7 | Zendesk "may ... perform periodic Security Assessments" | Expect scrutiny of any hosted part. |
| 4.4 | "Zendesk reserves the right to charge fees ... related to any aspect of the Marketplace" | Revenue share can change on 10 days' notice. |

**Allowed (low risk): app shows a customer their own data locally.** Client-side ZAF app, reads via `client.request`, computes in the browser, shows results to the same admin, deletes data on close, ships a privacy notice, no server, no raw export. This is "provide its Application functionality to the specific Customer" (§3.6(iii)), minimal and transient (§3.6(ii),(v)). Open interpretation points: whether the PDF/CSV report of flagged conversations counts as "bulk export" (§3.6(iv)) and whether session-long in-memory storage of tens of thousands of tickets is a "long-term data store" (§3.6(v)); email Zendesk partner support before submission.

**Not allowed: pooling anonymous aggregates from the Zendesk app.** Even de-identified aggregates derived from API Data and sent to a shared benchmark use the data "for a purpose other than ... that specific Customer" and benefit "other Customer[s]" (§3.6(iii)). The text prohibits sanitizing for AI-model training explicitly, but the "(and no other Customer or other third party)" limit is not limited to model training. The Terms contain no carve-out for aggregation/de-identification that I could find. Also `/benchmark` marketing built on Zendesk-derived numbers would invite a §3.3(ii) "benchmarking" reading.
- **Safe architecture:** the Zendesk app has no "contribute" button and sends nothing. Benchmark contributions come only from the standalone web tool where the user uploads their own export file (their own admin-exported CSV, not pulled by our app through the API). Whether a human-exported CSV is "API Data" ("all data accessible ... through the APIs, including Service Data") is [U] and arguably yes in substance; keep Zendesk-sourced figures out of the public benchmark unless Zendesk confirms in writing.

---

## 5. Who already sells AI-agent analytics/QA in the Zendesk Marketplace

Coverage is incomplete: Marketplace pages return 403 to my fetcher and are JS-heavy; I found no listing that audits **billed** automated resolutions. Confirm by browsing the Marketplace manually.

| Name | What it measures | Pricing | Source |
|---|---|---|---|
| **MaestroQA** (Support) and **MaestroQA Lite** | AI-classifier QA of agent tickets, scorecards, coaching dashboard; Lite 100+ installs | Not published; contact vendor | https://www.zendesk.com/marketplace/apps/support/102630/maestroqa/ , https://www.zendesk.com/dk/marketplace/apps/support/108397/maestroqa-lite-app/ [S] |
| **Qvasa** (app id 930314) | Live queue/AHT/CSAT dashboards, threshold alerts, AI QA, sentiment, bot deflection and hand-off analytics for Zendesk AI agents | Marketplace price shown "Free" with 50+ installs [S]; plans Free / $10 / $20 per agent per month [3P, Macha] | https://www.zendesk.com/dk/marketplace/apps/support/930314/qvasa/ [S]; https://www.getmacha.com/blog/best-analytics-qa-ai-tools-for-zendesk-in-2026-complete-guide [3P, competitor-authored] |
| **Zendesk QA add-on (native)** | Reviews 100% of conversations across human and AI agents, "QA for AI agents" | Not published standalone; ~$35/agent/month is a third-party estimate [3P] | https://www.zendesk.com/service/ai/customer-service-agents/ and pricing snippets [S] |
| **Zendesk native Usage > Resolutions dashboards** | Allowance usage %, tier spend, ticket-level trace and CSV export of contributing resolutions | Included | https://support.zendesk.com/hc/en-us/articles/10479485915290 [C] |
| Kaizo, SentiSum, Geckoboard, Miuros | QA/sentiment/KPI dashboards; Marketplace presence not confirmed | Kaizo unpublished; SentiSum from $100k/yr; Geckoboard $79-$319/mo [3P] | Macha post above |
| **Reconcile** (Apify actor "Zendesk AI Billing & Outcome Auditor") | The closest to Resolvara: reconciles billed Resolution Allowance rows against sanitized outcome evidence and a reopen-window policy; not a Marketplace app | $0.49 per audit; 3 total users | https://apify.com/factrelay/reconcile [C page, tiny usage] |

Takeaway: no confirmed Marketplace app audits billed vs. strictly-resolved AI conversations; existing apps are QA/analytics. The nearest functional competitor is a niche Apify actor plus Zendesk's own CSV export. Price anchors seen: Zendesk's per-resolution price is shown as $1.50 on current Zendesk pricing snippets [S, conflicts with vendor-facts.md which marked it unpublished; re-verify before hard-coding]; vendor-facts.md's $1.50/$2 numbers are [U].

---

## Risks and recommended next steps

1. **Spike (1-2 days):** sandbox account, hello-world `nav_bar` app. Verify: Workers, large memory, downloads, IndexedDB; incremental cursor export from `client.request` as admin and as non-admin; `support_type_scope=ai_agent` semantics; how `Resolution tier`/`Resolution type`/tag appear in JSON.
2. **Ask Zendesk partner support** (single email): revenue share; whether read-only client-side audit with a local CSV report meets §3.6(iv)/(v); whether pooled anonymous aggregates from user-uploaded CSVs are tolerated; naming of the listing.
3. **Design rules:** no server, no telemetry, no persistence of raw API Data, derived-only export, privacy notice text, `Resolvara` name only.
4. **Timeline:** build + spike ~1 week, Marketplace review 1-3 weeks (new app) [C]; use a preview app link for early adopters meanwhile.
5. Re-verify before shipping: per-resolution price, revenue share, any Usage API.
