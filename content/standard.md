# The Strict Resolution Standard v0.1

Status: draft for public comment. Licence: CC BY 4.0. Maintained by the Resolvara contributors.

## 1. Purpose

AI support agents are increasingly billed per resolution. The vendor defines which conversations count as resolved, and the vendor counts them. A customer who gives up, asks for a person, or comes back two days later with the same problem can still be billed as "resolved".

The Strict Resolution Standard is a neutral, public, versioned test that a buyer can apply to their own export. It answers one question: of the conversations my AI agent was billed for, how many show no sign of failure in the data I hold?

It is a measurement, not a verdict. It does not replace your contract, and it does not decide what you owe. It gives you evidence to bring to that conversation.

## 2. Definitions

**AI conversation.** A conversation in which an AI agent took part. Conversations handled only by humans are out of scope.

**Billed resolution.** An AI conversation that the vendor counts as a billable resolution (or outcome, or automated interaction) on the invoice or usage report. The vendor's own count is taken as given. The Standard does not re-decide what was billed.

**Strict resolution.** A billed or unbilled AI conversation that is old enough to judge (not in the pending window), has a customer identifier, and shows none of the five fail signals in section 4. A strict resolution is a conversation with no visible sign of failure. It is not proof that the customer's problem was solved.

**Confirmed pass.** A strict resolution that also carries positive evidence: the vendor state is "confirmed", or the customer gave an explicit positive rating. An explicit positive rating is a satisfaction score of 0.75 or more on the 0..1 scale (4 or 5 on a 1-to-5 scale). Confirmed passes are reported separately so that silence-only passes can be seen.

**Phantom resolution.** A billed AI conversation that shows at least one fail signal. The phrase means "billed but not strictly resolved". It does not mean the vendor acted dishonestly (see section 6).

**Pending window.** The most recent W days of the export. A conversation created inside this window has not had time to show a repeat contact or reopen, so it cannot be judged yet. It is excluded from every rate and shown separately.

**Not strict, not billed.** An AI conversation that shows a fail signal but that the vendor did not bill. It counts as not strictly resolved (it lowers the strict rate) and is never a phantom resolution, because nothing was billed for it.

**Unverifiable.** A conversation that has no customer identifier and shows no fail signal. Without an identifier the repeat-contact test cannot run, so the Standard cannot say the conversation passed. It is unjudged, not failed: it is left out of every rate and shown separately.

**Window (W).** The look-ahead period, in days, used by the pending window and by the repeat-contact and reopen signals. Default 7.

## 3. Verdicts

Every AI conversation receives exactly one verdict, evaluated in this order.

1. **Pending window.** If `createdAt` is later than `exportEnd - W`, the verdict is `pending_window`. No other rule is applied. `exportEnd` defaults to the latest `createdAt` in the file.
2. **Phantom.** If the conversation is billed and at least one fail signal fires, the verdict is `phantom`. All firing signals are recorded as reasons, each with an evidence string.
3. **Not strict, not billed.** If the conversation is not billed and a fail signal fires, the verdict is `fail_unbilled`: it is counted as not strictly resolved, with the same reasons, but it is not a phantom resolution.
4. **Unverifiable.** If no fail signal fires and there is no customer identifier, the verdict is `unverifiable`. A fail signal that is present always wins, because it is evidence on its own.
5. **Confirmed pass.** No fail signal, and the vendor state is "confirmed" or the customer gave an explicit positive rating.
6. **Strict pass.** No fail signal and no positive evidence.

## 4. The five fail signals

Defaults are version 0.1 values. Every parameter is user-adjustable, and a report must state the values it used.

| Signal | Fires when | Default |
|---|---|---|
| `vendor_escalated` | The vendor's own state for the conversation is escalated, handoff or negative feedback. | n/a |
| `human_handoff` | A human or admin replied after the AI in that conversation. If an export cannot show that the reply came after the AI took part, the signal is not used for that conversation and the report says so. | n/a |
| `reopened` | The reopen count is greater than 0, or the conversation was reopened within W days when timestamps allow it. | W = 7 days |
| `repeat_contact` | The same customer opened another conversation whose creation time falls in (this creation time, this creation time + W]. | W = 7 days; same-topic filter off |
| `negative_csat` | A satisfaction score exists and is below the threshold, on a scale normalised to 0..1. | threshold 0.4 |

Exact rules:

