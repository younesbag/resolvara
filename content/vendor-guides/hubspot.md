# Auditing HubSpot Customer Agent

Facts on this page were checked on 2026-10-24. Resolvara has no HubSpot preset; use the generic mapper.

## How HubSpot counts a resolution

HubSpot announced a price of $0.50 per resolved conversation (50 credits), effective 2026-04-14. A conversation is resolved when the agent sent at least one reply that shares a content source or performs an action, and there was no qualifying handoff within 72 hours of the visitor's last message. Only visitor-initiated handoffs qualify. Manual assignment to a human, including through workflows, is not a qualifying handoff, so a human can handle the thread later and it still counts as resolved. Email threads reopened after 72 hours can use more credits.

## How to export

Reports live under Service > Customer Agent > Analyze > Reports. The pages read do not document an export. The Conversations API exposes thread status, closed date, inbox, assignee and associated ticket, but no documented property says "resolved by the agent". You may need to build the file yourself.

## How to audit with Resolvara

1. Build a CSV or JSON with, at minimum, a conversation id, a created timestamp, a customer identifier, and a column or value that marks conversations HubSpot billed as resolved.
2. Add human replies, reopens and satisfaction if you have them.
3. Choose the generic preset and map each column. For billed, give the column and the value that means billed.
4. Set the price (use your invoice rate; the announced rate is $0.50).

## Caveats

- Because HubSpot lets later human assignment pass as resolved, expect many human-handoff flags. Under the Standard a human reply after the AI is a handoff, even if HubSpot's rule is met.
- Without a billed marker you can still run the audit on all AI conversations. You will see the strict rate but no phantom count or dollars at risk.

## Sources

- https://www.hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete
- https://knowledge.hubspot.com/customer-agent/understand-the-customer-agent
- https://knowledge.hubspot.com/customer-agent/analyze-your-customer-agents-performance
