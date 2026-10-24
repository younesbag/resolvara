// Message protocol between the UI thread and the audit worker.
// Types only: safe to import from both sides.
import type {
  AuditOptions,
  AuditReport,
  ColumnMapping,
  Contribution,
  Preset,
} from "@/engine";

export type WorkerInput =
  | { type: "reset" } // forget the file, drop queued work and any parse in progress
  | { type: "peek"; input: File | string; label: string }
  | { type: "sample"; preset: Preset }
  | { type: "parse"; preset: Preset; mapping?: ColumnMapping }
  | { type: "audit"; reqId: number; opts: AuditOptions; vendorName: string }
  | { type: "dispute"; reqId: number };

export interface ParsedInfo {
  conversations: number;
  headers: string[];
  warnings: string[];
}

export type WorkerOutput =
  | {
      type: "peeked";
      label: string;
      headers: string[];
      preset: Preset;
      confidence: number;
      sampleRows: number;
      isSample: boolean;
    }
  | { type: "progress"; stage: "reading" | "parsing" | "auditing"; p: number }
  | ({ type: "parsed" } & ParsedInfo)
  | {
      type: "audited";
      reqId: number;
      report: AuditReport; // results are trimmed to phantom rows only
      summary: string;
      payload: Contribution | null; // null when the window is not a whole number of days
    }
  | { type: "dispute"; reqId: number; csv: string }
  | { type: "error"; stage: "peek" | "parse" | "audit" | "dispute"; message: string };
