# Auditing Help Scout AI Answers

Facts on this page were checked on 2026-10-24. Resolvara has no Help Scout preset; use the generic mapper.

## How Help Scout counts a resolution

Help Scout prices AI Answers at $0.75 per resolution and defines a resolution as a single AI chat session that is resolved without help from a human. According to a third-party summary of the same document, a session is billable when the AI gave a real answer and the customer did not ask for more help, and it is billed once per session. No silence window was found in the pages read.

## How to export

You can review billable conversations under Reports > Scout, which is view-only in the pages read. Export of those conversations is not stated. The generic Reports export (CSV or XLSX) is reported to exclude Scout. The Inbox API exposes conversation data, so a script that lists conversations, customers, timestamps and threads is the likely route.

## How to audit with Resolvara

1. Build a file with a conversation id, a created timestamp, a customer email, whether a human replied, and a marker for conversations Help Scout counted as AI resolutions (copy it from the Scout report).
2. Choose the generic preset and map the columns.
3. Set the price to your invoice rate (the published rate is $0.75).

## Caveats

- Because the billable marker comes from a manual step, check that the count Resolvara treats as billed matches your invoice.
- Without a customer email the repeat-contact check cannot run, and conversations may be reported as unverifiable.

## Sources

- https://docs.helpscout.com/article/1746-ai-resolutions-pricing
- https://docs.helpscout.com/article/849-reports-data-export
