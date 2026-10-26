import { billSplitSentence, type BillingSimulation, type SimRow } from "@/engine";
import { int, money, pct } from "./format";

// "Same conversations, different bills". No hooks and no browser APIs: it renders on the server
// for the home page sample and in the browser for an uploaded file.

function Bar({ split }: { split: BillingSimulation["billSplit"] }) {
  const parts = [
    { key: "phantom", label: "Fails a signal (phantom)", n: split.phantom, share: split.phantomShare, cls: "bg-accent" },
    { key: "silence", label: "Passes on silence alone", n: split.silenceOnly, share: split.silenceOnlyShare, cls: "bg-ink-3" },
    { key: "positive", label: "Positive evidence", n: split.positive, share: split.positiveShare, cls: "bg-pass" },
  ];
  const desc = parts.map((p) => `${p.label}: ${int(p.n)} (${pct(p.share, 0)})`).join(", ");
  return (
    <div>
      <div
        role="img"
        aria-label={`Of ${int(split.billed)} billed conversations. ${desc}`}
        className="flex h-3 w-full overflow-hidden rounded-[2px] bg-surface-2"
      >
        {parts.map((p) =>
          p.n > 0 ? (
            <span key={p.key} className={`${p.cls} h-full`} style={{ width: `${p.share * 100}%` }} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2">
            <span className={`${p.cls} mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[2px]`} aria-hidden />
            <span>
              <span className="num font-semibold">{pct(p.share, 0)}</span>{" "}
              <span className="text-ink-2">{p.label}</span>
              <span className="num block text-ink-3">{int(p.n)} conversations</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ kind }: { kind: SimRow["kind"] }) {
  if (kind === "modelled") return <span className="stamp stamp-muted">Modelled</span>;
  if (kind === "upper_bound") return <span className="stamp stamp-muted">Upper bound</span>;
  return null;
}

export function BillComparison({
  simulation,
  sample = false,
}: {
  simulation: BillingSimulation;
  sample?: boolean;
}) {
  if (simulation.judged <= 0) return null;
  const { rows, billSplit, monthlyFactor } = simulation;
  const sentence = billSplitSentence(billSplit);
  const notes = rows.filter((r) => r.kind === "modelled" || r.kind === "upper_bound");
  const noteIndex = new Map(notes.map((r, i) => [r.id, i + 1]));

  return (
    <section aria-labelledby="bills-h">
      <h2 id="bills-h" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Same conversations, different bills
      </h2>
      {sentence && <p className="mt-3 max-w-[62ch] text-ink-2">{sentence}</p>}
      {sample && <p className="mt-1 text-sm text-ink-3">Sample data.</p>}

      {billSplit.billed > 0 && (
        <div className="mt-6">
          <Bar split={billSplit} />
        </div>
      )}

      <p className="mt-8 max-w-[62ch] text-sm text-ink-2">
        Each row counts the {int(simulation.judged)} judged AI conversations under one vendor&apos;s
        published billing rule, at list price. Modelled rows use only the fields in your export; they
        are not the vendor&apos;s own count.
      </p>

      <div className="mt-4 overflow-x-auto rounded-[var(--radius)] border border-line bg-surface">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-ink-3">
              <th scope="col" className="px-4 py-3 font-medium">Rule</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Conversations</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Share</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">List price</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">This export</th>
              {monthlyFactor !== null && (
                <th scope="col" className="px-4 py-3 text-right font-medium">≈ per month</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => {
              const n = noteIndex.get(r.id);
              const emphasis = r.kind === "actual" || r.kind === "standard";
              return (
                <tr key={r.id} className={r.kind === "actual" ? "bg-surface-2" : ""}>
                  <th scope="row" className="px-4 py-3 align-top font-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={emphasis ? "font-semibold" : "font-medium"}>{r.label}</span>
                      <Tag kind={r.kind} />
                      {n !== undefined && (
                        <a href={`#bills-note-${n}`} className="num text-ink-3 hover:underline" aria-label={`Note ${n}`}>
                          [{n}]
                        </a>
                      )}
                    </div>
                    <p className="mt-1 max-w-[44ch] text-ink-3">{r.ruleSummary}</p>
                  </th>
                  <td className="num px-3 py-3 text-right align-top font-semibold">{int(r.billable)}</td>
                  <td className="num px-3 py-3 text-right align-top">{pct(r.share, 1)}</td>
                  <td className="num px-3 py-3 text-right align-top">
                    {r.listPrice === null ? "n/a" : money(r.listPrice)}
                  </td>
                  <td className="num px-3 py-3 text-right align-top font-semibold">
                    {r.dollars === null ? (
                      <span className="font-normal text-ink-3">{r.kind === "upper_bound" ? "No public price" : "Set a price"}</span>
                    ) : (
                      money(r.dollars)
                    )}
                  </td>
                  {monthlyFactor !== null && (
                    <td className="num px-4 py-3 text-right align-top">
                      {r.dollars === null ? "n/a" : money(r.dollars * monthlyFactor)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {simulation.notes.map((n) => (
        <p key={n} className="mt-4 max-w-[78ch] text-sm text-ink-2">
          {n}
        </p>
      ))}

      <ol className="mt-5 max-w-[78ch] space-y-2 text-sm text-ink-3">
        {notes.map((r, i) => (
          <li key={r.id} id={`bills-note-${i + 1}`} className="flex gap-2">
            <span className="num shrink-0">[{i + 1}]</span>
            <span>
              <span className="font-medium text-ink-2">{r.label}.</span> {r.caveat}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
