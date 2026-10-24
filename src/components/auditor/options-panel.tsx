"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AuditOptions, Preset } from "@/engine";
import { DEFAULT_PRICE, PRESET_OPTIONS, PRESET_VENDOR_SLUG } from "./meta";

export interface VendorNote {
  href: string;
  checkedAt: string;
  priceSource?: string;
}

export function OptionsPanel({
  opts,
  preset,
  detected,
  vendorName,
  notes,
  busy,
  onOpts,
  onVendorName,
  onPreset,
  onMap,
}: {
  opts: AuditOptions;
  preset: Preset;
  detected: Preset;
  vendorName: string;
  notes: Record<string, VendorNote>;
  busy: boolean;
  onOpts: (p: Partial<AuditOptions>, source?: "price") => void;
  onVendorName: (n: string) => void;
  onPreset: (p: Preset) => void;
  onMap: () => void;
}) {
  const [priceText, setPriceText] = useState(String(opts.pricePerResolution || ""));

  // Follow external price changes (a preset switch applies that vendor's default).
  useEffect(() => {
    setPriceText((t) => (Number(t) === opts.pricePerResolution ? t : String(opts.pricePerResolution || "")));
  }, [opts.pricePerResolution]);

  const slug = PRESET_VENDOR_SLUG[preset];
  const note = slug ? notes[slug] : undefined;
  const hasDefault = DEFAULT_PRICE[preset] > 0;

  return (
    <section aria-labelledby="params-h" className="rounded-[var(--radius)] border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="params-h" className="text-base font-semibold tracking-tight">
          Parameters
        </h2>
        <p className="text-sm text-ink-3" aria-live="polite">
          {busy ? "Recalculating" : "Changes apply instantly"}
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
            onChange={(e) => onOpts({ windowDays: Number(e.target.value) })}
          />
          <p className="field-help">
            A repeat contact or reopen inside this many days fails a conversation. The newest{" "}
            {opts.windowDays} days of the export are held back as pending.
          </p>
        </div>

        <div>
          <label htmlFor="opt-price" className="field-label">
            Price per resolution (USD)
          </label>
          <div className="relative">
            <span className="num pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">
              $
            </span>
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
                // The filter above already removes minus signs; the guard keeps the price at zero or more.
                if (Number.isFinite(n) && n >= 0) onOpts({ pricePerResolution: n }, "price");
              }}
            />
          </div>
          <p className="field-help">
            {hasDefault && note ? (
              <>
                Default from {PRESET_OPTIONS.find((p) => p.value === preset)?.label}&apos;s published
                price, checked {note.checkedAt}.{" "}
                <Link href={note.href} className="underline underline-offset-2">
                  Source
                </Link>
                . Use your contract rate if it differs.
                {preset === "gorgias" && (
                  <> Gorgias lists $1.00 on monthly plans, $0.90 on annual plans and $1.50 for usage above the plan.</>
                )}
              </>
            ) : (
              <>No confirmed public price for this vendor. Enter your contract rate to see dollars at risk.</>
            )}
          </p>
        </div>

        <div>
          <label htmlFor="opt-format" className="field-label">
            Export format
          </label>
          <div className="flex gap-2">
            <select
              id="opt-format"
              className="field"
              value={preset}
              onChange={(e) => onPreset(e.target.value as Preset)}
            >
              {PRESET_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                  {p.value === detected ? " (detected)" : ""}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-secondary shrink-0" onClick={onMap}>
              Map columns
            </button>
          </div>
          <p className="field-help">Wrong numbers usually mean wrong columns. Remap and the audit reruns.</p>
        </div>

        <div>
          <span className="field-label">Repeat-contact test</span>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-[var(--ink)]"
              checked={opts.sameTopicOnly}
              onChange={(e) => onOpts({ sameTopicOnly: e.target.checked })}
            />
            <span>
              <span className="font-medium">Count a repeat only when the topic matches</span>
              <span className="mt-0.5 block text-ink-3">
                Uses local text similarity (0.35 or higher). Fewer false positives, needs subject or
                message text in the export.
              </span>
            </span>
          </label>
        </div>
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
              onChange={(e) => onOpts({ negativeCsatThreshold: Number(e.target.value) })}
            />
            <p className="field-help">On a 0 to 1 scale. A 1-to-5 rating of 2 is 0.25.</p>
          </div>
          <div>
            <label htmlFor="opt-vendor" className="field-label">
              Vendor name in the summary
            </label>
            <input
              id="opt-vendor"
              className="field"
              type="text"
              value={vendorName}
              onChange={(e) => onVendorName(e.target.value)}
            />
            <p className="field-help">Used in the copied summary and email draft.</p>
          </div>
        </div>
      </details>
    </section>
  );
}
