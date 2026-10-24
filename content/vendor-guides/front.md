# Auditing Front Autopilot

Facts on this page were checked on 2026-10-24. Resolvara has no Front preset; use the generic mapper.

## How Front counts a resolution

Front Autopilot charges per conversation, once, at the highest level reached: Triage $0.05, Handoff $0.39, Resolution $0.89. A conversation reaches Resolution when there is no follow-up message from a teammate within 24 hours (chat, SMS, WhatsApp and custom channels) or 72 hours (email and portal). Silence is enough.

## How to export

Analytics > Conversations export gives a CSV with about 40 columns, for a date range of up to 31 days and up to 100,000 rows. Columns include Conversation ID, Status, Tags, Contact handles during period, Channels during period, First replied at, Last resolved at, Messages sent and Replies to resolution. No Autopilot-specific column is listed. Autopilot outcomes may be recoverable only through tags or rules; this is not confirmed. The AI replies hub in settings lets you review what Autopilot sent.

## How to audit with Resolvara

1. Export one month at a time and combine the files, keeping one header row.
2. Choose the generic preset. Map Conversation ID to id, Contact handles to the customer key, and the first and last timestamps to created and closed.
3. Mark billed using a tag or rule that identifies Resolution-level Autopilot conversations, if you have one. Otherwise run the audit without a billed marker.
4. Use Replies to resolution as the human-reply signal where it applies.

## Caveats

- Contact handles during period may list several handles. Pick one stable handle (for example the email) as the key.
- The 31-day limit means a long audit needs several exports. Conversations that straddle two exports can be missed by the repeat-contact check.
- Billing is tiered, so dollars at risk are only meaningful for the Resolution level at $0.89.

## Sources

- https://help.front.com/en/articles/4890624
- https://help.front.com/en/articles/4920896
