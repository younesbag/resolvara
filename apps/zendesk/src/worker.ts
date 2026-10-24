// Audit worker: runs the engine off the main thread for both data sources (Zendesk API rows and
// an uploaded export file). No network access of any kind; the engine is code-only. Everything
// stays in memory. Messages are handled one at a time; `reset` drops queued work.
import {
  audit,
  detectPreset,
  disputeSummaryText,
  parseFile,
  peekFile,
  sampleDataset,
  toDisputeCsv,
  type AuditOptions,
  type AuditReport,
  type Conversation,
  type Preset,
} from "@/engine";
import { makeKeyHasher } from "@/engine/hash";
import { withBilledBasis } from "./basis";
import { toConversations } from "./map";
import type { MapInput, MapStats } from "./types";
import type { WorkerIn, WorkerOut, ZAuditOptions } from "./worker-protocol";

const ctx = self as unknown as {
  postMessage(msg: WorkerOut): void;
  onmessage: ((ev: MessageEvent<WorkerIn>) => void) | null;
};
const post = (m: WorkerOut) => ctx.postMessage(m);

type Source = "api" | "file" | null;

let source: Source = null;
let preset: Preset = "zendesk";
let lastInput: MapInput | null = null; // API source
let stats: MapStats | null = null; // API source
let fileInput: File | string | null = null; // file source
let convs: Conversation[] = [];
let fullReport: AuditReport | null = null;

let generation = 0;
const queue: { msg: WorkerIn; gen: number }[] = [];
let draining = false;

function trimReport(report: AuditReport): AuditReport {
  // Keep only the rows the UI lists (phantom). Counts and aggregates are untouched.
  return { ...report, results: report.results.filter((r) => r.verdict === "phantom") };
}

function clearState() {
  source = null;
  preset = "zendesk";
  lastInput = null;
  stats = null;
  fileInput = null;
  convs = [];
  fullReport = null;
}

function mapApi(input: MapInput): void {
  const res = toConversations(input, makeKeyHasher());
  convs = res.conversations;
  stats = res.stats;
  fullReport = null;
}

function runAudit(reqId: number, opts: ZAuditOptions, vendorName: string): void {
  if (source === null) throw new Error("Load data first.");
  // API source: the window is judged against the fetch time. File source: the engine default.
  const full: AuditOptions =
    source === "api" && lastInput ? { ...opts, exportEnd: new Date(lastInput.fetchedAt) } : { ...opts };
  fullReport = audit(convs, full, preset);
  const text = disputeSummaryText(fullReport, full, vendorName);
  post({
    type: "audited",
    reqId,
    report: trimReport(fullReport),
    summary: source === "api" && lastInput ? withBilledBasis(text, lastInput) : text,
    stats: source === "api" ? stats : null,
  });
}

function startFileSource(input: File | string): void {
  source = "file";
  lastInput = null;
  stats = null;
  convs = [];
  fullReport = null;
  fileInput = input;
}

async function handle(msg: WorkerIn, gen: number): Promise<void> {
  const alive = () => gen === generation;
  try {
    if (msg.type === "audit") {
      source = "api";
      preset = "zendesk";
      fileInput = null;
      lastInput = msg.input;
      post({ type: "progress", stage: "auditing", p: 0.5 });
      mapApi(msg.input);
      runAudit(msg.reqId, msg.opts, msg.vendorName);
      return;
    }

    if (msg.type === "patch") {
      if (source !== "api" || !lastInput) throw new Error("Run an audit first.");
      const next: MapInput = { ...lastInput };
      if ("replyOrder" in msg.patch) next.replyOrder = msg.patch.replyOrder;
      if ("billedIds" in msg.patch) next.billedIds = msg.patch.billedIds ?? null;
      lastInput = next;
      mapApi(next);
      runAudit(msg.reqId, msg.opts, msg.vendorName);
      return;
    }

    if (msg.type === "sample") {
      const text = sampleDataset(msg.preset);
      startFileSource(text);
      const { headers, rows } = await peekFile(text);
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
      startFileSource(msg.input);
      post({ type: "progress", stage: "reading", p: 0.02 });
      let peek;
      try {
        peek = await peekFile(msg.input);
      } catch (e) {
        if (!alive()) return;
        post({
          type: "error",
          reqId: null,
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
      if (source !== "file" || fileInput === null) throw new Error("No file loaded.");
      fullReport = null;
      post({ type: "progress", stage: "parsing", p: 0 });
      let lastSent = 0;
      const res = await parseFile(fileInput, {
        preset: msg.preset,
        onProgress: (p) => {
          const now = Date.now();
          if (alive() && (now - lastSent > 60 || p >= 1)) {
            lastSent = now;
            post({ type: "progress", stage: "parsing", p });
          }
        },
      });
      if (!alive()) return;
      preset = msg.preset; // committed together with the conversations it produced
      convs = res.conversations;
      post({ type: "parsed", conversations: convs.length, headers: res.headers, warnings: res.warnings });
      return;
    }

    if (msg.type === "options") {
      runAudit(msg.reqId, msg.opts, msg.vendorName);
      return;
    }

    if (msg.type === "dispute") {
      if (!fullReport) throw new Error("Run an audit first.");
      post({ type: "dispute", reqId: msg.reqId, csv: toDisputeCsv(fullReport, convs) });
    }
  } catch (e) {
    if (!alive()) return;
    const stage =
      msg.type === "peek" || msg.type === "sample"
        ? "peek"
        : msg.type === "parse"
          ? "parse"
          : msg.type === "dispute"
            ? "dispute"
            : "audit";
    post({
      type: "error",
      reqId: "reqId" in msg ? msg.reqId : null,
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
      // Only the newest of several waiting option changes matters.
      if (item.msg.type === "options" && queue.some((q) => q.gen === generation && q.msg.type === "options")) {
        continue;
      }
      await handle(item.msg, item.gen);
    }
  } finally {
    draining = false;
  }
}

ctx.onmessage = (ev: MessageEvent<WorkerIn>) => {
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
