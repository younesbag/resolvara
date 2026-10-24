"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuditOptions,
  AuditReport,
  ColumnMapping,
  Contribution,
  Preset,
} from "@/engine";
import type { WorkerInput, WorkerOutput } from "@/worker/protocol";
import { DEFAULT_PRICE, PRESET_VENDOR_NAME } from "./meta";

export type Phase = "idle" | "working" | "mapping" | "results" | "error";
export type Stage = "reading" | "parsing" | "auditing";

export interface AuditorState {
  phase: Phase;
  stage: Stage;
  progress: number;
  label: string;
  headers: string[];
  detected: Preset;
  confidence: number;
  preset: Preset;
  mapping: ColumnMapping | null;
  mapperOpen: boolean;
  parseWarnings: string[];
  conversationCount: number;
  opts: AuditOptions;
  vendorName: string;
  report: AuditReport | null;
  summary: string;
  payload: Contribution | null;
  refreshing: boolean;
  isSample: boolean; // sample data never goes to the community benchmark
  error: string | null;
  notice: string | null;
}

export const DEFAULT_OPTS: AuditOptions = {
  windowDays: 7,
  pricePerResolution: 0,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
};

const INITIAL: AuditorState = {
  phase: "idle",
  stage: "reading",
  progress: 0,
  label: "",
  headers: [],
  detected: "generic",
  confidence: 0,
  preset: "generic",
  mapping: null,
  mapperOpen: false,
  parseWarnings: [],
  conversationCount: 0,
  opts: DEFAULT_OPTS,
  vendorName: "the vendor",
  report: null,
  summary: "",
  payload: null,
  refreshing: false,
  isSample: false,
  error: null,
  notice: null,
};

// Presets we trust to parse without asking the user to confirm columns.
const AUTO_OK = new Set<Preset>(["intercom", "zendesk", "ada"]);

