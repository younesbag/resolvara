"use client";

import { useMemo, useState } from "react";
import type { ColumnMapping, Preset } from "@/engine";
import { Modal } from "../modal";
import { CSAT_SCALE_OPTIONS, MAPPER_FIELDS, PRESET_OPTIONS } from "./meta";

const GUESS: Record<string, RegExp> = {
  id: /^(id|conversation[ _.-]?id|ticket[ _.-]?id|ticket|conversation)$|(^|[ _.-])id$/i,
  createdAt: /creat|opened|started|(^|[ _.-])date/i,
  closedAt: /clos|solved|resolved[ _.-]?at|ended/i,
  customerKey: /customer|requester|contact|email|end[ _.-]?user|user[ _.-]?id/i,
  billed: /billed|billable|resolution|outcome|automated/i,
  aiInvolved: /ai[ _.-]?(agent)?[ _.-]?(participated|involved|handled)|bot|fin|lyro|automation/i,
  humanReplied: /human|agent[ _.-]?repl|admin[ _.-]?repl|handoff|escalat|assignee/i,
  reopenedAt: /reopen\w*[ _.-]?(at|date|time)/i,
  reopenCount: /reopen(?!\w*[ _.-]?(at|date|time))/i,
  csat: /csat|satisf|rating|survey|score/i,
  actionReceipt: /receipt|refund[ _.-]?id|booking[ _.-]?id|order[ _.-]?update/i,
  topicText: /subject|topic|title|message|summary|text/i,
  channel: /channel|source|platform/i,
};

export function guessMapping(headers: string[]): ColumnMapping {
  const taken = new Set<string>();
  const out: ColumnMapping = {};
  for (const f of MAPPER_FIELDS) {
    const re = GUESS[f.key];
    const hit = re ? headers.find((h) => !taken.has(h) && re.test(h)) : undefined;
    if (hit) taken.add(hit);
    out[f.key] = hit ?? null;
  }
  return out;
}

export function MapperDialog({
  open,
  headers,
  initialPreset,
  initialMapping,
  detected,
  onApply,
  onClose,
}: {
  open: boolean;
  headers: string[];
  initialPreset: Preset;
  initialMapping: ColumnMapping | null;
  detected: Preset;
  onApply: (preset: Preset, mapping: ColumnMapping) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="Match your columns"
      description="Pick the column that holds each field. Your file stays in this tab."
    >
      {open && (
        <MapperForm
          headers={headers}
          initialPreset={initialPreset}
          initialMapping={initialMapping}
          detected={detected}
          onApply={onApply}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function MapperForm({
  headers,
  initialPreset,
  initialMapping,
  detected,
  onApply,
  onClose,
}: {
  headers: string[];
  initialPreset: Preset;
  initialMapping: ColumnMapping | null;
  detected: Preset;
  onApply: (preset: Preset, mapping: ColumnMapping) => void;
  onClose: () => void;
}) {
  const [preset, setPreset] = useState<Preset>(
    initialPreset === "generic" || initialPreset === "gorgias" ? initialPreset : "generic",
  );
  const [mapping, setMapping] = useState<ColumnMapping>(
    () => initialMapping ?? guessMapping(headers),
  );

  const missing = useMemo(
    () => MAPPER_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label),
    [mapping],
  );
  const billedNeedsValue = Boolean(mapping.billed) && !(mapping.billedValue ?? "").trim();

  const set = (k: string, v: string) => setMapping((m) => ({ ...m, [k]: v === "" ? null : v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (missing.length === 0 && !billedNeedsValue) onApply(preset, mapping);
      }}
      className="space-y-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="map-preset" className="field-label">
            Format
          </label>
          <select
            id="map-preset"
            className="field"
            value={preset}
            onChange={(e) => setPreset(e.target.value as Preset)}
          >
            {PRESET_OPTIONS.filter((p) => p.value === "generic" || p.value === "gorgias").map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="field-help">
            {detected === "generic"
              ? "We could not match this file to a known export, so map it by hand."
              : `Detected as ${PRESET_OPTIONS.find((p) => p.value === detected)?.label ?? detected}, but the columns need your confirmation.`}
          </p>
        </div>
        {preset === "gorgias" && (
          <p className="self-end rounded-[var(--radius)] bg-surface-2 p-3 text-sm text-ink-2">
            Gorgias exports have no AI column. Choose the column that marks AI-handled tickets, for
            example a tag or an integration name.
          </p>
        )}
      </div>

      <div className="space-y-5">
        {MAPPER_FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[1fr_1fr] sm:items-start">
            <div>
              <label htmlFor={`map-${f.key}`} className="field-label">
                {f.label}
                {f.required && <span className="text-accent"> (required)</span>}
              </label>
              <select
                id={`map-${f.key}`}
                className="field"
                value={mapping[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
              >
                <option value="">Not in this file</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <p className="field-help">{f.help}</p>
            </div>
            {f.scaleKey && mapping[f.key] && (
              <div>
                <label htmlFor={`map-${f.scaleKey}`} className="field-label">
                  Rating scale
                </label>
                <select
                  id={`map-${f.scaleKey}`}
                  className="field"
                  value={mapping[f.scaleKey] ?? ""}
                  onChange={(e) => set(f.scaleKey as string, e.target.value)}
                >
                  {CSAT_SCALE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p className="field-help">
                  A 1 to 5 rating of 2 becomes 0.25. Choose the scale your tool uses; the file&apos;s own
                  lowest and highest scores are never used to stretch it.
                </p>
              </div>
            )}
            {f.valueKey && mapping[f.key] && (
              <div>
                <label htmlFor={`map-${f.valueKey}`} className="field-label">
                  {f.valueLabel}
                </label>
                <input
                  id={`map-${f.valueKey}`}
                  className="field"
                  type="text"
                  value={mapping[f.valueKey] ?? ""}
                  placeholder="for example: true, yes, 1, resolved"
                  onChange={(e) => set(f.valueKey as string, e.target.value)}
                />
                <p className="field-help">Matched ignoring case. Separate several values with commas.</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {(missing.length > 0 || billedNeedsValue) && (
        <p role="alert" className="rounded-[var(--radius)] bg-accent-soft p-3 text-sm text-accent-ink">
          {missing.length > 0
            ? `Still needed: ${missing.join(", ")}.`
            : "Tell us which value in the billed column means billed."}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={missing.length > 0 || billedNeedsValue}
        >
          Run the audit
        </button>
      </div>
    </form>
  );
}
