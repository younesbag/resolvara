"use client";

import { useState } from "react";
import { Info } from "@phosphor-icons/react";
import type { AuditorState } from "./use-auditor";
import type { useAuditor } from "./use-auditor";
import { ActionsBar } from "./actions-bar";
import { BigNumbers } from "./big-numbers";
import { ContributeDialog } from "./contribute-dialog";
import { dateShort, int, pct } from "./format";
import { FlaggedTable } from "./flagged-table";
import { OptionsPanel, type VendorNote } from "./options-panel";
import { ReasonBars } from "./reason-bars";
import { SensitivityTable } from "./sensitivity-table";
import { WeeklyChart } from "./weekly-chart";

type Api = ReturnType<typeof useAuditor>;

export function Results({
  state,
  api,
  notes,
}: {
  state: AuditorState;
  api: Api;
  notes: Record<string, VendorNote>;
}) {
  const [contribute, setContribute] = useState(false);
  const report = state.report;
  if (!report) return null;

  const judged = report.billed - report.pending - report.unverifiable;
  const warnings = [
    ...state.parseWarnings,
    ...report.warnings,
    ...(report.rowsSkipped > 0 ? [`${int(report.rowsSkipped)} rows could not be read and were skipped.`] : []),
  ].filter((w, i, a) => a.indexOf(w) === i);

  const empty = report.aiConversations === 0;

  return (
    <div className="space-y-10 sm:space-y-12">
      <header className="rise">
        <p className="text-sm text-ink-3">
          {state.label}, {int(report.rowsRead)} rows, {dateShort(report.period?.start)} to{" "}
          {dateShort(report.period?.end)}
        </p>
        <h2 className="mt-2 max-w-[34ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          {empty
            ? "No AI conversations found in this file."
            : judged <= 0
              ? "Nothing billed is old enough to judge yet."
              : report.phantom === 0
                ? "No billed resolution fails the strict test."
                : `${pct(report.phantomShareOfBilled, 0)} of billed resolutions fail the strict test.`}
        </h2>
        {!empty && (
          <p className="mt-3 max-w-[60ch] text-ink-2">
            Phantom means billed but not strictly resolved, judged on your own data with a{" "}
            {state.opts.windowDays}-day window. It is evidence for a conversation with the vendor, not
            an accusation.
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
            Resolvara read {int(report.rowsRead)} rows but none were marked as handled by an AI agent.
            This usually means the format or a column is wrong.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={api.openMapper}>
              Map columns
            </button>
            <button type="button" className="btn btn-secondary" onClick={api.reset}>
              Start over
            </button>
          </div>
        </div>
      ) : (
        <>
          <BigNumbers report={report} opts={state.opts} />
          <ActionsBar
            report={report}
            summary={state.summary}
            vendorName={state.vendorName}
            windowDays={state.opts.windowDays}
            hasPhantom={report.phantom > 0}
            requestDispute={api.requestDispute}
            onContribute={() => setContribute(true)}
            onReset={api.reset}
          />
        </>
      )}

      {warnings.length > 0 && (
        <details className="rounded-[var(--radius)] border border-line bg-surface p-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-medium">
            <Info size={18} weight="bold" aria-hidden />
            {warnings.length} {warnings.length === 1 ? "note" : "notes"} about this file
          </summary>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-2">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </details>
      )}

      <OptionsPanel
        opts={state.opts}
        preset={state.preset}
        detected={state.detected}
        vendorName={state.vendorName}
        notes={notes}
        busy={state.refreshing}
        onOpts={api.setOpts}
        onVendorName={api.setVendorName}
        onPreset={api.changePreset}
        onMap={api.openMapper}
      />

      {!empty && (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-14">
            <WeeklyChart weekly={report.weekly} />
            <ReasonBars report={report} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-14">
            <SensitivityTable
              report={report}
              windowDays={state.opts.windowDays}
              onPick={(d) => api.setOpts({ windowDays: d })}
            />
            <div className="text-sm text-ink-2">
              <h2 className="text-base font-semibold tracking-tight text-ink">What is left out of the rates</h2>
              <ul className="mt-3 space-y-3">
                <li>
                  <span className="num font-semibold text-ink">{int(report.pending)}</span> conversations are
                  inside the newest {state.opts.windowDays} days. They have not had time to show a repeat
                  contact, so they are excluded.
                </li>
                <li>
                  <span className="num font-semibold text-ink">{int(report.unverifiable)}</span> have no
                  customer key and no other signal, so a repeat contact cannot be checked.
                </li>
              </ul>
            </div>
          </div>

          <FlaggedTable results={report.results} total={report.phantom} />
        </>
      )}

      <ContributeDialog open={contribute} payload={state.payload} onClose={() => setContribute(false)} />
    </div>
  );
}
