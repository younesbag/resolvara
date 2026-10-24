"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AuditReport } from "@/engine";
import { int } from "./format";

const H = 220;
const PAD = { top: 12, right: 12, bottom: 34, left: 44 };

function niceMax(v: number): number {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function WeeklyChart({ weekly }: { weekly: AuditReport["weekly"] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  const data = useMemo(() => weekly ?? [], [weekly]);
  const n = data.length;
  const has = n > 0;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [has]);

  const maxVal = niceMax(Math.max(1, ...data.map((d) => Math.max(d.billed, d.strictPass, d.phantom))));

  const innerMin = PAD.left + PAD.right;
  const minStride = 38;
  const stride = n > 0 ? Math.max(minStride, (width - innerMin) / n) : minStride;
  const svgW = Math.max(width, Math.ceil(n * stride + innerMin));
  const plotH = H - PAD.top - PAD.bottom;
  const barW = Math.min(10, Math.max(5, (stride - 10) / 3));
  const y = (v: number) => PAD.top + plotH - (v / maxVal) * plotH;
  const ticks = [0, maxVal / 2, maxVal];
  const labelEvery = Math.max(1, Math.ceil(54 / stride));

  return (
    <section aria-labelledby="weekly-h">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="weekly-h" className="text-base font-semibold tracking-tight">
          Week by week
        </h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2" aria-label="Chart legend">
          <li className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-ink-3" aria-hidden />
            Billed
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-pass" aria-hidden />
            Strict pass
          </li>
          <li className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden />
            Phantom
          </li>
        </ul>
      </div>

      {n === 0 ? (
        <p className="mt-4 text-sm text-ink-2">There is not enough dated data for a weekly view.</p>
      ) : (
        <div ref={wrapRef} className="mt-4 overflow-x-auto">
          <svg
            width={svgW}
            height={H}
            viewBox={`0 0 ${svgW} ${H}`}
            role="img"
            aria-label={`Weekly counts of billed, strictly passed and phantom conversations across ${n} weeks. The data table below has the same numbers.`}
            className="block text-ink-3"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={svgW - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke="currentColor"
                  strokeOpacity={t === 0 ? 0.6 : 0.2}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill="currentColor"
                  className="num"
                >
                  {int(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = PAD.left + (i + 0.5) * ((svgW - innerMin) / n);
              const bars: [number, string][] = [
                [d.billed, "var(--ink-3)"],
                [d.strictPass, "var(--pass)"],
                [d.phantom, "var(--accent)"],
              ];
              return (
                <g key={d.weekStart}>
                  <title>{`Week of ${weekLabel(d.weekStart)}: ${int(d.billed)} billed, ${int(d.strictPass)} strict pass, ${int(d.phantom)} phantom`}</title>
                  {bars.map(([v, fill], bi) => {
                    const h = Math.max(v > 0 ? 1.5 : 0, (v / maxVal) * plotH);
                    return (
                      <rect
                        key={bi}
                        x={cx + (bi - 1.5) * (barW + 1.5)}
                        y={PAD.top + plotH - h}
                        width={barW}
                        height={h}
                        rx={1.5}
                        fill={fill}
                      />
                    );
                  })}
                  {i % labelEvery === 0 && (
                    <text
                      x={cx}
                      y={H - 12}
                      textAnchor="middle"
                      fontSize={11}
                      fill="currentColor"
                    >
                      {weekLabel(d.weekStart)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {n > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-2">Show as a table</summary>
          <div className="mt-3 max-h-64 overflow-auto">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="text-ink-3">
                <tr>
                  <th scope="col" className="py-1.5 pr-3 font-medium">Week of</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Billed</th>
                  <th scope="col" className="py-1.5 pr-3 text-right font-medium">Strict pass</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Phantom</th>
                </tr>
              </thead>
              <tbody>
                {data.map((d) => (
                  <tr key={d.weekStart} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 font-normal">{weekLabel(d.weekStart)}</th>
                    <td className="num py-1.5 pr-3 text-right">{int(d.billed)}</td>
                    <td className="num py-1.5 pr-3 text-right">{int(d.strictPass)}</td>
                    <td className="num py-1.5 text-right">{int(d.phantom)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
