# Frequently asked questions

## What does Resolvara do?

It reads an export of your support conversations, finds the ones where an AI agent took part, and applies the Strict Resolution Standard to them. It shows how many of the conversations that could be judged your vendor billed as resolutions, how many of all those show no sign of failure, and which billed ones do.

## Does my data leave my browser?

No. The file is read and analysed in your browser, in a Web Worker. The audit makes no network request. The only time anything is sent is if you click "Contribute anonymously", and then the exact JSON is shown to you first. It contains aggregate rates only, no ids, no text and no customer data. See the privacy page for how to confirm this in your browser's developer tools.

## How accurate is it?

It is as accurate as your export and the signals allow. Four of the five fail signals are direct readings of the data (vendor escalation state, a human reply, a reopen count, a low rating). Repeat contact is a proxy: the same customer wrote again within the window, which usually means the first answer did not solve the problem but sometimes means a new problem. For that reason every flag carries its evidence and you can change the window, turn on the same-topic filter, and read the flagged conversations yourself.

## Is a "phantom resolution" the same as fraud or an invoice error?

No. A phantom resolution is a conversation your vendor billed that shows at least one fail signal under the Standard. Vendors publish their definitions and bill by them. The Standard applies a stricter definition to the same data. A conversation can be billed correctly under your contract and still fail the Standard.

## Why do repeat contacts count as failures? Won't some be false positives?

Some will. A customer may come back about a different order, a different feature or a follow-up. That is why the window is adjustable (default 7 days), why a result is shown for 1, 3, 7, 14 and 30 days, and why there is an optional same-topic filter that requires the two conversations to be textually similar. Turning the filter on reduces false positives and may miss repeat contacts whose wording differs. Treat repeat contact as a flag to sample, not a finding.

## What are the "pending" conversations?

Conversations created in the last W days of your export (default 7). They have not had time to show a repeat contact or reopen, so they cannot be judged yet. They are left out of every rate and shown as a separate count.

## What does "unverifiable" mean?

The conversation has no customer identifier and shows no other fail signal. Without an identifier a repeat contact cannot be checked, so the Standard cannot say it passed. These are unjudged, not failed: they are left out of every rate and shown separately. Re-export with a customer id or email column to include them.

## What is the dispute pack and what should I do with it?

It is a CSV of the flagged conversations with the reason and evidence for each, plus a plain-text summary and an email template. A sensible way to use it: sample some flagged conversations and read them, remove any you disagree with, and send the rest to your vendor with a request for a credit review. State the window and thresholds you used. Keep the request factual, and expect the vendor to apply its contract definition, which may differ from the Standard.

## Which vendors does it support?

It has presets for Intercom, Zendesk, Ada and Gorgias. For any other system there is a generic column mapper where you pick the columns for the id, the customer, the created time and, if you have them, the billed marker, human replies, reopens and satisfaction. The vendor pages list what each vendor says it bills for, with sources and a checked date.

## What if my vendor does not bill per resolution?

You can still run the audit on all AI conversations to get the strict rate. Without a billed marker there is no phantom count and no dollars at risk, but the strict rate and the reasons still show how often the AI conversations ended with no visible failure. Some vendors (for example Freshworks and Salesforce) bill per session or per conversation, so the billed-resolution comparison does not apply to them.

## Why is a price field empty for some vendors?

Because the price is not public or could not be confirmed. Resolvara does not guess. Enter the figure from your contract or invoice, and the dollars-at-risk figure will use it.

## Are you affiliated with any vendor?

No. Resolvara is an independent open project. It publishes each vendor's own published definitions with source links and a checked date, and it corrects them when a vendor tells us they are wrong.

## Why is it open source?

Because the point is trust. A measurement that decides how you read an invoice should be inspectable. The code is MIT licensed and the Standard text is CC BY 4.0, so you can read the rules, run them yourself, reuse them, and propose changes.

## What is the community benchmark?

An opt-in collection of anonymous aggregates. When you contribute you pick the vendor from a fixed list. A vendor's numbers are not shown until at least 30 contributions exist for it, only contributions made with the default 7-day window are compared, and the benchmark page explains how the numbers are produced. Sample data is never accepted.

## How do I report a mistake or suggest a change to the Standard?

Open an issue or a pull request on the repository. For a vendor fact, include the source link. For a change to the Standard, describe the case it gets wrong and the data that shows it. See CONTRIBUTING.md.
