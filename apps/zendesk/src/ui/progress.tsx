import { Warning } from "@phosphor-icons/react";
import { PRESET_OPTIONS } from "@/components/auditor/meta";
import { int } from "@/components/auditor/format";
import type { Preset } from "@/engine";
import type { WaitInfo } from "../zaf";
import type { AppApi } from "./use-app";

const PHASE_TEXT: Record<string, string> = {
  fields: "Reading ticket fields",
  ai: "Reading AI-agent tickets",
  other: "Reading other tickets (for repeat contacts)",
  comments: "Checking reply order",
};

export function waitText(w: WaitInfo): string {
  if (w.reason === "rate_limit") return `Zendesk rate limit, continuing in ${w.secondsLeft} s.`;
  if (w.reason === "retry") return `Zendesk did not answer, retrying in ${w.secondsLeft} s.`;
  return `Staying under Zendesk's export limit of 10 requests a minute, next request in ${w.secondsLeft} s.`;
}

function Bar({ value }: { value: number | null }) {
  return (
    <div
      className="mt-5 h-1.5 w-full overflow-hidden rounded-[var(--radius)] bg-surface-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
    >
      {value === null ? (
        <div className="indeterminate-bar h-full w-1/3 bg-ink" />
      ) : (
        <div className="bar-grow h-full bg-ink transition-[width] duration-300 ease-out" style={{ width: `${Math.max(4, value * 100)}%` }} />
      )}
    </div>
  );
}

/** API source: reading from Zendesk, or paused after a cancel / error. */
export function FetchView({ api }: { api: AppApi }) {
  const { state } = api;
  const p = state.progress;
  const paused = state.stage === "paused";
  return (
    <div className="rounded-[var(--radius)] border border-line-strong bg-surface p-6 sm:p-8" role="status" aria-live="polite">
      <p className="text-sm text-ink-3">Last {state.periodDays} days, read from this Zendesk</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">
        {paused ? "Paused" : PHASE_TEXT[p?.phase ?? "fields"]}
      </p>
      {!paused && <Bar value={null} />}
      <p className="num mt-3 text-sm text-ink-2">
        {p && p.phase !== "fields" ? `${int(p.pages)} pages, ${int(p.tickets)} tickets so far` : "Starting"}
      </p>
      {state.wait && !paused && <p className="mt-3 text-sm text-accent-ink">{waitText(state.wait)}</p>}
      {state.fetchError && (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-accent-ink">
          <Warning size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
          <span>{state.fetchError}</span>
        </p>
      )}
      {paused && p && (
        <p className="mt-3 text-sm text-ink-2">
          What was read so far is kept in memory. Resume continues from the last page. Closing this tab loses it.
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        {paused ? (
          <>
            <button type="button" className="btn btn-primary" onClick={api.resume}>
              Resume
            </button>
            <button type="button" className="btn btn-secondary" onClick={api.reset}>
              Start over
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={api.cancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

const STAGE_TEXT = {
  reading: "Reading the file",
  parsing: "Parsing rows",
  auditing: "Applying the Standard",
} as const;

/** Parsing / auditing in the worker (file source, and the audit step of the API source). */
export function WorkView({ api }: { api: AppApi }) {
  const { state } = api;
  const pct = Math.max(0.04, Math.min(1, state.fileProgress));
  return (
    <div className="rounded-[var(--radius)] border border-line-strong bg-surface p-6 sm:p-8" role="status" aria-live="polite">
      <p className="text-sm text-ink-3">{state.source === "api" ? "Zendesk tickets" : state.label || "Your file"}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{STAGE_TEXT[state.fileStage]}</p>
      <Bar value={pct} />
      <p className="num mt-2 text-sm text-ink-3">{Math.round(pct * 100)}%</p>
    </div>
  );
}

/** File source: the format was not recognised with confidence. */
export function ConfirmView({ api }: { api: AppApi }) {
  const { state } = api;
  return (
    <div className="rounded-[var(--radius)] border border-line-strong bg-surface p-6 sm:p-8">
      <p className="text-sm text-ink-3">{state.label}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight">Which export format is this?</h2>
      <p className="mt-2 max-w-[60ch] text-sm text-ink-2">
        Resolvara could not tell with confidence. Pick the closest format. If columns are missing, the notes after
        the audit say which ones, and the website&apos;s column mapper can handle unusual exports.
      </p>
      <PresetSelect
        id="confirm-format"
        value={state.preset}
        detected={state.detected}
        onChange={api.previewPreset}
      />
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={() => api.confirmPreset(state.preset)}>
          Use this format
        </button>
        <button type="button" className="btn btn-secondary" onClick={api.reset}>
          Start over
        </button>
      </div>
    </div>
  );
}

export function PresetSelect({
  id,
  value,
  detected,
  onChange,
}: {
  id: string;
  value: Preset;
  detected: Preset;
  onChange: (p: Preset) => void;
}) {
  return (
    <div className="mt-5 max-w-sm">
      <label htmlFor={id} className="field-label">
        Export format
      </label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as Preset)}>
        {PRESET_OPTIONS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
            {p.value === detected ? " (detected)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ErrorView({ api }: { api: AppApi }) {
  const { state } = api;
  return (
    <div role="alert" className="rounded-[var(--radius)] border border-accent bg-surface p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <Warning size={22} weight="bold" className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">
            {state.source === "api" ? "Could not read from Zendesk" : "This file did not load"}
          </h2>
          <p className="mt-1 break-words text-sm text-ink-2">{state.error}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={api.reset}>
          Back
        </button>
      </div>
    </div>
  );
}
