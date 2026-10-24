import { useCallback, useEffect, useRef, useState } from "react";
import type { AuditReport, Preset } from "@/engine";
import { DEFAULT_PRICE, PRESET_VENDOR_NAME } from "@/components/auditor/meta";
import { downloadBlob, stamp } from "@/components/auditor/format";
import {
  DEFAULT_REPLY_ORDER_CAP,
  buildInput,
  createFetcher,
  createSession,
  type FetchProgress,
  type FetchSession,
  type Fetcher,
} from "../fetcher";
import type { MapStats } from "../types";
import { parseUsageCsv } from "../usage-csv";
import type { WorkerOut, ZAuditOptions } from "../worker-protocol";
import { CancelToken, ZendeskError, createZaf, type WaitInfo, type ZafClient } from "../zaf";
import { makeWorker, type AuditWorker } from "./make-worker";

export type Source = "api" | "file";
export type Stage =
  | "intro"
  | "fetching" // API: reading from Zendesk
  | "paused" // API: stopped (cancel or error), can resume
  | "reading" // file: reading / parsing / auditing
  | "confirm" // file: format not certain, choose one
  | "results"
  | "error";

export interface UsageInfo {
  column: string | null;
  ids: number;
  rows: number;
  fileName: string;
}

export interface ReplyCheck {
  running: boolean;
  done: number;
  total: number;
  checked: number; // answers collected so far in this session
  skipped: number; // candidates left out by the cap
}

export interface AppState {
  stage: Stage;
  source: Source | null;
  periodDays: number;
  progress: FetchProgress | null;
  wait: WaitInfo | null;
  fetchError: string | null;
  fileStage: "reading" | "parsing" | "auditing";
  fileProgress: number;
  label: string;
  detected: Preset;
  preset: Preset;
  isSample: boolean;
  parseWarnings: string[];
  opts: ZAuditOptions;
  vendorName: string;
  report: AuditReport | null;
  summary: string;
  stats: MapStats | null;
  refreshing: boolean;
  notice: string | null;
  error: string | null;
  usage: UsageInfo | null;
  replyCandidates: number; // AI tickets with agent replies not yet checked
  replyCheck: ReplyCheck | null;
}

export const DEFAULT_OPTS: ZAuditOptions = {
  windowDays: 7,
  pricePerResolution: 0,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
  countAgentReplies: false,
};

const INITIAL: AppState = {
  stage: "intro",
  source: null,
  periodDays: 30,
  progress: null,
  wait: null,
  fetchError: null,
  fileStage: "reading",
  fileProgress: 0,
  label: "",
  detected: "generic",
  preset: "generic",
  isSample: false,
  parseWarnings: [],
  opts: DEFAULT_OPTS,
  vendorName: "Zendesk",
  report: null,
  summary: "",
  stats: null,
  refreshing: false,
  notice: null,
  error: null,
  usage: null,
  replyCandidates: 0,
  replyCheck: null,
};

// Presets that parse without asking the user to confirm the format.
const AUTO_OK = new Set<Preset>(["intercom", "zendesk", "ada"]);

const DAY_MS = 86_400_000;

