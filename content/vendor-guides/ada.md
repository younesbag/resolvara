# Auditing Ada

Facts on this page were checked on 2026-10-24. Ada's pricing is sales-led, so your contract is the authority on what you are billed.

## How Ada counts a resolution

Ada classifies a conversation as resolved only if the answer was relevant, accurate and safe, and the conversation stayed contained. The classification is done by an LLM. An escalated conversation is Not Resolved immediately. Idle web chat and social conversations end after 24 hours and email after 72 hours, and are then classified.

Pricing is not public. Third-party sources say conversation-based pricing is primary and resolution-based pricing is offered to some enterprises. This is unverified. Enter the price from your own contract.

## How to export

Use the Data Export API and the conversation object. The feature may not be included in every subscription package. Useful fields: `_id`, `end_user_id`, `date_created`, `automated_resolution_classification`, `automated_resolution_classification_reason`, `is_escalated`, `handoffs`, `csat`, `is_test_user`.

## How to audit with Resolvara

1. Choose the Ada preset and drop the export (JSON or CSV).
2. Set which classification value means billed. The exact strings are not confirmed in the documentation read, so the mapper lets you pick them.
3. `end_user_id` is used as the customer key. It is pseudonymous but stable per user, so repeat contact works.
4. Remove test users (`is_test_user`) from the file or confirm that the preset does.
5. Enter your price per resolution and review the flagged list.

## Caveats

- `csat` is present only with CSAT 2.0.
- Ada already excludes escalated conversations from its resolved class, so the main gaps to expect are repeat contacts and later human replies.
- Contract terms may define resolution differently from the public help page.

## Sources

- https://docs.ada.cx/docs/generative/measure-success/understand-and-improve-your-ai-agent-s-automated-resolution-rate
- https://docs.ada.cx/data-export-conversation-object
