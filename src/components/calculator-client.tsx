"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { int, money } from "./auditor/format";

function num(t: string): number {
  const n = Number(t.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function CalculatorClient() {
  // Example values so the page is not empty. They are placeholders, not findings.
  const [volume, setVolume] = useState("10000");
  const [price, setPrice] = useState("1.00");
  const [share, setShare] = useState("20");

  const calc = useMemo(() => {
    const v = num(volume);
    const p = num(price);
    const s = Math.min(100, num(share)) / 100;
    const monthlySpend = v * p;
    const monthlyRisk = monthlySpend * s;
    return { v, p, s, monthlySpend, monthlyRisk, annualRisk: monthlyRisk * 12, per1k: 1000 * p * s };
  }, [volume, price, share]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-6 rounded-[var(--radius)] border border-line bg-surface p-5 sm:p-6"
        aria-label="Calculator inputs"
      >
        <div>
          <label htmlFor="c-volume" className="field-label">
            Billed resolutions per month
          </label>
          <input
            id="c-volume"
            className="field num"
            inputMode="numeric"
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
          />
          <p className="field-help">From your invoice or usage report.</p>
        </div>
        <div>
          <label htmlFor="c-price" className="field-label">
            Price per resolution (USD)
          </label>
          <div className="relative">
            <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              $
            </span>
            <input
              id="c-price"
              className="field num pl-7"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <p className="field-help">Your contract rate. Check the vendor page for published prices.</p>
        </div>
        <div>
          <label htmlFor="c-share" className="field-label">
            Phantom share of billed (%)
          </label>
          <input
            id="c-share"
            className="field num"
            inputMode="decimal"
            value={share}
            onChange={(e) => setShare(e.target.value)}
          />
          <p className="field-help">
            Your own assumption. The 20 is a placeholder, not a finding. The audit gives you your real
            share.
          </p>
        </div>
        <Link href="/#audit" className="btn btn-primary w-full">
          Measure my real share
        </Link>
      </form>

      <div>
        <p className="text-sm font-medium text-ink-2">Billed but not strictly resolved, per year</p>
        <p
          className="num-lg mt-2 text-6xl font-semibold leading-none text-accent sm:text-8xl"
          aria-live="polite"
        >
          {money(calc.annualRisk)}
        </p>
        <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-line pt-6">
          <div>
            <dt className="text-sm font-medium text-ink-2">Per month</dt>
            <dd className="num-lg mt-1 text-3xl font-semibold">{money(calc.monthlyRisk)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink-2">Monthly resolution spend</dt>
            <dd className="num-lg mt-1 text-3xl font-semibold">{money(calc.monthlySpend)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink-2">Per 1,000 billed resolutions</dt>
            <dd className="num-lg mt-1 text-3xl font-semibold">{money(calc.per1k)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink-2">Phantom resolutions per month</dt>
            <dd className="num-lg mt-1 text-3xl font-semibold">{int(calc.v * calc.s)}</dd>
          </div>
        </dl>

        <h2 className="mt-12 text-base font-semibold tracking-tight">If your share were different</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-sm">
            <thead className="text-ink-3">
              <tr>
                <th scope="col" className="py-2 pr-4 font-medium">Phantom share</th>
                <th scope="col" className="py-2 pr-4 text-right font-medium">Per month</th>
                <th scope="col" className="py-2 text-right font-medium">Per year</th>
              </tr>
            </thead>
            <tbody>
              {[5, 10, 20, 30].map((s) => (
                <tr key={s} className="border-t border-line">
                  <th scope="row" className="num py-2 pr-4 font-semibold">{s}%</th>
                  <td className="num py-2 pr-4 text-right">{money(calc.monthlySpend * (s / 100))}</td>
                  <td className="num py-2 text-right">{money(calc.monthlySpend * (s / 100) * 12)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 max-w-[56ch] text-sm text-ink-3">
          Phantom means billed but not strictly resolved under the Standard. It is not the same as an
          invoice error, and what you can recover depends on your contract. Nothing here is uploaded.
        </p>
      </div>
    </div>
  );
}
