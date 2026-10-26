"use client";

import { useState } from "react";
import {
  ArrowCounterClockwise,
  Copy,
  DownloadSimple,
  EnvelopeSimple,
  FileText,
  HandHeart,
  ShareNetwork,
} from "@phosphor-icons/react";
import type { AuditReport } from "@/engine";
import { Modal } from "../modal";
import { track } from "../track";
import { buildFinanceReport } from "./finance-report";
import { downloadBlob, stamp } from "./format";
import { renderShareCard } from "./share-card";

// Opens the visitor's own mail app. Nothing from the audit is attached; they choose what to share.
const DISPUTE_HELP_MAILTO =
  "mailto:younesbag@moshid.com?subject=" +
  encodeURIComponent("Help with an AI resolution dispute") +
  "&body=" +
  encodeURIComponent(
    [
      "Hi Younes,",
      "",
      "I ran Resolvara on our export and would like help taking the result to our vendor.",
      "",
      "Vendor:",
      "Rough monthly AI resolutions:",
      "What we need:",
    ].join("\n"),
  );

export function ActionsBar({
  report,
  summary,
  vendorName,
  windowDays,
  hasPhantom,
  canContribute,
  requestDispute,
  onContribute,
  onReset,
}: {
  report: AuditReport;
  summary: string;
  vendorName: string;
  windowDays: number;
  hasPhantom: boolean;
  canContribute: boolean; // false for sample data: it must never reach the community benchmark
  requestDispute: () => Promise<string>;
  onContribute: () => void;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState<null | "csv" | "card" | "report">(null);
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);

  const say = (t: string) => {
    setStatus(t);
    setTimeout(() => setStatus((s) => (s === t ? "" : s)), 3500);
  };

  async function csv() {
    setBusy("csv");
    try {
      const text = await requestDispute();
      downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), `resolvara-dispute-${stamp()}.csv`);
      say("Dispute CSV downloaded");
      track("csv_downloaded");
    } catch {
      say("Could not build the CSV");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary);
      say("Summary copied");
    } catch {
      // Clipboard API can be blocked; fall back to a temporary textarea.
      const ta = document.createElement("textarea");
      ta.value = summary;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) say("Summary copied");
      else setManual(true);
    }
  }

  async function financeReport() {
    setBusy("report");
    try {
      const html = await buildFinanceReport({ report, vendorName });
      downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `resolvara-finance-report-${stamp()}.html`);
      say("Finance report downloaded. Open it and print to PDF.");
      track("finance_report");
    } catch {
      say("Could not build the report");
    } finally {
      setBusy(null);
    }
  }

  async function card() {
    setBusy("card");
    try {
      const blob = await renderShareCard({ report, vendorName, windowDays });
      downloadBlob(blob, `resolvara-card-${stamp()}.png`);
      say("Share card downloaded");
    } catch {
      say("Could not draw the share card");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rise rise-2">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={csv} disabled={busy !== null || !hasPhantom}>
          <DownloadSimple size={18} weight="bold" aria-hidden />
          Download dispute CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={financeReport} disabled={busy !== null}>
          <FileText size={18} weight="bold" aria-hidden />
          Finance report
        </button>
        <button type="button" className="btn btn-secondary" onClick={copy}>
          <Copy size={18} weight="bold" aria-hidden />
          Copy summary and email
        </button>
        <button type="button" className="btn btn-secondary" onClick={card} disabled={busy !== null}>
          <ShareNetwork size={18} weight="bold" aria-hidden />
          Share card
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onContribute}
          disabled={!canContribute}
          title={canContribute ? undefined : "Sample data is never added to the benchmark. Audit your own export to contribute."}
        >
          <HandHeart size={18} weight="bold" aria-hidden />
          Contribute
        </button>
        <button type="button" className="btn btn-ghost ml-auto" onClick={onReset}>
          <ArrowCounterClockwise size={18} weight="bold" aria-hidden />
          Start over
        </button>
      </div>
      <p className="mt-3 min-h-5 text-sm text-ink-2" role="status" aria-live="polite">
        {status}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-ink-2">
        <EnvelopeSimple size={16} weight="bold" aria-hidden />
        Taking this to your vendor?
        <a
          href={DISPUTE_HELP_MAILTO}
          onClick={() => track("dispute_help")}
          className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          Ask for help with the dispute
        </a>
        <span>(email, no data needed)</span>
      </p>
      <Modal
        open={manual}
        onClose={() => setManual(false)}
        title="Copy the summary"
        description="Your browser blocked automatic copying. Select the text and copy it."
      >
        <textarea
          readOnly
          value={summary}
          rows={14}
          className="field h-auto! w-full py-3 font-mono text-sm"
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Summary and email draft"
        />
      </Modal>
    </div>
  );
}
