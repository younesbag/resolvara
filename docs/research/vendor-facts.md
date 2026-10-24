# Vendor facts: AI support agents billed "per resolution"

All facts seen on **2026-10-24** (WebFetch/WebSearch only; no sign-ups, no Exa). Quotes are <=25 words. Where a fact came only from a third-party blog it is labelled "third-party". "Unconfirmed" means I could not verify it on a primary source.

Confidence legend: **H** = primary vendor doc/spec read directly; **M** = primary doc partly read or primary + conflicting third-party; **L** = mostly third-party / sales-gated.

## (a) Summary table

| Vendor | Price unit | Price (seen 2026-10-24) | Vendor's definition of billed unit | Assumed (silence) billed? | Export path | Key fields | Conf. |
|---|---|---|---|---|---|---|---|
| Intercom Fin | per "outcome"/resolution | $0.99; min monthly commitment e.g. 50 outcomes (pricing page); help article says $49/mo sub incl. 50 resolutions | Confirmed OR assumed resolution (customer leaves without asking more) | **Yes** | Reports > Dataset export (CSV, 13 datasets); Conversations API; S3 export | `ai_agent_participated`, `ai_agent.resolution_state` (assumed_resolution/confirmed_resolution/escalated/negative_feedback/procedure_handoff/null), `statistics.count_reopens`, `conversation_rating.*`, `ai_agent.rating` | H (API) / M (CSV columns) |
| Zendesk AI agents | per "Verified resolution" (since 2026-05-18), paid from a $ allowance | Per-resolution price **not published** on pages I could read; third-party $1.50 committed / $2 PAYG (unverified, possibly pre-May-2026) | LLM-verified: AI handled to completion, no further help requested; messaging ends 2h after first msg (extendable to 72h), email 72h | Silence-based (no further customer request) but must pass LLM check; "Contained" tier not billed | Admin Center > Usage > Resolutions > "Export contributing resolutions" (CSV by email); ticket fields in Explore/API | Ticket fields `Resolution type`, `Resolution tier`, `Channel group`; legacy tag `ai_agent_automated_resolution` | M |
| Gorgias AI Agent | per automated interaction | $0.90 annual / $1.00 monthly; overage $1.50; also counts as a helpdesk ticket | "fully resolved without a human agent"; human reply within 72h => billed only as ticket | Yes (no human within 72h) | Inbox view > Export tickets (CSV by email); Analytics drill-down export | See section; **no AI-specific column documented** | M |
| Salesforce Agentforce (Service) | per conversation / Flex Credits / per user | $2 per conversation; Flex Credits $500 per 100k (20 credits/action); $125/user/mo unmetered employee add-on | "Conversation" - **not defined** on pages read (unconfirmed) | N/A (not resolution-based) | Data Cloud session tracing DMOs | `AiAgentSessionId`, `AiAgentInteractionType`, `StartTimestamp`, `EndTimestamp`, `IndividualId` | M/L |
| HubSpot Customer Agent | per resolved conversation (credits) | $0.50 = 50 credits per resolved conversation (since 2026-04-14); $1 per lead recommended (Prospecting) | Reply with content source/action AND no qualifying handoff within 72h of last visitor msg; or lead qualified | **Yes** (72h silence) | UI: Service > Customer Agent > Analyze > Reports; export **unconfirmed** | Thread status/closed date via Conversations API; no documented resolution property | M |
| Freshworks Freddy AI Agent | per session (NOT per resolution) | $49 per 100 additional sessions; first 500 free once per account | Session = "unique interaction between an end-user and an AI Agent"; email session = 72h window | N/A: billed regardless of outcome | Freshservice reports (resolved/converted/intervened/unanswered); Freshchat session CSV unconfirmed | n/a documented | M |
| Help Scout AI Answers | per resolution | $0.75 | "single AI chat session that is resolved without help from a human" | Yes (customer doesn't ask more) | Reports > Scout (view only); export unconfirmed | n/a | M |
| Decagon | per conversation (default) or per resolution | Not published; contractual | Not published; "arguing over what a resolution is" is something they avoid | Unknown (contract) | Unconfirmed (enterprise) | unconfirmed | L |
| Sierra | per outcome | Not published | "clear, agreed-upon criteria for each outcome upfront"; unresolved "in most cases" free | Unknown (contract) | Unconfirmed | unconfirmed | L |
| Ada | per automated resolution (enterprise option) / conversation-based | Not published | Resolved = relevant + accurate + safe + contained (LLM-classified) | Idle conv ends after 24h (chat) / 72h (email), then classified | Data Export API (conversation object) | `automated_resolution_classification`, `..._reason`, `end_user_id`, `csat`, `is_escalated`, `handoffs`, `date_created` | H (fields) / L (price) |
| Tidio Lyro | per Lyro conversation (resolution billing only on Premium, price not public) | Starts $32.50/mo for 50 conversations; Premium "Pay-per-resolution", "Contact for pricing" | Billing unit: conversation with >=1 Lyro reply. Analytics "resolved": visitor left or never asked for agent | Analytics yes; billing unit is not resolution | Unconfirmed | n/a | M/L |
| Kustomer | Unpublished; third-party: per conversation | "we don't post one-size-fits-all pricing" | Not published | Unknown | Unconfirmed | n/a | L |
| Front Autopilot | per conversation at highest level reached | Triage $0.05 / Handoff $0.39 / Resolution $0.89 | Resolution = no teammate follow-up within 24h (chat/SMS/WhatsApp/custom) or 72h (email/portal) | **Yes** | Analytics > Conversations export (CSV, 40 cols; no AI col); AI replies hub | `Conversation ID`, `Contact handles during period`, `Replies to resolution`, `Last resolved at/by`... | H (Front help) / M |

## (b) Per-vendor detail

### 1. Intercom Fin

**Pricing.** Pricing page: "$0.99 per outcome"; "Minimum monthly commitment applies (e.g. 50 outcomes)." and "You're only charged once per conversation, even if multiple questions are answered." (https://www.intercom.com/pricing, fetched 2026-10-24). Fin help article (fin4all center): $0.99 per resolution, billed separately from "$49 monthly subscription" after 50 included resolutions (https://intercom.help/fin4all/en/articles/10772642-fin-ai-agent-resolutions, 2026-10-24). Pricing page also says outcomes include "Fin completes a workflow, including handoffs" (as summarized by fetch; wording of the page may be interpreted, verify). Third-party claims $9.99 qualification outcome: unconfirmed.

**Definition.** Intercom help: "the customer confirms the answer was satisfactory" (confirmed) vs "exits the conversation without requesting further assistance" (assumed) (https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-resolutions). That article gives **no fixed waiting window**; third-party blogs say 24 hours - unconfirmed on Intercom primary docs. If a customer returns seeking help, "that resolution will be deducted and not charged" (same article). Teammate join: fin4all article says if a teammate joins after Fin answered and customer did not ask for more help or a person, it counts as resolved and is billed; if the customer asked, "unresolved" and not charged.

**Billed-assumed?** Yes, assumed resolutions billed identically to confirmed.

**Export / fields (primary: Intercom OpenAPI spec 2.15, https://raw.githubusercontent.com/intercom/Intercom-OpenAPI/main/descriptions/2.15/api.intercom.io.yaml, read 2026-10-24).**
- Conversation object has `ai_agent_participated` (bool) and `ai_agent` with: `source_type` (essentials_plan_setup, profile, workflow, workflow_preview, fin_preview), `source_title`, `last_answer_type` (ai_answer, custom_answer, null), `resolution_state` (**assumed_resolution, confirmed_resolution, escalated, negative_feedback, procedure_handoff, null**), `rating` (1-5), `rating_remark`, `created_at`, `updated_at`, `content_sources`.
- Search API (`POST /conversations/search`) accepts: `ai_agent_participated`, `ai_agent.resolution_state`, `ai_agent.last_answer_type`, `ai_agent.rating`, `ai_agent.rating_remark`, `ai_agent.source_type`, `ai_agent.source_title`.
- `statistics.*` includes `count_reopens`, `count_assignments`, `count_conversation_parts`, `first_close_at`, `last_close_at`, `last_admin_reply_at`, `last_contact_reply_at`, `last_closed_by_id`, `time_to_assignment`; `conversation_rating.{score,remark,requested_at,replied_at,contact_id}`; `contact_ids`, `source.author.email/id`, `admin_assignee_id`, `team_assignee_id`, `state`, `created_at`, `updated_at`.
- Older enum names (`routed_to_team`, `abandoned`) were renamed `escalated`, `negative_feedback`; `procedure_handoff` added (https://developers.intercom.com/docs/references/2.15/changelog.md). So an exporter must accept both generations of names.
- UI export paths (https://www.intercom.com/help/en/articles/2046229-export-your-conversation-data): Reports > Dataset export (CSV, 13 datasets, choose columns, "Message content is not included", <=10,000 rows in browser then emailed, 2 years of data, schedulable); Saved View "Export as CSV" (visible columns, 25,000 cells instant; 100k rows max); Conversations API (<=90 days/request); S3 JSONL export (Settings > Data > Imports & exports). **Exact CSV column headers of the Conversations dataset: unconfirmed** (come from `get_datasets`/UI). Reports are reachable via Reporting Data Export API: `POST /export/reporting_data/enqueue`, `GET /export/reporting_data/get_datasets`.
- Customer identifiers: API has contact ids and author email; reopen count and CSAT: yes (API). In CSV datasets: unconfirmed.
- Where to view in UI: Analyze > Performance funnel, hover shows conversations per outcome (fetched from the resolutions article).

**Complaints.**
- Intercom Community, 2025-05-27: user found 16 of 40 Fin-involved tickets "resolved by Fin" but 9 of 16 not actually solved (40% vs 12.5%), attributing it to agent-reply-after-Fin being counted. Intercom staff (2025-06-04/05) admitted event messaging was inaccurate: "We didn't communicate the billing logic accurately during the event, and that's on us." and said they are "considering changes to how we measure resolutions". https://community.intercom.com/fin-product-feedback-member-group-49/fin-s-flawed-resolution-assumption-10516
- Community dashboard share: confirmed ~6-7% vs assumed ~60% (single operator, cited second-hand) - https://community.intercom.com/analyze-fin-93/how-do-you-improve-your-confirmed-resolution-rate-8268 (link taken from buildmvpfast article; I did not open this thread).
- Commentary (CRM Magazine / destinationCRM, 2026-09-14): buyers cannot easily see confirmed vs assumed split. https://www.destinationcrm.com/Articles/Web-Exclusives/Viewpoints/Per-Resolution-Pricing-Is-Training-AI-Support-Vendors-to-Optimize-for-the-Wrong-Number-176567.aspx
- Competitor-authored (bias): https://www.buildmvpfast.com/blog/cost-per-resolution-trap-ai-agents-game-resolution-kpi-2026

### 2. Zendesk AI agents

**Model changed on 2026-05-18** (announced 2026-05-14): conversations are Unassisted / Assisted escalation / Automated resolution, the last split into Contained and Verified. "You are billed only for Verified resolutions" (https://support.zendesk.com/hc/en-us/articles/10677925692698-Announcing-changes-to-AI-agent-reporting). Older posts (and many third-party blogs) describe the pre-May model, so beware stale numbers.

**Definitions** (https://support.zendesk.com/hc/en-us/articles/9570369117338-About-automated-resolution-tiers):
- Contained: "The AI agent handled the interaction to completion without the customer requesting further assistance." Not billed.
- Verified: AI resolved, customer did not ask for more help, and an LLM reviews the ended conversation; passes => Verified, fails => Contained.
- Assisted escalation: "The AI agent contributed to the interaction before a human agent completed the resolution." Not billed.
- Conversation end: email 72h after first email; messaging 2h after first message by default, extendable to 72h; voice at hangup.
- Customer signals that prevent contained/verified: asking for clarification, giving feedback on the answer, asking for a human.
- Older article (https://support.zendesk.com/hc/en-us/articles/5352026794010-About-automated-resolutions-for-AI-agents): legacy autoreply articles get tag `ai_agent_automated_resolution` 72 hours after last user interaction if ticket not closed; "an LLM verifies each resolution"; not counted: tests, sandbox, flow links.

**Price.** Per-resolution price not stated in Zendesk help articles I read. Allowance article (https://support.zendesk.com/hc/en-us/articles/10479587390106-Managing-resolution-allowances): included allowance is a $ pool per seat per month (Suite: Team $2, Growth $5, Professional $5, Enterprise $10, Enterprise Plus $10; Support: $2 on all), max $5,000/yr; "buying more before overages ... provides a better per-resolution cost than overage billing". Third-party tier table ($1.50 -> $1.00 committed, $2 PAYG overage) came from a search summary of a Zendesk article that appears to describe the pre-May-2026 platform (https://support.zendesk.com/hc/en-us/articles/5352026794010 - "prior to resolution tiers"); treat as **unconfirmed for today**.

**Billed-assumed?** Billing is on LLM-verified, silence-based resolution; no explicit customer confirmation required. Contained (not billed) is the safety valve.

**Export.**
- Admin Center > Account > Usage > Resolutions > Actions > "Export contributing resolutions"; CSV emailed, link valid 14 days. Row data: ticket ID, tier, channel group, brand, resolution timestamp, cost. **Exact header names not documented** (https://support.zendesk.com/hc/en-us/articles/10479485915290-Managing-resolution-usage).
- Ticket fields: `Resolution type` (value Automated when consumed), `Resolution tier` (Assisted escalation/Contained/Verified), `Channel group` (Digital/Voice); usable in Explore custom reports (https://support.zendesk.com/hc/en-us/articles/9204149016346). Historical conversations up to two years re-mapped.
- Native JSON ticket export: "AI agent tickets can't be exported through this method" (third-party eesel summary; https://www.eesel.ai/blog/zendesk-export-tickets). CSV/API behaviour unconfirmed.
- Identifiers: requester email via normal ticket export/API; reopen count and CSAT: ticket-level in Support API/Explore (general knowledge; not verified here).

**Complaints.** Competitor Robylon claims abandoned chats become billed resolutions three days later (bias): https://www.robylon.ai/blog/zendesk-automated-resolution-explained. Zendesk community: tag added to ticket a human still handled: cannot give exact URL (found via search summary, not opened) - unconfirmed. Secondhand Reddit summary: https://www.getmacha.com/blog/zendesk-reddit-opinions (competitor).

### 3. Gorgias AI Agent

Pricing page (https://www.gorgias.com/pricing, 2026-10-24): "AI Agent interactions are priced at $0.90 each on annual plans or $1.00 on monthly plans"; overage $1.50; each interaction also counts as a helpdesk ticket. Definition: "An automated interaction is a customer request that's fully resolved without a human agent." If an agent replies within 72h, it is billed as a ticket only. Billing doc (https://docs.gorgias.com/en-US/how-youre-billed-for-using-gorgias-199385): fully handled by AI Agent and customer "does not require the involvement of a human agent within 72 hours". Resolved by AI => ticket fee + automation fee. Assumed resolutions billed: yes.

Export (https://docs.gorgias.com/en-US/exports-404844): Inbox view > three dots > Export tickets (CSV by email, up to 1M tickets, link 14 days). View export columns: link to ticket, Ticket ID, Tags, Initial channel, Priority, Last used integration name/type, Created by an agent, Subject, Creation date, Closed date, Survey score, Survey replied date, Assignee name/email, Customer email, Customer name, First response time, Resolution time, Number of agent messages, Number of customer messages, Ticket and customer fields. Analytics drill-down export adds "Message text", "Ticket handle time", "Messages sent during the period". **No AI Agent/automation-specific column documented**; proxies: `Number of agent messages` = 0 plus tags, "Last used integration". The AI Agent API fields are unconfirmed.

Complaints: double billing (ticket + automation) per competitor blogs https://www.getmacha.com/blog/gorgias-common-complaints-and-problems (bias).

### 4. Salesforce Agentforce for Service

https://www.salesforce.com/agentforce/pricing/ (2026-10-24): "$2 per conversation"; Flex Credits "$500 per 100k Credits", 20 credits per action (30 voice); add-on $125/user/month for employee use; $5 Agentforce User License requires Flex Credits. Conversation definition: not found (unconfirmed). Not resolution-based, so "billed resolutions" has no direct equivalent; an auditor would compare conversation count vs outcomes.

Export: Data Cloud session tracing. Interaction DMO per search summary of https://developer.salesforce.com/docs/data/data-cloud-dmo-mapping/guide/c360dm-si-aiagentinteractiondmo-dmo.html: `AiAgentSessionId`, `AiAgentInteractionType`, `StartTimestamp`, `EndTimestamp`, `IndividualId`, `PrevInteractionId`, `TopicApiName`, `TelemetryTraceId`; object `std__AiAgentInteractionDmo__dlm`. Session Log DMO page returned 403 - session end type/outcome fields **unconfirmed**. Third-party skill guides mention `EndType`, `ChannelType` - unverified.

### 5. HubSpot Customer Agent (Breeze)

Price: HubSpot announcement (https://www.hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete): "$0.50 per resolved conversation"; effective 2026-04-14; 50 credits per resolution (fetch result). Pricing page: credits-based; Starter 500, Pro 3,000, Enterprise 5,000 credits per seat plan; no per-resolution number on that page.

Definition (https://knowledge.hubspot.com/customer-agent/understand-the-customer-agent and /analyze-your-customer-agents-performance): resolved if the agent "sends at least one reply that shares a content source or performs an action" and no qualifying handoff within 72 hours of the visitor's last message; status set 72h after; or lead qualified/partially/not qualified (immediate). Only visitor-initiated handoffs qualify; "Manual agent assignment, including assignment through workflows, is not considered a qualifying handoff" - a human can later handle the thread and it still counts as resolved. Email threads reopened after 72h can consume more credits. Silence billed: yes.

Export: Reports under Service > Customer Agent > Analyze > Reports. KB pages do not mention export (unconfirmed). Conversations API exposes thread status/closed date/inbox/assignee/associated ticket (third-party wrapper docs); no documented "resolved by agent" property. Complaint sources: none found.

### 6. Freshworks Freddy AI Agent

https://www.freshworks.com/freshdesk/pricing/ (2026-10-24): "Additional AI Agent sessions $49 /100 sessions"; first 500 sessions included on Growth/Pro/Enterprise, once per account. Session: "A session is a unique interaction between an end-user and an AI Agent."; email session = 72h window from first email, all AI replies count as one. Billed regardless of resolution. Freshservice reporting (https://support.freshservice.com/support/solutions/articles/50000010557-freddy-ai-agent-overview-report) separates resolved / converted to ticket / agent-intervened / unanswered; session-level CSV for Freshchat: unconfirmed.

### 7. Help Scout AI Answers

https://docs.helpscout.com/article/1746-ai-resolutions-pricing: "$0.75 per resolution"; "A resolution is a single AI chat session that is resolved without help from a human." Billable when AI gives real answer and customer doesn't ask for more help (third-party summary of same doc; billed once per session). Review billable conversations under Reports > Scout; export of those: not stated (unconfirmed). Generic Reports export (CSV/XLSX) exists but excludes Scout per results; Inbox API for conversation data (https://docs.helpscout.com/article/849-reports-data-export).

### 8. Decagon

https://decagon.ai/blog/pricing-ai-agents: per-conversation = "A fixed rate for every incoming conversation"; per-resolution = "A higher fixed rate for each fully resolved conversation, with no charge for escalations." Most customers choose per-conversation. "You never want to be in a situation where you're arguing over what a 'resolution' is." No public price (third-party estimates of $0.99/conv + ~$50k platform: https://quiq.com/blog/decagon-pricing/ - competitor, unverified). Export: unconfirmed.

### 9. Sierra

https://sierra.ai/blog/outcome-based-pricing-for-ai-agents: outcomes tied to "a resolved support conversation, a saved cancellation..."; unresolved "in most cases, there's no charge"; "clear, agreed-upon criteria for each outcome upfront". Rate and export: not published (unconfirmed).

### 10. Ada

Resolution (https://docs.ada.cx/docs/generative/measure-success/understand-and-improve-your-ai-agent-s-automated-resolution-rate): Resolved only if Relevant, Accurate, Safe, Contained; else Not Resolved; idle web chat/social conversations end after 24h (email 72h); escalated => Not Resolved immediately. Pricing: sales-led; conversation-based primary, resolution-based for some enterprises (third-party); contract terms (third-party, quoting Ada service terms): not escalated and meets relevance/accuracy/safety; invoiced upfront - unverified. Export: Data Export API conversation object (https://docs.ada.cx/data-export-conversation-object): `_id`, `chatter_id`, `end_user_id`, `date_created`, `date_updated`, `record_last_updated`, `automated_resolution_classification`, `automated_resolution_classification_reason`, `bot_handle_time`, `agent_handle_time`, `agent_id`, `agent_name`, `csat` (CSAT 2.0 only), `handoffs` (array with `outcome_status`, `reason_code`), `is_escalated`, `is_engaged`, `is_test_user`, `inquiry_summary`, `language`, `platform`... Feature "may not be included with your organization's subscription package". Classification value strings (e.g. "Resolved"/"Not Resolved") for the field: unconfirmed.

### 11. Tidio Lyro

https://www.tidio.com/pricing: Lyro starts "$32.50/mo", 50 conversations; a Lyro conversation = "at least one reply from our AI Agent"; Premium lists "Pay-per-resolution billing" and "Guaranteed 50% Lyro AI resolution rate", price "Contact for pricing", resolution not defined on page. Analytics (via search summary of https://help.tidio.com/hc/en-us/articles/12642627073948-Lyro-Analytics; page 403 on fetch): resolved = visitor questions Lyro resolved without agent where visitor "either left or never asked for a live agent". Export: unconfirmed.

### 12. Kustomer

https://www.kustomer.com/pricing/: "we don't post one-size-fits-all pricing". Kustomer blog argues against resolution-based pricing (https://kustomer.com/resources/blog/conversation-vs-resolution-based; page content not retrievable). Third-party: $0.60 per engaged conversation (competitor My AskAI; unverified) vs $1.00/resolved (Aissist benchmark). Definition and export: unconfirmed.

### 13. Front Autopilot

https://help.front.com/en/articles/4890624 (fetched 2026-10-24): per conversation, charged once at highest level: Triage $0.05, Handoff $0.39, Resolution $0.89. Resolution when "there is no follow-up message from a teammate within 24 hours" (Resolve/SMS/WhatsApp/custom channels), 72h for email and portal. Pay-as-you-go. No export of Autopilot outcomes described; AI replies hub in settings; Front pricing page shows only "Starting at $0.05 /conversation". Analytics > Conversations export (https://help.front.com/en/articles/4920896): 40 columns incl. Conversation ID, Segment, Status, Tags, Assignee, Contact handles during period, Channels during period, First replied at, Last resolved at/by, Messages sent/received, Replies to resolution, Suggested replies sent, Resolution time, Time in resolved; date range <=31 days; <=100,000 rows; no Autopilot-specific column listed. Autopilot outcomes may be recoverable only via tags/rules - unconfirmed.

## (c) Implications for the auditor engine

**Direct identification of AI-handled and AI-resolved conversations (native field):**
- Intercom: `ai_agent_participated` + `ai_agent.resolution_state` (API / S3 JSONL). Best case; also has `statistics.count_reopens`, `conversation_rating`, `ai_agent.rating`, contact ids, timestamps. Parser must map legacy `routed_to_team`/`abandoned` to new `escalated`/`negative_feedback`. Whether Dataset-export CSV has an equivalent column: unconfirmed, so also support a user-mapped column.
- Ada: `automated_resolution_classification` (+ reason), `is_escalated`, `handoffs`, `csat`, `end_user_id`, timestamps. Direct.
- Zendesk: ticket fields `Resolution type` / `Resolution tier` (plus `Channel group`), or the Usage > Resolutions CSV (ticket ID, tier, timestamp, cost: lists billed ones only). Mapping: join usage CSV (billed ticket IDs) with a ticket export (requester, created/solved, reopen/satisfaction) on ticket ID. Legacy: tag `ai_agent_automated_resolution`.

**Need a generic column mapping (no AI-outcome column documented):** Gorgias (infer from `Number of agent messages`==0, tags, "Last used integration name"), Front (infer from `Replies to resolution`/messages sent; Autopilot flag unavailable), HubSpot, Help Scout, Freshworks, Tidio, Kustomer, Salesforce (session tracing DMOs; conversation-based), Decagon, Sierra (no public export; whatever the customer's own transcript export looks like).

**Signals computable from generic exports (if ids/timestamps present):**
- Repeat contact by same customer within N days: needs a customer key (Intercom `contact_ids`/author email; Gorgias `Customer email`; Front `Contact handles during period`; Ada `end_user_id`; Zendesk requester). Feasible for all except where export lacks any customer key; Ada `end_user_id` is pseudonymous but stable per chatter.
- Reopen: Intercom `statistics.count_reopens`; Front status fields `Time in open` after resolved (derivable); others via ticket status history (Zendesk reopen needs audit/metrics); otherwise derive from a later conversation by same customer.
- Human handoff after AI: Intercom `resolution_state` in {escalated, procedure_handoff} and `admin_assignee_id`/`last_admin_reply_at`; Ada `is_escalated`/`handoffs`; Gorgias/Front via agent message count / assignee; HubSpot: manual assignment still counts as "resolved" by vendor rule, so a strict engine should flag any human reply after the AI.
- Negative CSAT: Intercom `conversation_rating.score` and `ai_agent.rating`(1-5); Ada `csat`; Gorgias `Survey score`; others via survey columns if user maps them.
- Silence window: engine should record each vendor's window (Intercom: unspecified in docs, third-party says 24h; Gorgias/HubSpot/Front-email/Zendesk-email: 72h; Front chat/Ada chat: 24h; Zendesk messaging: 2h default) and compute "billed-by-silence" cases (assumed) separately from confirmed.
- Strict real resolution suggestion: AI participated, no human reply, no escalation state, no repeat contact in N days, no reopen, not negative CSAT, and (where available) explicit confirmation or positive rating.

**Things I could not confirm (do not hard-code):** exact CSV headers of Intercom Dataset export (Conversations) and Zendesk usage export; HubSpot report export; Salesforce session outcome fields; any export for Decagon, Sierra, Kustomer, Tidio, Freshchat; Zendesk per-Verified-resolution price; Intercom assumed-resolution wait window in primary docs; Gorgias AI-specific column.

## Summary (10 lines)
1. Intercom Fin: $0.99/outcome; assumed (silence) resolutions are billed; API/S3 expose `ai_agent.resolution_state` with assumed/confirmed/escalated/negative_feedback/procedure_handoff.
2. Intercom admitted in Community (June 2025) it mis-described billing; users report assumed >> confirmed.
3. Zendesk moved on 2026-05-18 to tiers; only LLM-"Verified" resolutions are billed; export via Usage > Resolutions CSV and `Resolution tier` ticket field; price not public.
4. Gorgias: $0.90/$1.00 per automated interaction, 72h no-human rule, also billed as ticket; export CSV has no AI column.
5. HubSpot: $0.50 (50 credits) per resolved conversation since 2026-04-14; 72h silence counts; manual human assignment does not block "resolved"; no export documented.
6. Front Autopilot: $0.05/$0.39/$0.89 tiers; resolution = no teammate follow-up in 24h/72h; Analytics export has no AI column.
7. Ada exposes the richest direct fields (`automated_resolution_classification`, `is_escalated`, `handoffs`, `csat`, `end_user_id`).
8. Freshworks, Salesforce, Tidio bill per session/conversation (not per resolution); Decagon, Sierra, Kustomer are contract-defined with no public export.
9. Direct AI-outcome identification possible for Intercom, Ada, Zendesk; everything else needs generic column mapping plus computed signals (repeat contact, reopen, handoff, CSAT).
10. Many third-party price blogs are stale or competitor-authored; use the primary URLs above and re-verify before shipping.

STATUS: DONE
