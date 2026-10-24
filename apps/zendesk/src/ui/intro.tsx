import { useCallback, useEffect, useRef, useState } from "react";
import { LockSimple, UploadSimple } from "@phosphor-icons/react";
import type { Preset } from "@/engine";
import type { AppApi } from "./use-app";

const PERIODS = [30, 60, 90];

export function Intro({ api }: { api: AppApi }) {
  return (
    <div className="space-y-8">
      <header className="rise">
        <h1 className="max-w-[24ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          Which billed AI resolutions were not really resolved?
        </h1>
        <p className="mt-4 max-w-[62ch] text-ink-2">
          Resolvara checks each AI-agent ticket that Zendesk counts as an automated resolution: did the customer
          come back, was it reopened, did a human step in, was the rating negative. It lists the ones that fail,
          with the evidence, so you can raise them with Zendesk.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <ZendeskCard api={api} />
        <FileCard api={api} />
      </div>

      <p className="flex items-start gap-2 text-sm text-ink-2">
        <LockSimple size={16} weight="bold" className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Everything runs in this browser tab. Nothing is stored, nothing is sent to Resolvara or any third party,
          and no data is combined with other accounts. The only network traffic is to your own Zendesk.
        </span>
      </p>
    </div>
  );
}

function ZendeskCard({ api }: { api: AppApi }) {
  const { state } = api;
  return (
    <section
      aria-labelledby="src-api"
      className="rise flex flex-col rounded-[var(--radius)] border border-line-strong bg-surface p-5 sm:p-6"
    >
      <h2 id="src-api" className="text-lg font-semibold tracking-tight">
        Read from this Zendesk
      </h2>
      <p className="mt-1.5 text-sm text-ink-2">
        Reads your AI-agent tickets through the Zendesk API with your current session. No export, no token.
      </p>

      <div className="mt-5">
        <label htmlFor="period" className="field-label">
          Period
        </label>
        <select
          id="period"
          className="field"
          value={state.periodDays}
          onChange={(e) => api.setPeriodDays(Number(e.target.value))}
        >
          {PERIODS.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
        <p className="field-help">
          The newest days of the period are held back as pending until the look-ahead window has passed.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={!api.hasZendesk} onClick={() => api.runApi(state.periodDays)}>
          Run audit
        </button>
        {!api.hasZendesk && (
          <span className="text-sm text-accent-ink">Open this app inside Zendesk to read your tickets.</span>
        )}
      </div>

      <p className="field-help mt-4">
        Administrators only: Zendesk limits the incremental ticket export to admins. Zendesk allows 10 export
        requests a minute, so about 10,000 tickets are read per minute.
      </p>
    </section>
  );
}

function FileCard({ api }: { api: AppApi }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  // A file dropped outside the zone must not navigate the frame away.
  useEffect(() => {
    const stop = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", stop);
    window.addEventListener("drop", stop);
    return () => {
      window.removeEventListener("dragover", stop);
      window.removeEventListener("drop", stop);
    };
  }, []);

  const pick = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) api.loadFile(f);
    },
    [api],
  );

  return (
    <section
      aria-labelledby="src-file"
      className="rise rise-2 flex flex-col rounded-[var(--radius)] border border-line-strong bg-surface p-5 sm:p-6"
    >
      <h2 id="src-file" className="text-lg font-semibold tracking-tight">
        Upload an export file
      </h2>
      <p className="mt-1.5 text-sm text-ink-2">
        CSV, JSON or JSONL from Zendesk, Intercom, Ada or Gorgias, or any other helpdesk.
      </p>

      <div
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          pick(e.dataTransfer.files);
        }}
        className={`mt-5 flex flex-col items-start gap-4 rounded-[var(--radius)] border border-dashed px-4 py-6 transition-colors ${
          over ? "border-ink bg-surface-2" : "border-line-strong"
        }`}
      >
        <UploadSimple size={26} aria-hidden />
        <p className="text-sm text-ink-2">Drop the export here, or choose a file.</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.json,.jsonl,.ndjson,.txt,text/csv,application/json"
          className="sr-only"
          aria-label="Choose an export file"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <button type="button" className="btn btn-secondary" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-1 text-sm text-ink-2">
        <span>Try sample data:</span>
        {(
          [
            ["intercom", "Intercom"],
            ["zendesk", "Zendesk"],
            ["generic", "Generic"],
          ] as [Preset, string][]
        ).map(([p, name]) => (
          <button
            key={p}
            type="button"
            onClick={() => api.loadSample(p)}
            className="rounded-[var(--radius)] px-2 py-2 font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            {name}
          </button>
        ))}
      </div>
    </section>
  );
}
