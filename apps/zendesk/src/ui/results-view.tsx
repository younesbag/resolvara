import { useEffect, useRef, useState } from "react";
import { Copy, DownloadSimple, Info } from "@phosphor-icons/react";
import type { AuditReport } from "@/engine";
import { BigNumbers } from "@/components/auditor/big-numbers";
import { FlaggedTable } from "@/components/auditor/flagged-table";
import { dateShort, int, pct } from "@/components/auditor/format";
import { ReasonBars } from "@/components/auditor/reason-bars";
import { SensitivityTable } from "@/components/auditor/sensitivity-table";
import { WeeklyChart } from "@/components/auditor/weekly-chart";
import type { MapStats } from "../types";
import { PresetSelect, waitText } from "./progress";
import type { AppApi } from "./use-app";

export function ResultsView({ api }: { api: AppApi }) {
  const { state } = api;
  const report = state.report;
  if (!report) return null;

  const empty = report.aiConversations === 0;
  const judged = report.billedJudged;
  const warnings = [
    ...state.parseWarnings,
    ...report.warnings,
    ...(report.rowsSkipped > 0 ? [`${int(report.rowsSkipped)} rows could not be read and were skipped.`] : []),
  ].filter((w, i, a) => a.indexOf(w) === i);
  const sourceLine =
    state.source === "api"
      ? `Read from this Zendesk, last ${state.periodDays} days`
      : state.label;

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="rise">
        <p className="text-sm text-ink-3">
          {sourceLine},{" "}
          {state.source === "api" && state.stats
            ? `${int(state.stats.aiConversations)} AI-agent conversations`
            : `${int(report.rowsRead)} rows`}
          , {dateShort(report.period?.start)} to {dateShort(report.period?.end)}
        </p>
        <h2 className="mt-2 max-w-[34ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {empty
            ? state.source === "api"
              ? "No AI-agent conversations found in this period."
              : "No AI conversations found in this file."
            : judged <= 0
              ? "Nothing billed is old enough to judge yet."
              : report.phantom === 0
                ? "No billed resolution fails the strict test."
                : `${pct(report.phantomShareOfBilled, 0)} of billed resolutions fail the strict test.`}
        </h2>
        {!empty && (
          <p className="mt-3 max-w-[60ch] text-ink-2">
            Phantom means billed but not strictly resolved, judged on your own data with a {state.opts.windowDays}-day
            window. It is evidence for a conversation with the vendor, not an accusation.
          </p>
        )}
      </header>

      {state.notice && (
        <p
          role="alert"
          className="flex items-start justify-between gap-4 rounded-[var(--radius)] bg-accent-soft p-3 text-sm text-accent-ink"
        >
          <span>{state.notice}</span>
          <button type="button" className="font-medium underline" onClick={api.dismissNotice}>
            Dismiss
          </button>
        </p>
      )}

      {empty ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface p-6">
          <p className="text-ink-2">
            {state.source === "api"
              ? "Zendesk returned no tickets handled by an AI agent in this period. Check that AI agents were active, or try a longer period."
              : `Resolvara read ${int(report.rowsRead)} rows but none were marked as handled by an AI agent. This usually means the format or a column is wrong. Try another export format below.`}
          </p>
          {state.source === "file" && (
            <PresetSelect id="empty-format" value={state.preset} detected={state.detected} onChange={api.changePreset} />
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-secondary" onClick={api.reset}>
              Start over
            </button>
          </div>
        </div>
      ) : (
        <>
          <BigNumbers report={report} opts={{ ...state.opts, exportEnd: undefined }} />
          <Actions api={api} hasPhantom={report.phantom > 0} />
        </>
      )}

      {state.source === "api" && <BilledPanel api={api} />}

      <Notes api={api} warnings={warnings} stats={state.stats} />

      <OptionsPanel api={api} />

      {!empty && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
            <WeeklyChart weekly={report.weekly} />
            <ReasonBars report={report} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14">
            <SensitivityTable report={report} windowDays={state.opts.windowDays} onPick={(d) => api.setOpts({ windowDays: d })} />
            <LeftOut report={report} windowDays={state.opts.windowDays} />
          </div>

          <FlaggedTable results={report.results} total={report.phantom} />
        </>
      )}

      <div>
        <button type="button" className="btn btn-secondary" onClick={api.reset}>
          Start over
        </button>
      </div>
    </div>
  );
}

