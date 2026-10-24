import type { AuditReport } from "@/engine";
import { int, pct } from "./format";

export function SensitivityTable({
  report,
  windowDays,
  onPick,
}: {
  report: AuditReport;
  windowDays: number;
  onPick: (days: number) => void;
}) {
  return (
    <section aria-labelledby="sens-h">
      <h2 id="sens-h" className="text-base font-semibold tracking-tight">
        How much the window matters
      </h2>
      <p className="mt-1 text-sm text-ink-3">
        The same file judged with five different look-ahead windows. Pick a row to use it.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-sm">
          <thead>
            <tr className="text-ink-3">
              <th scope="col" className="py-2 pr-4 font-medium">
                Window
              </th>
              <th scope="col" className="py-2 pr-4 text-right font-medium">
                Phantom
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Overall strict rate
              </th>
            </tr>
          </thead>
          <tbody>
            {report.sensitivity.map((row) => {
              const active = row.windowDays === windowDays;
              return (
                <tr key={row.windowDays} className={active ? "bg-surface-2" : ""}>
                  <th scope="row" className="py-1 pr-4 font-normal">
                    <button
                      type="button"
                      onClick={() => onPick(row.windowDays)}
                      aria-pressed={active}
                      className="flex min-h-10 items-center gap-2 rounded-[var(--radius)] px-2 text-left hover:underline"
                    >
                      <span className="num font-semibold">{row.windowDays}</span>
                      <span>{row.windowDays === 1 ? "day" : "days"}</span>
                      {active && <span className="stamp stamp-muted">In use</span>}
                    </button>
                  </th>
                  <td className="num py-1 pr-4 text-right font-semibold">{int(row.phantom)}</td>
                  <td className="num py-1 pr-2 text-right font-semibold">{pct(row.strictRate)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
