# Auditing Intercom Fin

Facts on this page were checked on 2026-10-24. Sources are listed at the end. Vendor terms change, so check them again before you rely on them.

## How Intercom counts a resolution

Intercom bills Fin per "outcome" at $0.99 on its pricing page, with a minimum monthly commitment. A resolution is either **confirmed** (the customer confirms the answer was satisfactory) or **assumed** (the customer leaves without asking for further help). Both are billed at the same price. Intercom's help article says that if the customer returns seeking help, the resolution is deducted and not charged.

Intercom's primary help article gives no fixed waiting window for assumed resolutions. Some third-party blogs say 24 hours; that is not confirmed on Intercom's own documentation.

## How to export

Pick the route that gives you the AI fields:

1. **Conversations API or S3 JSONL export.** These expose `ai_agent_participated` and `ai_agent.resolution_state` (assumed_resolution, confirmed_resolution, escalated, negative_feedback, procedure_handoff). This is the best input for Resolvara.
2. **Reports > Dataset export (CSV).** You choose the columns. Message content is not included. The exact column headers of the Conversations dataset are not confirmed here, so include every AI, reopen, rating and contact column on offer, and expect to confirm the mapping in Resolvara.
3. The Conversations API returns at most 90 days per request. The CSV route covers up to two years of data.

Useful fields: `id`, `created_at`, `ai_agent_participated`, `ai_agent.resolution_state`, `ai_agent.rating`, `statistics.count_reopens`, `statistics.last_admin_reply_at`, `conversation_rating.score`, and a contact id or email.

## How to audit with Resolvara

1. Choose the Intercom preset (it is detected from the headers) and drop the file.
2. Check the mapping. Billed should be on for assumed and confirmed resolutions. Older state names (`routed_to_team`, `abandoned`) are treated as `escalated` and `negative_feedback`.
3. Set the price per resolution (default $0.99) and the window.
4. Read the split between assumed and confirmed passes, then open the flagged list.

## Caveats

- The export has to include a customer key (contact id or email) for repeat contact to work.
- Assumed resolutions are billed under Intercom's terms. A phantom resolution under the Standard is not necessarily an invoice error.
- A human reply after Fin is counted as a handoff by the Standard. Intercom's help material describes cases where a teammate joins after Fin answered and the resolution is still billed.

## Sources

- https://www.intercom.com/pricing
- https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-resolutions
- https://intercom.help/fin4all/en/articles/10772642-fin-ai-agent-resolutions
- https://www.intercom.com/help/en/articles/2046229-export-your-conversation-data
- https://raw.githubusercontent.com/intercom/Intercom-OpenAPI/main/descriptions/2.15/api.intercom.io.yaml
- https://developers.intercom.com/docs/references/2.15/changelog.md
