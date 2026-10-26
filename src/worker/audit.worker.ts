/// <reference lib="webworker" />
// Audit worker: all parsing and classification runs here, off the main thread.
// No network access of any kind. The engine is code-only; see docs/SPEC.md.
//
// The page creates this worker once and keeps it. Messages are queued and handled one at a
// time, so a debounced "audit" can never run in the middle of a parse. A "reset" message
// (a new file, or Start over) discards the queue and any parse still running.
import {
  audit,
  contributionPayload,
  detectPreset,
  disputeSummaryText,
  parseFile,
  peekFile,
  sampleDataset,
  simulateBilling,
  toDisputeCsv,
  type AuditOptions,
  type AuditReport,
  type Contribution,
  type Conversation,
  type Preset,
} from "@/engine";
import type { WorkerInput, WorkerOutput } from "./protocol";

const ctx = self as unknown as {
  postMessage(msg: WorkerOutput): void;
  onmessage: ((ev: MessageEvent<WorkerInput>) => void) | null;
};

const post = (m: WorkerOutput) => ctx.postMessage(m);

let input: File | string | null = null;
let convs: Conversation[] = [];
let fullReport: AuditReport | null = null;
let lastOpts: AuditOptions | null = null;
let lastPreset: Preset = "generic";

// Bumped by every reset. Work started under an older generation is dropped.
let generation = 0;
const queue: { msg: WorkerInput; gen: number }[] = [];
let draining = false;

function trimReport(report: AuditReport): AuditReport {
  // Keep only the rows the UI lists (phantom). Counts and aggregates are untouched.
  return { ...report, results: report.results.filter((r) => r.verdict === "phantom") };
}

function clearState() {
  input = null;
  convs = [];
  fullReport = null;
  lastOpts = null;
  lastPreset = "generic";
}

async function handle(msg: WorkerInput, gen: number): Promise<void> {
  const alive = () => gen === generation;
  try {
    if (msg.type === "sample") {
      input = sampleDataset(msg.preset);
      convs = [];
      fullReport = null;
      const { headers, rows } = await peekFile(input);
      if (!alive()) return;
      const d = detectPreset(headers, rows);
      post({
        type: "peeked",
        label: `Sample data (${msg.preset})`,
        headers,
        preset: msg.preset,
        confidence: Math.max(d.confidence, 0.99),
        sampleRows: rows.length,
        isSample: true,
      });
      return;
    }

    if (msg.type === "peek") {
      input = msg.input;
      convs = [];
      fullReport = null;
      post({ type: "progress", stage: "reading", p: 0.02 });
      let peek;
      try {
        peek = await peekFile(msg.input);
      } catch (e) {
        if (!alive()) return;
        post({
          type: "error",
          stage: "peek",
          message: e instanceof Error ? e.message : "Could not read this file.",
        });
        return;
      }
      if (!alive()) return;
      const d = detectPreset(peek.headers, peek.rows);
      post({
        type: "peeked",
        label: msg.label,
        headers: peek.headers,
        preset: d.preset,
        confidence: d.confidence,
        sampleRows: peek.rows.length,
        isSample: false,
      });
      return;
    }

    if (msg.type === "parse") {
      if (input === null) throw new Error("No file loaded.");
      fullReport = null;
      post({ type: "progress", stage: "parsing", p: 0 });
      let lastSent = 0;
      const res = await parseFile(input, {
        preset: msg.preset,
        mapping: msg.mapping,
        onProgress: (p) => {
          const now = Date.now();
          if (alive() && (now - lastSent > 60 || p >= 1)) {
            lastSent = now;
            post({ type: "progress", stage: "parsing", p });
          }
        },
      });
      if (!alive()) return;
      // The preset is committed only now, together with the conversations it produced.
      lastPreset = msg.preset;
      convs = res.conversations;
      post({
        type: "parsed",
        conversations: convs.length,
        headers: res.headers,
        warnings: res.warnings,
      });
      return;
    }

    if (msg.type === "audit") {
      post({ type: "progress", stage: "auditing", p: 0.5 });
      lastOpts = msg.opts;
      fullReport = audit(convs, msg.opts, lastPreset);
      let payload: Contribution | null = null;
      try {
        payload = contributionPayload(fullReport);
      } catch {
        payload = null; // a fractional window cannot be filed in the benchmark
      }
      const simulation = simulateBilling(convs, fullReport);
      post({
        type: "audited",
        reqId: msg.reqId,
        report: trimReport(fullReport),
        summary: disputeSummaryText(fullReport, msg.opts, msg.vendorName, simulation),
        simulation,
        payload,
      });
      return;
    }

    if (msg.type === "dispute") {
      if (!fullReport || !lastOpts) throw new Error("Run an audit first.");
      post({ type: "dispute", reqId: msg.reqId, csv: toDisputeCsv(fullReport, convs) });
      return;
    }
  } catch (e) {
    if (!alive()) return;
    const stage =
      msg.type === "peek" || msg.type === "sample"
        ? "peek"
        : msg.type === "parse"
          ? "parse"
          : msg.type === "audit"
            ? "audit"
            : "dispute";
    post({
      type: "error",
      stage,
      message: e instanceof Error ? e.message : "Something went wrong.",
    });
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item || item.gen !== generation) continue;
      // Only the newest of several waiting audit requests matters.
      if (item.msg.type === "audit" && queue.some((q) => q.gen === generation && q.msg.type === "audit")) {
        continue;
      }
      await handle(item.msg, item.gen);
    }
  } finally {
    draining = false;
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerInput>) => {
  const msg = ev.data;
  if (msg.type === "reset") {
    generation += 1;
    queue.length = 0;
    clearState();
    return;
  }
  queue.push({ msg, gen: generation });
  void drain();
};