- **vendor_escalated.** The states counted are escalated, handoff and negative_feedback. Older vendor names for the same states (for example "routed to team" or "abandoned") are mapped to these before the test.
- **human_handoff.** Any human reply after the AI counts, even a courtesy reply. Some vendors do not treat a later human involvement as a failure (for example HubSpot's manual assignment rule). The Standard does, because the question it asks is whether a human was needed, not whether the vendor's rule was met. The reply must be shown to come after the AI took part. Intercom exports show it through the reply and AI timestamps, and Ada's handoffs go from the bot to a human. The Zendesk `Agent replies` column is a count for the whole ticket and cannot show the order, so for Zendesk exports the signal is off by default and the report says so. The user can turn it on with the option "Count agent replies as human handoff (cannot confirm order)"; the report then states that some of the counted replies may predate the AI, and the evidence line says the order is not confirmed. A column the user maps by hand as "Human reply after the AI" is taken as that user's statement of the order and counts without the option.
- **reopened.** Uses the reopen count where the export provides one. A count above zero is a reopen at any time, because a count has no dates. Where the export also gives a reopen timestamp, the reopen counts only if it falls within W days of the conversation's creation (inclusive at W), judged like a repeat contact, and the window sensitivity table follows it. Without a timestamp the count decides.
- **repeat_contact.** The interval is open at the start and closed at the end: a later conversation at exactly this creation time does not count, and one exactly W days later does. Where a customer has several conversations in a row, each is judged against the next one within W, so a chain of three contacts makes the first two fail and leaves the last to be judged on its own. The evidence string names the other conversation and the gap in days to one decimal place.
- **Same-topic filter (optional).** When on, a repeat contact only fires if the topic text of the two conversations has a local text-similarity score of at least 0.35 (TF-IDF cosine, computed in the browser). The filter lowers false positives and raises false negatives. It needs topic text in the export.
- **negative_csat.** Scores are normalised to 0..1 by the scale of the rating, before the comparison: a 1-to-5 rating of 2 becomes 0.25, and a 1-to-10 rating of 4 becomes one third. The scale comes from the vendor or from the user; it is never worked out from the lowest and highest score in the file, because a file that only holds 4s and 5s would turn every 4 into zero. A missing score never fires the signal, and a score whose scale is unknown is ignored with a note. The comparison is strictly below the threshold.

## 5. Edge cases

- **Boundary.** A conversation created exactly W days before `exportEnd` is not pending (the pending test is strictly "later than"). A repeat contact exactly W days later is counted.
- **Duplicate rows.** Rows with the same conversation id are deduplicated before any rule runs.
- **Time zones.** Timestamps with an offset are converted. Timestamps without an offset are treated as UTC and a warning is reported.
- **Missing columns.** A missing optional column disables the signals that need it and produces a warning. It never causes an error, and a report states which signals were unavailable.
- **No customer key.** The repeat-contact signal cannot run. A conversation that shows another fail signal is still judged (phantom or not strict, not billed). One that shows none is `unverifiable`.
- **Empty or all-pending files.** The report shows zero rates and says why.
- **Pending conversations and rates.** Pending conversations are removed from the denominator of every rate. The report shows their count.
- **Unbilled conversations.** The Standard still evaluates them so that a strict rate over all AI conversations can be given next to the billed rate.
- **Reported rates.** All rates use one population, the judged AI conversations: AI conversations minus pending minus unverifiable. The strict rate is (strict passes + confirmed passes) divided by the judged conversations. The billed rate is the billed judged conversations divided by the judged conversations, so it can be set beside the strict rate. The phantom share of billed is phantom conversations divided by the billed judged conversations. A conversation that is billed but still pending or unverifiable is in none of these. The report also shows the vendor's full billed count, which is what the invoice counts.
- **Reason counts.** The count per fail signal is taken over phantom conversations only. One conversation can carry several reasons, so the counts can add up to more than the number of phantom conversations. The anonymous contribution reports each reason as the share of phantom conversations that carry it.
- **Window sensitivity.** Reports should show results for W = 1, 3, 7, 14 and 30 days next to the chosen window, because the result depends on it.

## 6. What the Standard is not

- It is **not an accusation of fraud or bad faith**. Vendors publish their definitions and bill by them. The Standard applies a different, stricter definition to the same data and shows the gap.
- It is **not a claim that a phantom resolution is an error in the invoice**. A conversation can be correctly billed under the contract and still fail the Standard.
- It is **not proof that the customer's problem was unsolved**. A repeat contact may be about a different issue. This is why the window is adjustable and the same-topic filter exists, and why results are reported as signals with evidence, not as findings of fact.
- It is **not a measure of customer satisfaction or of AI quality**. A strict pass is the absence of visible failure.
- It is **not legal or financial advice**.

## 7. Using the result

The result is evidence for a conversation with your vendor. A defensible use: export the flagged conversations, read a sample by hand, and send the vendor the ones you believe were wrongly counted, with the reason for each. State the window and thresholds you used. Expect that the vendor will apply its own contract definition.

## 8. Versioning and changelog

The Standard uses a major.minor version. A change to any default or any rule is a new version. Reports must state the version that produced them.

- **0.1 (2026-10-24).** First public draft. Five fail signals, pending window, default window of 7 days, CSAT threshold of 0.4, optional same-topic filter at 0.35. Clarified before publication, after an independent review: the not-strict-not-billed verdict, one population for all rates, unverifiable conversations left out of the rates, the explicit positive rating (0.75), the CSAT scale rule, the order of a human reply (including the Zendesk agent-reply option), the handling of reopen counts and reopen timestamps, and the reason-count population.

Known limitations of 0.1, which are candidates for later versions:

- Repeat contact is a proxy and can over-count when a customer returns about a different issue.
- A human reply is counted even when it was only a courtesy message.
- The Standard does not read message text, so it cannot detect an AI answer that was wrong but unchallenged.
- Silence is not treated as failure. A customer who leaves without a trace and never returns passes.

## 9. How to cite

> Resolvara contributors. *The Strict Resolution Standard, version 0.1.* 2026. Licensed under CC BY 4.0. Retrieved from the Resolvara website.

Include the version number. Please link to the page you used.

## 10. Licence

This text is licensed under the Creative Commons Attribution 4.0 International licence (CC BY 4.0): https://creativecommons.org/licenses/by/4.0/. You may share and adapt it, including commercially, with attribution. The Resolvara software is licensed separately under the MIT licence.