function LeftOut({ report, windowDays }: { report: AuditReport; windowDays: number }) {
  return (
    <div className="text-sm text-ink-2">
      <h2 className="text-base font-semibold tracking-tight text-ink">What is left out of the rates</h2>
      <ul className="mt-3 space-y-3">
        <li>
          <span className="num font-semibold text-ink">{int(report.pending)}</span> conversations are inside the
          newest {windowDays} days. They have not had time to show a repeat contact, so they are excluded.
        </li>
        <li>
          <span className="num font-semibold text-ink">{int(report.unverifiable)}</span> have no customer key and no
          other fail signal. Without a key a repeat contact cannot be checked, so a pass cannot be shown. They are
          left out of every rate instead of counted as failures.
        </li>
        {report.failUnbilled > 0 && (
          <li>
            <span className="num font-semibold text-ink">{int(report.failUnbilled)}</span> were not billed but show a
            fail signal. They count as not strictly resolved in the strict rate and are not phantom, because nothing
            was billed for them.
          </li>
        )}
      </ul>
    </div>
  );
}

// ---------- actions: dispute CSV + summary ----------

function copyText(text: string): boolean {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function Actions({ api, hasPhantom }: { api: AppApi; hasPhantom: boolean }) {
  const { state } = api;
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"yes" | "manual" | null>(null);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(state.summary);
      ok = true;
    } catch {
      ok = copyText(state.summary);
    }
    setCopied(ok ? "yes" : "manual");
    if (ok) setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="rise">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!hasPhantom || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.downloadDispute();
            } finally {
              setBusy(false);
            }
          }}
        >
          <DownloadSimple size={18} weight="bold" aria-hidden />
          Download dispute CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={copy}>
          <Copy size={18} weight="bold" aria-hidden />
          {copied === "yes" ? "Copied" : "Copy summary"}
        </button>
      </div>
      {copied === "manual" && (
        <div className="mt-4">
          <label htmlFor="summary-manual" className="field-label">
            Copying is blocked here. Select the text and copy it.
          </label>
          <textarea
            id="summary-manual"
            readOnly
            rows={8}
            className="field py-2"
            value={state.summary}
            onFocus={(e) => e.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}

// ---------- billed notice + Usage CSV ----------

function BilledPanel({ api }: { api: AppApi }) {
  const { state } = api;
  const stats = state.stats;
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const usage = state.usage;
  return (
    <section aria-labelledby="billed-h" className="rounded-[var(--radius)] border border-line bg-surface p-5 sm:p-6">
      <h2 id="billed-h" className="text-base font-semibold tracking-tight">
        What counts as billed
      </h2>
      {usage ? (
        <div className="mt-2 text-sm text-ink-2">
          <p>
            Billed comes from your Usage file <span className="font-medium text-ink">{usage.fileName}</span>: column{" "}
            <span className="font-medium text-ink">{usage.column ?? "unknown"}</span>, {int(usage.ids)} ticket ids in{" "}
            {int(usage.rows)} rows.
            {stats && stats.billedByUsageCsv !== null && (
              <>
                {" "}
                <span className="num font-semibold text-ink">{int(stats.billedByUsageCsv)}</span> matched an AI
                conversation in this period and{" "}
                <span className="num font-semibold text-ink">{int(stats.usageCsvUnmatched ?? 0)}</span> did not.
              </>
            )}
          </p>
          <button type="button" className="mt-3 font-medium underline underline-offset-2" onClick={api.clearUsageCsv}>
            Go back to the Resolution tier proxy
          </button>
        </div>
      ) : (
        <div className="mt-2 text-sm text-ink-2">
          <p>
            By default a conversation counts as billed when its Resolution tier is{" "}
            <span className="font-medium text-ink">Verified resolution</span>
            {stats ? (
              <>
                {" "}
                (<span className="num font-semibold text-ink">{int(stats.billedByTier)}</span> found)
              </>
            ) : null}
            . That is a proxy for what Zendesk charges. For the exact list, add the Usage, Resolutions CSV that
            Zendesk emails you from Admin Center.
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void api.loadUsageCsv(f);
            }}
            className={`mt-4 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-dashed px-4 py-4 ${
              over ? "border-ink bg-surface-2" : "border-line-strong"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              aria-label="Choose the Usage CSV"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void api.loadUsageCsv(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
              Add Usage CSV
            </button>
            <span className="text-ink-3">or drop it here. Optional.</span>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- data notes ----------

function Notes({ api, warnings, stats }: { api: AppApi; warnings: string[]; stats: MapStats | null }) {
  const { state } = api;
  const lines: string[] = [];
  if (stats) {
    lines.push(`${int(stats.ticketsRead)} tickets read from Zendesk.`);
    const dropped: string[] = [];
    if (stats.droppedBeforePeriod > 0) dropped.push(`${int(stats.droppedBeforePeriod)} created before the period`);
    if (stats.droppedDeleted > 0) dropped.push(`${int(stats.droppedDeleted)} deleted`);
    if (stats.droppedNoDate > 0) dropped.push(`${int(stats.droppedNoDate)} without a readable date`);
    if (dropped.length > 0) lines.push(`Left out: ${dropped.join(", ")}.`);
    lines.push(`${int(stats.aiConversations)} AI-agent conversations audited.`);
    lines.push(
      stats.replyOrderChecked > 0
        ? `Reply order checked on ${int(stats.replyOrderChecked)} tickets. The rest use the reply count only when "Count agent replies" is on.`
        : "Reply order not checked. Agent replies only count as human handoff when you turn that option on.",
    );
  }
  const all = [...lines, ...warnings];
  if (all.length === 0 || !state.report) return null;
  return (
    <details className="rounded-[var(--radius)] border border-line bg-surface p-4 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Info size={18} weight="bold" aria-hidden />
        {all.length} {all.length === 1 ? "note" : "notes"} about this data
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-2">
        {all.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </details>
  );
}

// ---------- options ----------

function OptionsPanel({ api }: { api: AppApi }) {
  const { state } = api;
  const opts = state.opts;
  const [priceText, setPriceText] = useState(String(opts.pricePerResolution || ""));
  const [cap, setCap] = useState(String(api.defaultReplyCap));

  // Follow external price changes (a format switch applies that vendor's default).
  useEffect(() => {
    setPriceText((t) => (Number(t) === opts.pricePerResolution ? t : String(opts.pricePerResolution || "")));
  }, [opts.pricePerResolution]);

  const rc = state.replyCheck;
  const capNumber = Math.max(1, Math.floor(Number(cap) || api.defaultReplyCap));

  return (
    <section aria-labelledby="params-h" className="rounded-[var(--radius)] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="params-h" className="text-base font-semibold tracking-tight">
          Parameters
        </h2>
        <p className="text-sm text-ink-3" aria-live="polite">
          {state.refreshing ? "Recalculating" : "Changes apply instantly"}
        </p>
      </div>

      <div className="mt-5 grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="opt-window" className="field-label mb-0!">
              Look-ahead window
            </label>
            <output htmlFor="opt-window" className="num text-sm font-semibold">
              {opts.windowDays} {opts.windowDays === 1 ? "day" : "days"}
            </output>
          </div>
          <input
            id="opt-window"
            type="range"
            min={1}
            max={30}
            step={1}
            value={opts.windowDays}
            onChange={(e) => api.setOpts({ windowDays: Number(e.target.value) })}
          />
          <p className="field-help">
            A repeat contact or reopen inside this many days fails a conversation. The newest {opts.windowDays} days
            are held back as pending.
          </p>
        </div>

        <div>
          <label htmlFor="opt-price" className="field-label">
            Price per resolution (USD)
          </label>
          <div className="relative">
            <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">$</span>
            <input
              id="opt-price"
              className="field num pl-7"
              type="text"
              inputMode="decimal"
              value={priceText}
              placeholder="0.00"
              onChange={(e) => {
                const t = e.target.value.replace(/[^0-9.]/g, "");
                setPriceText(t);
                const n = t === "" ? 0 : Number(t);
                if (Number.isFinite(n) && n >= 0) api.setOpts({ pricePerResolution: n }, "price");
              }}
            />
          </div>
          <p className="field-help">
            {opts.pricePerResolution > 0
              ? "Used for dollars at risk."
              : "Enter your contract price per resolution to see dollars at risk. No default price is assumed."}
          </p>
        </div>

        {state.source === "file" && (
          <div>
            <PresetSelect id="opt-format" value={state.preset} detected={state.detected} onChange={api.changePreset} />
            <p className="field-help">Wrong numbers usually mean the wrong format. Switch and the audit reruns.</p>
          </div>
        )}

        {state.preset === "zendesk" && (
          <div>
            <span className="field-label">Human replies</span>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
                checked={opts.countAgentReplies === true}
                onChange={(e) => api.setOpts({ countAgentReplies: e.target.checked })}
              />
              <span>
                <span className="font-medium">Count agent replies without order proof</span>
                <span className="mt-0.5 block text-ink-3">
                  Zendesk&apos;s reply count covers the whole ticket, so it cannot show the reply came after the AI.
                  Off by default. Turn it on to count any agent reply, knowing some may predate the AI.
                </span>
              </span>
            </label>
          </div>
        )}

        {state.source === "api" && (
          <div>
            <span className="field-label">Reply order</span>
            <p className="text-sm text-ink-3">
              Reads the comments of AI tickets that have agent replies, to see whether a human replied after the AI.
              {state.replyCandidates > 0 || (rc && rc.checked > 0) ? (
                <>
                  {" "}
                  <span className="num font-semibold text-ink">{int(state.replyCandidates)}</span> tickets not
                  checked yet.
                </>
              ) : (
                " No tickets need it."
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="opt-cap" className="field-label">
                  Check up to
                </label>
                <input
                  id="opt-cap"
                  className="field num w-28"
                  type="text"
                  inputMode="numeric"
                  value={cap}
                  onChange={(e) => setCap(e.target.value.replace(/[^0-9]/g, ""))}
                />
              </div>
              {rc?.running ? (
                <button type="button" className="btn btn-secondary" onClick={api.cancel}>
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={state.replyCandidates === 0}
                  onClick={() => void api.checkReplyOrder(capNumber)}
                >
                  Check reply order
                </button>
              )}
            </div>
            {rc?.running && (
              <p className="num mt-3 text-sm text-ink-2" role="status">
                {int(rc.done)} of {int(rc.total)} tickets checked
                {state.wait ? `. ${waitText(state.wait)}` : ""}
              </p>
            )}
            {rc && !rc.running && rc.skipped > 0 && (
              <p className="mt-3 text-sm text-ink-2">
                {int(rc.skipped)} tickets were skipped by the cap of {int(capNumber)}.
              </p>
            )}
          </div>
        )}
      </div>

      <details className="mt-6 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium">More parameters</summary>
        <div className="mt-4 grid gap-x-8 gap-y-6 md:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between">
              <label htmlFor="opt-csat" className="field-label mb-0!">
                Negative CSAT below
              </label>
              <output htmlFor="opt-csat" className="num text-sm font-semibold">
                {opts.negativeCsatThreshold.toFixed(2)}
              </output>
            </div>
            <input
              id="opt-csat"
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={opts.negativeCsatThreshold}
              onChange={(e) => api.setOpts({ negativeCsatThreshold: Number(e.target.value) })}
            />
            <p className="field-help">On a 0 to 1 scale. Zendesk good = 1, bad = 0.</p>
          </div>
          <div>
            <label htmlFor="opt-vendor" className="field-label">
              Vendor name in the summary
            </label>
            <input
              id="opt-vendor"
              className="field"
              type="text"
              value={state.vendorName}
              onChange={(e) => api.setVendorName(e.target.value)}
            />
            <p className="field-help">Used in the copied summary.</p>
          </div>
        </div>
      </details>
    </section>
  );
}
