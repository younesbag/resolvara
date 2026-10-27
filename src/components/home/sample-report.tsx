import { cache } from "react";
import { audit, parseFile, sampleDataset, simulateBilling, type ConvResult, type Reason } from "@/engine";
import { BillComparison } from "../auditor/bill-comparison";
import { dateShort, int, money, pct } from "../auditor/format";
import { DEFAULT_PRICE, REASON_LABEL, REASON_ORDER, REASON_SHORT } from "../auditor/meta";
import { Stamp } from "../stamp";
import { TrackSeen } from "../track-seen";
import { SampleButton } from "./sample-button";

export const SAMPLE_REPORT_ID = "sample-report";

// An audit of the built-in synthetic Intercom sample, computed on the server with the same engine the
// tool runs in the browser. Nothing here is typed in by hand. The hero quotes the same run.
export const sampleReport = cache(async () => {
  const { conversations } = await parseFile(sampleDataset("intercom"), { preset: "intercom" });
  const report = audit(
    conversations,
    { windowDays: 7, pricePerResolution: DEFAULT_PRICE.intercom, sameTopicOnly: false, negativeCsatThreshold: 0.4 },
    "intercom",
  );
  return { report, simulation: simulateBilling(conversations, report) };
});

/** One flagged example per reason, in the Standard's order, so the list shows the variety. */
function examples(results: ConvResult[]): ConvResult[] {
  const picked: ConvResult[] = [];
  const seen = new Set<Reason>();
  for (const reason of REASON_ORDER) {
    const hit = results.find((r) => r.verdict === "phantom" && r.reasons[0] === reason && !seen.has(reason));
    if (hit) {
      picked.push(hit);
      seen.add(reason);
    }
  }
  return picked.slice(0, 4);
}

export async function SampleReport() {
  const { report, simulation } = await sampleReport();
  const reasons = REASON_ORDER.map((r) => ({ r, n: report.byReason[r] })).filter((x) => x.n > 0);
  const max = Math.max(1, ...reasons.map((x) => x.n));
  const rows = examples(report.results);

  return (
    <section id={SAMPLE_REPORT_ID} aria-labelledby="sample-h" className="scroll-mt-16 border-y border-line bg-surface-2">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <h2 id="sample-h" className="text-3xl font-semibold tracking-tight sm:text-4xl">
          This is what you get back.
        </h2>
        <p className="mt-3 max-w-[60ch] text-ink-2">
          A live run on the built-in synthetic Intercom sample: {int(report.aiConversations)} AI conversations
          from {dateShort(report.period.start)} to {dateShort(report.period.end)}, run by the same code
          as the tool above.
        </p>

        <div className="mt-10 overflow-hidden rounded-[var(--radius)] border border-line bg-surface shadow-[0_1px_2px_rgb(15_19_23/0.04),0_24px_48px_-24px_rgb(15_19_23/0.18)]">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12 lg:p-10">
            <div>
              <p className="text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
                <span className="num-lg text-accent">{pct(report.phantomShareOfBilled, 0)}</span> of billed
                resolutions failed the strict test.
              </p>
              <TrackSeen name="sample_report_seen" />
              <dl className="mt-8 grid grid-cols-3 gap-4 sm:gap-6">
                <div>
                  <dt className="text-sm text-ink-3">Billed as resolved</dt>
                  <dd className="num-lg mt-1 text-2xl font-semibold sm:text-3xl">{int(report.billedJudged)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-3">Really resolved</dt>
                  <dd className="num-lg mt-1 text-2xl font-semibold text-pass sm:text-3xl">{int(report.billedStrictPass)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-3">At $0.99 each</dt>
                  <dd className="num-lg mt-1 text-2xl font-semibold text-accent sm:text-3xl">{money(report.dollarsAtRisk)}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-sm font-semibold">Why they failed</h3>
              <ul className="mt-4 space-y-3">
                {reasons.map(({ r, n }) => (
                  <li key={r}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span>{REASON_LABEL[r]}</span>
                      <span className="num font-semibold">{int(n)}</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 rounded-full bg-accent"
                      style={{ width: `${Math.max(4, (n / max) * 100)}%` }}
                      role="presentation"
                    />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-line">
            <h3 className="sr-only">Examples from the dispute file</h3>
            <ul className="divide-y divide-line">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="grid gap-2 px-6 py-4 text-sm sm:grid-cols-[auto_8rem_9rem_minmax(0,1fr)] sm:items-center sm:gap-6 sm:px-8 lg:px-10"
                >
                  <span className="justify-self-start">
                    <Stamp verdict={row.verdict} />
                  </span>
                  <span className="num text-ink-2">{row.id}</span>
                  <span className="font-medium">{row.reasons.map((r) => REASON_SHORT[r]).join(", ")}</span>
                  <span className="text-ink-2">{row.evidence[0]}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <BillComparison simulation={simulation} sample />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
          <SampleButton preset="intercom">Open this sample in the tool</SampleButton>
          <p className="text-sm text-ink-2">
            Every flagged conversation lands in a dispute CSV with its reason, plus an email draft.
          </p>
        </div>
      </div>
    </section>
  );
}