function describe(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function useApp(client: ZafClient | null) {
  const [state, setState] = useState<AppState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const workerRef = useRef<AuditWorker | null>(null);
  const fetcherRef = useRef<Fetcher | null>(null);
  const sessionRef = useRef<FetchSession | null>(null);
  const tokenRef = useRef<CancelToken | null>(null);
  const reqRef = useRef(0);
  const latestAudit = useRef(0);
  const disputeWaiters = useRef(new Map<number, { resolve: (csv: string) => void; reject: (e: Error) => void }>());
  // Bumped by every fresh start. Async work begun under an older run must not touch the new state.
  const runGen = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTouched = useRef(false);
  const vendorTouched = useRef(false);
  const usageIds = useRef<number[] | null>(null);

  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);

  if (client && !fetcherRef.current) fetcherRef.current = createFetcher(createZaf(client));

  const onMessage = useCallback(
    (m: WorkerOut) => {
      switch (m.type) {
        case "progress":
          patch({ fileStage: m.stage, fileProgress: m.p });
          break;
        case "peeked": {
          patch({ label: m.label, detected: m.preset, preset: m.preset, isSample: m.isSample });
          const confident = m.isSample || (AUTO_OK.has(m.preset) && m.confidence >= 0.6);
          if (confident) startParseRef.current(m.preset);
          else patch({ stage: "confirm" });
          break;
        }
        case "parsed":
          patch({ parseWarnings: m.warnings, fileStage: "auditing", fileProgress: 0.5 });
          requestAudit();
          break;
        case "audited":
          if (m.reqId !== latestAudit.current) break;
          patch({
            stage: "results",
            report: m.report,
            summary: m.summary,
            stats: m.stats,
            refreshing: false,
            error: null,
          });
          break;
        case "dispute":
          disputeWaiters.current.get(m.reqId)?.resolve(m.csv);
          disputeWaiters.current.delete(m.reqId);
          break;
        case "error":
          if (m.stage === "dispute" && m.reqId !== null) {
            const w = disputeWaiters.current.get(m.reqId);
            disputeWaiters.current.delete(m.reqId);
            if (w) {
              w.reject(new Error(m.message));
              break;
            }
          }
          if (m.stage === "audit" || m.stage === "dispute") {
            patch({ refreshing: false, notice: m.message });
          } else if (stateRef.current.report) {
            patch({ refreshing: false, notice: m.message, stage: "results" });
          } else {
            patch({ stage: "error", error: m.message, refreshing: false });
          }
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patch],
  );

  const ensureWorker = useCallback((): AuditWorker | null => {
    if (!workerRef.current) {
      try {
        const w = makeWorker();
        w.onMessage((m) => onMessageRef.current(m));
        w.onFailure((message) => {
          patch({
            stage: stateRef.current.report ? "results" : "error",
            error: message,
            refreshing: false,
          });
        });
        workerRef.current = w;
      } catch (e) {
        patch({ stage: "error", error: `Could not start the audit worker: ${describe(e)}` });
        return null;
      }
    }
    return workerRef.current;
  }, [patch]);

  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      tokenRef.current?.cancel();
      if (debounce.current) clearTimeout(debounce.current);
    };
    // Mount and unmount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestAudit = useCallback((opts?: ZAuditOptions, vendorName?: string) => {
    const s = stateRef.current;
    const reqId = ++reqRef.current;
    latestAudit.current = reqId;
    workerRef.current?.post({ type: "options", reqId, opts: opts ?? s.opts, vendorName: vendorName ?? s.vendorName });
  }, []);

  // ---- file source ----

  const startParse = useCallback(
    (preset: Preset) => {
      const s = stateRef.current;
      const opts = { ...s.opts };
      if (!priceTouched.current) opts.pricePerResolution = DEFAULT_PRICE[preset];
      const vendorName = vendorTouched.current ? s.vendorName : PRESET_VENDOR_NAME[preset];
      patch({
        stage: s.report ? "results" : "reading",
        refreshing: Boolean(s.report),
        fileStage: "parsing",
        fileProgress: 0,
        preset,
        opts,
        vendorName,
        error: null,
      });
      workerRef.current?.post({ type: "parse", preset });
    },
    [patch],
  );
  const startParseRef = useRef(startParse);
  startParseRef.current = startParse;

  const freshStart = useCallback(
    (p: Partial<AppState>) => {
      tokenRef.current?.cancel();
      tokenRef.current = null;
      sessionRef.current = null;
      usageIds.current = null;
      priceTouched.current = false;
      vendorTouched.current = false;
      if (debounce.current) clearTimeout(debounce.current);
      for (const w of disputeWaiters.current.values()) w.reject(new Error("Started over."));
      disputeWaiters.current.clear();
      // An "audited" for a request sent before this point must not land on the fresh state.
      latestAudit.current = ++reqRef.current;
      runGen.current += 1;
      ensureWorker()?.post({ type: "reset" });
      setState({ ...INITIAL, periodDays: stateRef.current.periodDays, ...p });
    },
    [ensureWorker],
  );

  const loadFile = useCallback(
    (file: File) => {
      freshStart({ stage: "reading", source: "file", label: file.name, fileStage: "reading", fileProgress: 0.02, vendorName: "the vendor" });
      workerRef.current?.post({ type: "peek", input: file, label: file.name });
    },
    [freshStart],
  );

  const loadSample = useCallback(
    (preset: Preset) => {
      freshStart({ stage: "reading", source: "file", label: `Sample data (${preset})`, fileStage: "reading", fileProgress: 0.02, vendorName: "the vendor" });
      workerRef.current?.post({ type: "sample", preset });
    },
    [freshStart],
  );

  const changePreset = useCallback((preset: Preset) => startParse(preset), [startParse]);

  // ---- API source ----

  const runFetch = useCallback(async () => {
    const fetcher = fetcherRef.current;
    const session = sessionRef.current;
    if (!fetcher || !session) return;
    const token = new CancelToken();
    tokenRef.current = token;
    const gen = runGen.current;
    const live = () => gen === runGen.current;
    patch({ stage: "fetching", fetchError: null, wait: null });
    try {
      await fetcher.run(session, {
        token,
        onProgress: (progress) => live() && patch({ progress }),
        onWait: (wait) => live() && patch({ wait }),
      });
      if (!live()) return;
      if (token.cancelled) {
        // Cancel pressed while the last request was in flight: that page completed the fetch,
        // so nothing is lost; stop here and let the user resume (which goes straight to the audit).
        patch({ stage: "paused", wait: null, fetchError: null });
        return;
      }
      const s = stateRef.current;
      const reqId = ++reqRef.current;
      latestAudit.current = reqId;
      patch({
        stage: "reading",
        fileStage: "auditing",
        fileProgress: 0.5,
        replyCandidates: fetcher.replyOrderCandidates(session).length,
      });
      workerRef.current?.post({
        type: "audit",
        reqId,
        input: buildInput(session, { billedIds: usageIds.current }),
        opts: s.opts,
        vendorName: s.vendorName,
      });
    } catch (e) {
      if (!live()) return;
      if (e instanceof ZendeskError && e.kind === "cancelled") {
        patch({ stage: "paused", wait: null, fetchError: null });
        return;
      }
      const hard = e instanceof ZendeskError && (e.kind === "forbidden" || e.kind === "unauthorized");
      patch({ stage: hard ? "error" : "paused", wait: null, fetchError: describe(e), error: hard ? describe(e) : null });
    } finally {
      if (live()) patch({ wait: null });
    }
  }, [patch]);

  const runApi = useCallback(
    (days: number) => {
      if (!fetcherRef.current) {
        patch({ stage: "error", error: "This page is not running inside Zendesk, so the Zendesk API is not available. Upload an export file instead." });
        return;
      }
      freshStart({ stage: "fetching", source: "api", periodDays: days, vendorName: "Zendesk", preset: "zendesk", detected: "zendesk" });
      sessionRef.current = createSession(new Date(Date.now() - days * DAY_MS));
      void runFetch();
    },
    [freshStart, patch, runFetch],
  );

  const resume = useCallback(() => void runFetch(), [runFetch]);

  const cancel = useCallback(() => tokenRef.current?.cancel(), []);

  const checkReplyOrder = useCallback(
    async (cap: number) => {
      const fetcher = fetcherRef.current;
      const session = sessionRef.current;
      if (!fetcher || !session || stateRef.current.source !== "api") return;
      const token = new CancelToken();
      tokenRef.current = token;
      const gen = runGen.current;
      const live = () => gen === runGen.current;
      const before = Object.keys(session.replyOrder).length;
      patch({ replyCheck: { running: true, done: before, total: before, checked: before, skipped: 0 }, notice: null });
      let note: string | null = null;
      try {
        const r = await fetcher.checkReplyOrder(session, {
          cap,
          token,
          onProgress: (p) => {
            if (!live() || token.cancelled) return;
            patch({
              replyCheck: {
                running: true,
                done: p.done ?? 0,
                total: p.total ?? 0,
                checked: Object.keys(session.replyOrder).length,
                skipped: 0,
              },
            });
          },
          onWait: (wait) => live() && patch({ wait }),
        });
        const unknown = r.attempted - r.checked;
        const parts = [`Comments read on ${r.attempted} of ${r.candidates} tickets; the order was established on ${r.checked}.`];
        if (unknown > 0) parts.push(`${unknown} had no comment marked as the AI agent's, so their order stays unknown.`);
        if (r.skipped > 0) parts.push(`${r.skipped} were left out by the cap of ${cap}. Raise the cap and run again to cover them.`);
        note = unknown > 0 || r.skipped > 0 ? parts.join(" ") : null;
      } catch (e) {
        note =
          e instanceof ZendeskError && e.kind === "cancelled"
            ? "Reply-order check stopped. The answers collected so far were applied."
            : `Reply-order check stopped: ${describe(e)} The answers collected so far were applied.`;
      }
      if (!live()) return;
      const answers = { ...session.replyOrder };
      const checked = Object.keys(answers).length;
      patch({
        wait: null,
        replyCheck: { running: false, done: checked, total: checked, checked, skipped: session.replyOrderSkipped },
        replyCandidates: fetcher.replyOrderCandidates(session).length,
        notice: note,
        refreshing: checked > 0,
      });
      if (checked > 0) {
        const s = stateRef.current;
        const reqId = ++reqRef.current;
        latestAudit.current = reqId;
        workerRef.current?.post({ type: "patch", reqId, patch: { replyOrder: answers }, opts: s.opts, vendorName: s.vendorName });
      }
    },
    [patch],
  );

  const loadUsageCsv = useCallback(
    async (file: File) => {
      if (stateRef.current.source !== "api") return;
      try {
        const parsed = parseUsageCsv(await file.text());
        if (parsed.ids.length === 0) {
          patch({
            notice: parsed.column
              ? `The column "${parsed.column}" has no ticket ids in ${file.name}.`
              : `No ticket id column was found in ${file.name}. Use the CSV from Admin Center, Usage, Resolutions.`,
          });
          return;
        }
        usageIds.current = parsed.ids;
        patch({
          usage: { column: parsed.column, ids: parsed.ids.length, rows: parsed.rows, fileName: file.name },
          refreshing: true,
          notice: null,
        });
        const s = stateRef.current;
        const reqId = ++reqRef.current;
        latestAudit.current = reqId;
        workerRef.current?.post({ type: "patch", reqId, patch: { billedIds: parsed.ids }, opts: s.opts, vendorName: s.vendorName });
      } catch (e) {
        patch({ notice: `Could not read ${file.name}: ${describe(e)}` });
      }
    },
    [patch],
  );

  const clearUsageCsv = useCallback(() => {
    usageIds.current = null;
    patch({ usage: null, refreshing: true });
    const s = stateRef.current;
    const reqId = ++reqRef.current;
    latestAudit.current = reqId;
    workerRef.current?.post({ type: "patch", reqId, patch: { billedIds: null }, opts: s.opts, vendorName: s.vendorName });
  }, [patch]);

  // ---- shared ----

  const setOpts = useCallback(
    (p: Partial<ZAuditOptions>, source?: "price") => {
      if (source === "price") priceTouched.current = true;
      const next = { ...stateRef.current.opts, ...p };
      patch({ opts: next, refreshing: Boolean(stateRef.current.report) });
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => requestAudit(next), 220);
    },
    [patch, requestAudit],
  );

  const setVendorName = useCallback(
    (name: string) => {
      vendorTouched.current = true;
      patch({ vendorName: name });
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => requestAudit(undefined, name), 300);
    },
    [patch, requestAudit],
  );

  const setPeriodDays = useCallback((days: number) => patch({ periodDays: days }), [patch]);

  const reset = useCallback(() => {
    freshStart({});
  }, [freshStart]);

  const downloadDispute = useCallback(async () => {
    try {
      const csv = await new Promise<string>((resolve, reject) => {
        const reqId = ++reqRef.current;
        disputeWaiters.current.set(reqId, { resolve, reject });
        workerRef.current?.post({ type: "dispute", reqId });
      });
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `resolvara-dispute-${stamp()}.csv`);
    } catch (e) {
      patch({ notice: `The dispute CSV could not be made: ${describe(e)}` });
    }
  }, [patch]);

  const dismissNotice = useCallback(() => patch({ notice: null }), [patch]);

  return {
    state,
    hasZendesk: client !== null,
    runApi,
    resume,
    cancel,
    loadFile,
    loadSample,
    changePreset,
    confirmPreset: startParse,
    previewPreset: (preset: Preset) => patch({ preset }),
    setOpts,
    setVendorName,
    setPeriodDays,
    checkReplyOrder,
    loadUsageCsv,
    clearUsageCsv,
    downloadDispute,
    dismissNotice,
    reset,
    defaultReplyCap: DEFAULT_REPLY_ORDER_CAP,
  };
}

export type AppApi = ReturnType<typeof useApp>;
