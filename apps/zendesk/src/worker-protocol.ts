// Message protocol between the page and the audit worker. Types only.
// One worker serves both data sources: the Zendesk API (`audit`, `patch`) and an uploaded
// export file (`peek`, `sample`, `parse`). `options` and `dispute` act on whichever is loaded.
import type { AuditOptions, AuditReport, Preset } from "@/engine";
import type { MapInput, MapStats } from "./types";

export type ZAuditOptions = Omit<AuditOptions, "exportEnd">;

export type WorkerIn =
  /** API source: map and audit a fresh input. The worker keeps it for later `patch` messages. */
  | { type: "audit"; reqId: number; input: MapInput; opts: ZAuditOptions; vendorName: string }
  /** API source: change the reply-order answers and/or the billed id list, then re-map and re-audit. */
  | {
      type: "patch";
      reqId: number;
      patch: { replyOrder?: Record<number, boolean>; billedIds?: number[] | null };
      opts: ZAuditOptions;
      vendorName: string;
    }
  /** File source: read the head of a file and detect its format. */
  | { type: "peek"; input: File | string; label: string }
  /** File source: built-in synthetic sample data. */
  | { type: "sample"; preset: Preset }
  /** File source: parse the peeked file with a preset. */
  | { type: "parse"; preset: Preset }
  /** Re-run only the audit on the conversations already loaded, with new options. */
  | { type: "options"; reqId: number; opts: ZAuditOptions; vendorName: string }
  | { type: "dispute"; reqId: number }
  /** Forget everything kept in memory and drop queued work. */
  | { type: "reset" };

export type WorkerOut =
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
  | { type: "parsed"; conversations: number; headers: string[]; warnings: string[] }
  | {
      type: "audited";
      reqId: number;
      report: AuditReport; // results trimmed to phantom rows only
      summary: string;
      /** API source only. */
      stats: MapStats | null;
    }
  | { type: "dispute"; reqId: number; csv: string }
  | { type: "error"; reqId: number | null; stage: "peek" | "parse" | "audit" | "dispute"; message: string };
