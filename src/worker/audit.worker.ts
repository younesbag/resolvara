/// <reference lib="webworker" />
// Audit worker: all parsing and classification runs here, off the main thread.
// No network access of any kind. The engine is code-only; see docs/SPEC.md.
import Papa from "papaparse";
import {
  audit,
  contributionPayload,
  detectPreset,
  disputeSummaryText,
  parseFile,
  sampleDataset,
  toDisputeCsv,
  type AuditOptions,
  type AuditReport,
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

const PEEK_BYTES = 768 * 1024;
const PEEK_ROWS = 40;

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
  depth = 0,
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && depth < 3) {
      flatten(v as Record<string, unknown>, key, depth + 1, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

async function readHead(src: File | string): Promise<{ text: string; truncated: boolean }> {
  if (typeof src === "string") {
    return { text: src.slice(0, PEEK_BYTES), truncated: src.length > PEEK_BYTES };
  }
  const text = await src.slice(0, PEEK_BYTES).text();
  return { text, truncated: src.size > PEEK_BYTES };
}

async function peekRows(
  src: File | string,
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const { text: rawHead, truncated } = await readHead(src);
  const head = rawHead.replace(/^﻿/, "");
  const first = head.trimStart()[0];

  if (first === "{" || first === "[") {
    let objs: Record<string, unknown>[] = [];
    // JSON array: parse the whole thing when it is small enough, else fall back to lines.
    if (first === "[") {
      const whole =
        typeof src === "string"
          ? src
          : src.size <= 64 * 1024 * 1024
            ? await src.text()
            : head;
      try {
        const data = JSON.parse(whole.replace(/^﻿/, "")) as unknown;
        if (Array.isArray(data)) objs = data.slice(0, PEEK_ROWS) as Record<string, unknown>[];
      } catch {
        /* fall through to line mode */
      }
    }
    if (objs.length === 0) {
      const lines = head.split(/\r?\n/).filter((l) => l.trim());
      if (truncated) lines.pop();
      for (const l of lines.slice(0, PEEK_ROWS)) {
        try {
          const o = JSON.parse(l.trim().replace(/,$/, "")) as unknown;
          if (o && typeof o === "object") objs.push(o as Record<string, unknown>);
        } catch {
          /* skip a bad line */
        }
      }
    }
    if (objs.length === 0) throw new Error("Could not read any JSON records from this file.");
    const rows = objs.map((o) => ({ ...o, ...flatten(o) }));
    const headers = Array.from(new Set(objs.flatMap((o) => Object.keys(flatten(o)))));
    return { headers, rows };
  }

  // CSV / delimited text
  const lines = head.split(/\r?\n/);
  if (truncated) lines.pop(); // the last line may be cut mid-row
  const res = Papa.parse<Record<string, unknown>>(lines.join("\n"), {
    header: true,
    preview: PEEK_ROWS,
    skipEmptyLines: true,
  });
  const headers = (res.meta.fields ?? []).filter((h) => h !== "");
  if (headers.length === 0) throw new Error("Could not find a header row in this file.");
  return { headers, rows: res.data };
}

function trimReport(report: AuditReport): AuditReport {
  // Keep only the rows the UI lists (phantom). Counts and aggregates are untouched.
  return { ...report, results: report.results.filter((r) => r.verdict === "phantom") };
}

ctx.onmessage = async (ev: MessageEvent<WorkerInput>) => {
  const msg = ev.data;
  try {
    if (msg.type === "sample") {
      input = sampleDataset(msg.preset);
      convs = [];
      fullReport = null;
      const { headers, rows } = await peekRows(input);
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
      let headers: string[];
      let rows: Record<string, unknown>[];
      try {
        ({ headers, rows } = await peekRows(msg.input));
      } catch (e) {
        post({
          type: "error",
          stage: "peek",
          message: e instanceof Error ? e.message : "Could not read this file.",
        });
        return;
      }
      const d = detectPreset(headers, rows);
      post({
        type: "peeked",
        label: msg.label,
        headers,
        preset: d.preset,
        confidence: d.confidence,
        sampleRows: rows.length,
        isSample: false,
      });
      return;
    }

    if (msg.type === "parse") {
      if (input === null) throw new Error("No file loaded.");
      lastPreset = msg.preset;
      fullReport = null;
      post({ type: "progress", stage: "parsing", p: 0 });
      let lastSent = 0;
      const res = await parseFile(input, {
        preset: msg.preset,
        mapping: msg.mapping,
        onProgress: (p) => {
          const now = Date.now();
          if (now - lastSent > 60 || p >= 1) {
            lastSent = now;
            post({ type: "progress", stage: "parsing", p });
          }
        },
      });
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
      post({
        type: "audited",
        reqId: msg.reqId,
        report: trimReport(fullReport),
        summary: disputeSummaryText(fullReport, msg.opts, msg.vendorName),
        payload: contributionPayload(fullReport, msg.opts),
      });
      return;
    }

    if (msg.type === "dispute") {
      if (!fullReport || !lastOpts) throw new Error("Run an audit first.");
      post({ type: "dispute", reqId: msg.reqId, csv: toDisputeCsv(fullReport, convs) });
      return;
    }
  } catch (e) {
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
};
