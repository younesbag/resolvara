"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LockSimple, UploadSimple, Warning } from "@phosphor-icons/react";
import type { Preset } from "@/engine";
import type { Stage } from "./use-auditor";

const STAGE_TEXT: Record<Stage, string> = {
  reading: "Reading the file",
  parsing: "Parsing rows",
  auditing: "Applying the Standard",
};

export function Intake({
  onFile,
  onSample,
  working,
  stage,
  progress,
  label,
  error,
  onRetry,
}: {
  onFile: (f: File) => void;
  onSample: (p: Preset) => void;
  working: boolean;
  stage: Stage;
  progress: number;
  label: string;
  error: string | null;
  onRetry: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  // A file dropped outside the zone must not navigate the tab away from the page.
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
      if (f) onFile(f);
    },
    [onFile],
  );

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-[var(--radius)] border border-accent bg-surface p-6 sm:p-8"
      >
        <div className="flex items-start gap-3">
          <Warning size={22} weight="bold" className="mt-0.5 shrink-0 text-accent" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">This file did not load</h2>
            <p className="mt-1 break-words text-sm text-ink-2">{error}</p>
            <p className="mt-3 text-sm text-ink-2">
              Resolvara reads CSV, JSON and JSONL exports. If your columns have unusual names, choose
              Other and map them by hand.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try another file
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onSample("intercom")}>
            Use sample data
          </button>
        </div>
      </div>
    );
  }

  if (working) {
    const pct = Math.max(0.04, Math.min(1, progress));
    return (
      <div
        className="rounded-[var(--radius)] border border-line-strong bg-surface p-6 sm:p-8"
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-ink-3">{label || "Your file"}</p>
        <p className="mt-1 text-xl font-semibold tracking-tight">{STAGE_TEXT[stage]}</p>
        <div
          className="mt-5 h-1.5 w-full overflow-hidden rounded-[var(--radius)] bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
        >
          <div
            className="bar-grow h-full bg-ink transition-[width] duration-300 ease-out"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        <p className="num mt-2 text-sm text-ink-3">{Math.round(pct * 100)}%</p>
        <p className="mt-5 flex items-center gap-2 text-sm text-ink-2">
          <LockSimple size={16} weight="bold" />
          Running in a Web Worker on this device. No network request is made.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius)] border border-line bg-surface p-3 shadow-[0_1px_2px_rgb(15_19_23/0.04),0_12px_32px_-12px_rgb(15_19_23/0.12)] sm:p-4">
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
        className={`flex flex-col items-center gap-5 rounded-[var(--radius)] border-2 border-dashed px-5 py-10 text-center transition-colors sm:px-8 sm:py-12 ${
          over ? "border-ink bg-surface-2" : "border-line"
        }`}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-surface-2">
          <UploadSimple size={24} weight="bold" className="text-ink" aria-hidden />
        </span>
        <div>
          <p className="text-xl font-semibold tracking-tight">Drop your export here</p>
          <p className="mx-auto mt-1.5 max-w-[36ch] text-sm text-ink-2">
            CSV or JSON from Intercom, Zendesk, Ada or Gorgias. Other helpdesks work with a column
            mapper.
          </p>
        </div>
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          accept=".csv,.json,.jsonl,.ndjson,.txt,text/csv,application/json"
          className="sr-only"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => onSample("intercom")}>
            Try the sample
          </button>
        </div>
        <p className="text-sm text-ink-3">
          Other samples:{" "}
          {(
            [
              ["zendesk", "Zendesk"],
              ["generic", "Generic CSV"],
            ] as [Preset, string][]
          ).map(([p, name], i) => (
            <span key={p}>
              {i > 0 && ", "}
              <button
                type="button"
                onClick={() => onSample(p)}
                className="py-1 font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink"
              >
                {name}
              </button>
            </span>
          ))}
        </p>
      </div>
      <p className="flex items-center justify-center gap-2 px-2 pb-1 pt-4 text-sm text-ink-2">
        <LockSimple size={16} weight="bold" className="shrink-0" aria-hidden />
        <span>Read in this tab. Nothing is uploaded, no account needed.</span>
      </p>
    </div>
  );
}
