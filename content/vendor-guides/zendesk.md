# Auditing Zendesk AI agents

Facts on this page were checked on 2026-10-24. Zendesk changed its model on 2026-05-18, and many third-party articles describe the earlier one. Use the Zendesk pages listed below.

## How Zendesk counts a resolution

Since 2026-05-18 automated resolutions are split into **Contained** and **Verified**. Zendesk states that you are billed only for Verified resolutions. Contained means the AI agent handled the interaction to completion without the customer requesting further assistance; it is not billed. Verified means the same, plus an LLM reviews the ended conversation and passes it. No explicit customer confirmation is required.

A conversation ends 72 hours after the first email, 2 hours after the first message in messaging (extendable to 72 hours), or at hangup for voice. Asking for clarification, giving feedback on the answer, or asking for a human prevents a Contained or Verified outcome.

Zendesk does not state a per-resolution price on the help pages read. The included allowance is a dollar pool per seat. Third-party price figures may predate May 2026, so Resolvara sets no default price for Zendesk: enter your own from your contract or invoice.

## How to export

1. **Usage export.** Admin Center > Account > Usage > Resolutions > Actions > Export contributing resolutions. A CSV is emailed and the link is valid for 14 days. It lists billed resolutions with ticket id, tier, channel group, brand, timestamp and cost. Header names are not documented.
2. **Ticket export.** Export your tickets (CSV or API) with requester, created and solved dates, reopens and satisfaction. The ticket fields `Resolution type` and `Resolution tier` are available in Explore custom reports.
3. Join the two on ticket id.

Legacy accounts may still carry the tag `ai_agent_automated_resolution`, added 72 hours after the last user interaction under the older model.

## How to audit with Resolvara

1. Choose the Zendesk preset and drop the ticket export. If you also have the Usage CSV, add it as the second file so billed ticket ids can be matched.
2. If you have no Usage CSV, billed is inferred from `Resolution tier` = Verified (or the legacy tag). Check this in the mapping.
3. Enter your price per resolution.
4. Review the flagged list. Contained and Assisted escalation tickets are not billed, so they appear as "not strict" but never as phantom.

## Caveats

- Native JSON ticket export is reported not to include AI agent tickets (third-party report, unverified). Use CSV, the API or Explore.
- Reopen count and satisfaction come from the ticket data and are not confirmed in the pages read here.
- The Verified tier already includes an LLM check, so the number of phantom resolutions may be lower than for vendors that bill on silence alone. The Standard still flags repeat contacts and human replies.

## Sources

- https://support.zendesk.com/hc/en-us/articles/10677925692698-Announcing-changes-to-AI-agent-reporting
- https://support.zendesk.com/hc/en-us/articles/9570369117338-About-automated-resolution-tiers
- https://support.zendesk.com/hc/en-us/articles/5352026794010-About-automated-resolutions-for-AI-agents
- https://support.zendesk.com/hc/en-us/articles/10479587390106-Managing-resolution-allowances
- https://support.zendesk.com/hc/en-us/articles/10479485915290-Managing-resolution-usage
- https://support.zendesk.com/hc/en-us/articles/9204149016346
