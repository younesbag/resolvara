"use client";

import { useMemo, useState } from "react";
import { Check, Copy, DownloadSimple } from "@phosphor-icons/react";
import {
  CREDIT_LABELS,
  DEFAULT_OPTIONS,
  buildClauses,
  csatOnFiveScale,
  normalizeOptions,
  toMarkdown,
  toPlainText,
  type CreditRule,
  type SilenceRule,
} from "@/engine/contract-clause";

interface Form {
  vendorName: string;
  customerName: string;
  windowDays: string;
  csat: string;
  silence: SilenceRule;
  disputeDays: string;
  credit: CreditRule;
  receiptCounts: boolean;
}

const INITIAL: Form = {
  vendorName: "",
  customerName: "",
  windowDays: String(DEFAULT_OPTIONS.windowDays),
  csat: String(DEFAULT_OPTIONS.csatThreshold),
  silence: DEFAULT_OPTIONS.silence,
  disputeDays: String(DEFAULT_OPTIONS.disputeDays),
  credit: DEFAULT_OPTIONS.credit,
  receiptCounts: DEFAULT_OPTIONS.receiptCounts,
};

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ContractClient({ standardVersion }: { standardVersion: string }) {
  const [f, setF] = useState<Form>(INITIAL);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const opts = useMemo(
    () =>
      normalizeOptions({
        vendorName: f.vendorName,
        customerName: f.customerName,
        windowDays: f.windowDays.trim() === "" ? undefined : Number(f.windowDays),
        csatThreshold: f.csat.trim() === "" ? undefined : Number(f.csat),
        silence: f.silence,
        disputeDays: f.disputeDays.trim() === "" ? undefined : Number(f.disputeDays),
        credit: f.credit,
        receiptCounts: f.receiptCounts,
      }),
    [f],
  );
  const doc = useMemo(() => buildClauses(opts, standardVersion), [opts, standardVersion]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(toPlainText(doc));
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-14">
      <form
        onSubmit={(e) => e.preventDefault()}
        className="space-y-6 self-start rounded-[var(--radius)] border border-line bg-surface p-5 sm:p-6"
        aria-label="Clause settings"
      >
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label htmlFor="k-vendor" className="field-label">Vendor name</label>
            <input
              id="k-vendor"
              className="field"
              placeholder="the Vendor"
              value={f.vendorName}
              maxLength={120}
              onChange={(e) => set("vendorName", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="k-customer" className="field-label">Customer name</label>
            <input
              id="k-customer"
              className="field"
              placeholder="the Customer"
              value={f.customerName}
              maxLength={120}
              onChange={(e) => set("customerName", e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label htmlFor="k-window" className="field-label">Judgement window (days)</label>
            <input
              id="k-window"
              type="number"
              min={1}
              max={90}
              className="field num"
              inputMode="numeric"
              value={f.windowDays}
              onChange={(e) => set("windowDays", e.target.value)}
            />
            <p className="field-help">How long a conversation is watched before it can be billed. The Standard uses 7.</p>
          </div>
          <div>
            <label htmlFor="k-csat" className="field-label">Rating threshold (0 to 1)</label>
            <input
              id="k-csat"
              type="number"
              min={0.05}
              max={1}
              step={0.05}
              className="field num"
              inputMode="decimal"
              value={f.csat}
              onChange={(e) => set("csat", e.target.value)}
            />
            <p className="field-help">
              A score below this fails. The Standard uses 0.4, which is below {csatOnFiveScale(opts.csatThreshold)} on a 1 to 5 scale.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="k-silence" className="field-label">A customer who goes silent</label>
          <select
            id="k-silence"
            className="field"
            value={f.silence}
            onChange={(e) => set("silence", e.target.value as SilenceRule)}
          >
            <option value="reported">May be billed, but is reported separately</option>
            <option value="never">Never billable; positive evidence required</option>
          </select>
          <p className="field-help">
            The first matches the Standard, which counts silence as a pass but reports confirmed passes apart.
          </p>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
            checked={f.receiptCounts}
            onChange={(e) => set("receiptCounts", e.target.checked)}
          />
          <span>
            <span className="block font-medium">A system receipt counts as confirmation</span>
            <span className="field-help block">
              A recorded effect of the AI&apos;s action, such as a refund id or an order update, is positive evidence.
            </span>
          </span>
        </label>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
          <div>
            <label htmlFor="k-dispute" className="field-label">Dispute period (days)</label>
            <input
              id="k-dispute"
              type="number"
              min={1}
              max={365}
              className="field num"
              inputMode="numeric"
              value={f.disputeDays}
              onChange={(e) => set("disputeDays", e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="k-credit" className="field-label">Disputed resolutions are</label>
            <select
              id="k-credit"
              className="field"
              value={f.credit}
              onChange={(e) => set("credit", e.target.value as CreditRule)}
            >
              {(Object.keys(CREDIT_LABELS) as CreditRule[]).map((k) => (
                <option key={k} value={k}>{CREDIT_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="border-t border-line pt-4 text-sm text-ink-3">
          A human reply after the AI always counts as a failure. The Standard has no exception for courtesy replies, so
          this page does not offer one.
        </p>
      </form>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={copy}>
            {copied === "ok" ? <Check size={18} weight="bold" aria-hidden /> : <Copy size={18} weight="bold" aria-hidden />}
            {copied === "ok" ? "Copied" : copied === "failed" ? "Copy failed" : "Copy"}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => download("billable-resolution-clause.txt", toPlainText(doc), "text/plain;charset=utf-8")}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden />
            .txt
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => download("billable-resolution-clause.md", toMarkdown(doc), "text/markdown;charset=utf-8")}
          >
            <DownloadSimple size={18} weight="bold" aria-hidden />
            .md
          </button>
          <span className="sr-only" aria-live="polite">
            {copied === "ok" ? "Clause copied to the clipboard" : copied === "failed" ? "Copy failed" : ""}
          </span>
        </div>

        <article
          aria-label="Clause preview"
          className="mt-4 rounded-[var(--radius)] border border-line bg-surface p-5 text-[0.9375rem] leading-relaxed sm:p-8"
        >
          <h2 className="text-xl font-semibold tracking-tight">{doc.title}</h2>
          <p className="mt-3 text-ink-2">{doc.preamble}</p>
          {doc.clauses.map((c) => (
            <section key={c.number} className="mt-8">
              <h3 className="text-base font-semibold tracking-tight">
                {c.number}. {c.heading}
              </h3>
              <div className="mt-3 space-y-2">
                {c.lines.map((l, i) => (
                  <p key={`${c.number}-${i}`} className={`flex gap-3 text-ink-2 ${l.sub ? "ml-7" : ""}`}>
                    <span className="num w-8 shrink-0 text-ink-3">{l.ref}</span>
                    <span className="min-w-0 [overflow-wrap:anywhere]">{l.text}</span>
                  </p>
                ))}
              </div>
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