export function useAuditor() {
  const [state, setState] = useState<AuditorState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const workerRef = useRef<Worker | null>(null);
  const reqRef = useRef(0);
  const latestAudit = useRef(0);
  const disputeWaiters = useRef(new Map<number, (csv: string) => void>());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priceTouched = useRef(false);
  const vendorTouched = useRef(false);

  const patch = useCallback((p: Partial<AuditorState>) => {
    setState((s) => ({ ...s, ...p }));
  }, []);

  const post = useCallback((msg: WorkerInput) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const requestAudit = useCallback(
    (opts?: AuditOptions, vendorName?: string) => {
      const s = stateRef.current;
      const reqId = ++reqRef.current;
      latestAudit.current = reqId;
      post({
        type: "audit",
        reqId,
        opts: opts ?? s.opts,
        vendorName: vendorName ?? s.vendorName,
      });
    },
    [post],
  );

  const startParse = useCallback(
    (preset: Preset, mapping?: ColumnMapping) => {
      const s = stateRef.current;
      const nextOpts = { ...s.opts };
      if (!priceTouched.current) nextOpts.pricePerResolution = DEFAULT_PRICE[preset];
      const vendorName = vendorTouched.current ? s.vendorName : PRESET_VENDOR_NAME[preset];
      patch({
        phase: s.report ? "results" : "working",
        refreshing: Boolean(s.report),
        stage: "parsing",
        progress: 0,
        preset,
        mapping: mapping ?? null,
        mapperOpen: false,
        opts: nextOpts,
        vendorName,
        error: null,
      });
      post({ type: "parse", preset, mapping });
    },
    [patch, post],
  );

  const onMessage = useCallback(
    (ev: MessageEvent<WorkerOutput>) => {
      const m = ev.data;
      switch (m.type) {
        case "progress":
          patch({ stage: m.stage, progress: m.p });
          break;
        case "peeked": {
          patch({
            label: m.label,
            headers: m.headers,
            detected: m.preset,
            confidence: m.confidence,
            isSample: m.isSample,
          });
          const confident = m.isSample || (AUTO_OK.has(m.preset) && m.confidence >= 0.6);
          if (confident) startParse(m.preset);
          else patch({ phase: "mapping", mapperOpen: true, preset: m.preset });
          break;
        }
        case "parsed": {
          patch({
            conversationCount: m.conversations,
            parseWarnings: m.warnings,
            headers: m.headers.length ? m.headers : stateRef.current.headers,
            stage: "auditing",
            progress: 0.5,
          });
          requestAudit();
          break;
        }
        case "audited": {
          if (m.reqId !== latestAudit.current) break;
          patch({
            phase: "results",
            report: m.report,
            summary: m.summary,
            payload: m.payload,
            refreshing: false,
            error: null,
          });
          break;
        }
        case "dispute": {
          disputeWaiters.current.get(m.reqId)?.(m.csv);
          disputeWaiters.current.delete(m.reqId);
          break;
        }
        case "error": {
          if (m.stage === "audit" || m.stage === "dispute") {
            patch({ refreshing: false, notice: m.message });
          } else if (stateRef.current.report) {
            patch({ refreshing: false, notice: m.message, phase: "results" });
          } else {
            patch({ phase: "error", error: m.message, refreshing: false });
          }
          break;
        }
      }
    },
    [patch, requestAudit, startParse],
  );

  // One worker for the whole visit. It is created on mount, so its code is fetched when the page
  // loads and not when a file is dropped: an audit itself makes no network request, and the page
  // keeps working offline once loaded. Starting a new file resets the worker with a message.
  const ensureWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      const w = new Worker(new URL("../../worker/audit.worker.ts", import.meta.url), {
        type: "module",
      });
      w.onmessage = onMessage;
      w.onerror = (e) => {
        e.preventDefault();
        patch({
          phase: stateRef.current.report ? "results" : "error",
          error: e.message || "The audit worker failed to start.",
          refreshing: false,
        });
      };
      workerRef.current = w;
    }
    return workerRef.current;
  }, [onMessage, patch]);

  // Keep the worker's message handler pointing at the latest callbacks.
  useEffect(() => {
    if (workerRef.current) workerRef.current.onmessage = onMessage;
  }, [onMessage]);

  useEffect(() => {
    ensureWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
      if (debounce.current) clearTimeout(debounce.current);
    };
    // Mount and unmount only; ensureWorker's identity changes with the callbacks it wraps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const freshStart = useCallback(
    (label: string) => {
      ensureWorker().postMessage({ type: "reset" } satisfies WorkerInput);
      if (debounce.current) clearTimeout(debounce.current);
      disputeWaiters.current.clear();
      priceTouched.current = false;
      vendorTouched.current = false;
      setState({ ...INITIAL, phase: "working", stage: "reading", progress: 0.02, label });
    },
    [ensureWorker],
  );

  const loadFile = useCallback(
    (file: File) => {
      freshStart(file.name);
      post({ type: "peek", input: file, label: file.name });
    },
    [freshStart, post],
  );

  const loadSample = useCallback(
    (preset: Preset) => {
      freshStart(`Sample data (${preset})`);
      post({ type: "sample", preset });
    },
    [freshStart, post],
  );

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: "reset" } satisfies WorkerInput);
    if (debounce.current) clearTimeout(debounce.current);
    disputeWaiters.current.clear();
    setState(INITIAL);
  }, []);

  const setOpts = useCallback(
    (p: Partial<AuditOptions>, source?: "price") => {
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

  const changePreset = useCallback(
    (preset: Preset) => {
      if (preset === "generic" || preset === "gorgias") {
        patch({ preset, mapperOpen: true });
        return;
      }
      startParse(preset);
    },
    [patch, startParse],
  );

  const applyMapping = useCallback(
    (preset: Preset, mapping: ColumnMapping) => {
      startParse(preset, mapping);
    },
    [startParse],
  );

  const openMapper = useCallback(() => patch({ mapperOpen: true }), [patch]);
  const closeMapper = useCallback(() => {
    if (stateRef.current.phase === "mapping") reset();
    else patch({ mapperOpen: false });
  }, [patch, reset]);

  const requestDispute = useCallback((): Promise<string> => {
    return new Promise((resolve) => {
      const reqId = ++reqRef.current;
      disputeWaiters.current.set(reqId, resolve);
      post({ type: "dispute", reqId });
    });
  }, [post]);

  const dismissNotice = useCallback(() => patch({ notice: null }), [patch]);

  return {
    state,
    loadFile,
    loadSample,
    reset,
    setOpts,
    setVendorName,
    changePreset,
    applyMapping,
    openMapper,
    closeMapper,
    requestDispute,
    dismissNotice,
  };
}
