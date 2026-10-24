import type { AuditReport } from "@/engine";
import { int } from "./format";
import { REASON_LABEL, REASON_ORDER } from "./meta";

export function ReasonBars({ report }: { report: AuditReport }) {
  const rows = REASON_ORDER.map((r) => ({ r, n: report.byReason?.[r] ?? 0 }));
  const max = Math.max(1, ...rows.map((x) => x.n));
  const total = rows.reduce((a, x) => a + x.n, 0);

  return (
    <section aria-labelledby="reasons-h">
      <h2 id="reasons-h" className="text-base font-semibold tracking-tight">
        Why they failed
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        One conversation can fail for several reasons, so the counts can add up to more than the
        phantom total.
      </p>
      {total === 0 ? (
        <p className="mt-5 text-sm text-ink-2">No failure reasons were found in this file.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map(({ r, n }) => (
            <li key={r}>
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-ink">{REASON_LABEL[r]}</span>
                <span className="num font-semibold">{int(n)}</span>
              </div>
              <div
                className="bar-grow mt-1.5 h-2 rounded-[2px] bg-accent transition-[width] duration-500 ease-out"
                style={{ width: `${Math.max(n > 0 ? 1.5 : 0, (n / max) * 100)}%` }}
                role="presentation"
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
