# Auditing Gorgias AI Agent

Facts on this page were checked on 2026-10-24.

## How Gorgias counts a resolution

Gorgias bills the AI Agent per automated interaction: $0.90 each on annual plans or $1.00 on monthly plans, with overage at $1.50 per interaction. Each interaction also counts as a helpdesk ticket. Gorgias defines an automated interaction as a customer request that is fully resolved without a human agent. If a human replies within 72 hours it is billed as a ticket only. A customer who simply goes quiet is billed as resolved.

## How to export

In an Inbox view, open the three-dot menu and choose Export tickets. A CSV is emailed (up to 1M tickets, link valid for 14 days). Columns include Ticket ID, Tags, Initial channel, Last used integration name and type, Customer email, Creation date, Closed date, Survey score, Number of agent messages and Number of customer messages. The Analytics drill-down export adds message text.

## How to audit with Resolvara

The export has no AI-specific column. The Gorgias preset therefore infers that a ticket was AI-resolved when the number of agent messages is 0 and an AI tag or integration is present.

1. Choose the Gorgias preset and drop the CSV.
2. Confirm the inference in the mapper: pick the tag or integration name that marks the AI Agent in your account. This step matters, because it decides what counts as billed.
3. Set the price (default $1.00; use $0.90 if you are on an annual plan).
4. Review the results. Customer email is the customer key.

## Caveats

- The inference is not the same as Gorgias's own billing list. Compare the number Resolvara treats as billed with your invoice. If they differ, adjust the mapping.
- A ticket with a human reply is not billed as an automation under Gorgias's terms, so it will show as not strict rather than phantom.
- Survey score is used for negative CSAT when present.

## Sources

- https://www.gorgias.com/pricing
- https://docs.gorgias.com/en-US/how-youre-billed-for-using-gorgias-199385
- https://docs.gorgias.com/en-US/exports-404844
