// Reads the account's tickets through ZAF. Everything stays in memory; a failed or cancelled run
// keeps its collected rows and last cursor in the session object so it can be resumed in the same
// page session. Nothing is written to storage.
import { replyAfterAi } from "./comments";
import { findResolutionFields } from "./map";
import type { MapInput, ResolutionFieldIds, ZComment, ZMetricSet, ZTicket, ZUser } from "./types";
import {
  CancelToken,
  ZendeskError,
  realRuntime,
  toRelative,
  waitWithCountdown,
  type RequestHooks,
  type WaitCallback,
  type Zaf,
  type ZafRuntime,
} from "./zaf";

/** The incremental export allows 10 requests a minute: keep requests at least this far apart. */
export const EXPORT_MIN_GAP_MS = 6100;
export const DEFAULT_REPLY_ORDER_CAP = 500;
const REPLY_ORDER_CONCURRENCY = 2;
/** Comment reads share the account-wide API limit (200/min on the smallest plans): stay well under it. */
export const COMMENT_MIN_GAP_MS = 700;
const LEGACY_TAG = "ai_agent_automated_resolution";

export type Phase = "fields" | "ai" | "other" | "comments";

export interface FetchProgress {
  phase: Phase;
  pages: number;
  tickets: number;
  /** Reply-order pass only. */
  done?: number;
  total?: number;
}

export interface FetchCallbacks {
  onProgress?: (p: FetchProgress) => void;
  onWait?: WaitCallback;
  token?: CancelToken;
}

interface ExportState {
  tickets: Map<number, ZTicket>;
  metricSets: Map<number, ZMetricSet>;
  afterUrl: string | null;
  pages: number;
  done: boolean;
}

function newExport(): ExportState {
  return { tickets: new Map(), metricSets: new Map(), afterUrl: null, pages: 0, done: false };
}

/** In-memory state of one audit run. Keep it to resume after an error or a cancel. */
export interface FetchSession {
  periodStart: Date;
  startTime: number; // unix seconds
  fields: ResolutionFieldIds | null;
  ai: ExportState;
  other: ExportState;
  lastExportAt: number | null;
  /** When the AI-scoped export finished: the snapshot time of the audited tickets. */
  aiDoneAt: number | null;
  fetchedAt: Date | null;
  /** Ids seen in an export but created before the period: dropped on arrival, counted once. */
  preDropped: Set<number>;
  replyOrder: Record<number, boolean>;
  /** Tickets whose comments were read (answer or not): never re-read in this session. */
  replyAttempted: Set<number>;
  replyOrderSkipped: number;
  /** Names of the account's agents and admins, to spot a teammate in a chat transcript. */
  staffNames: Set<string> | null;
}

export function createSession(periodStart: Date): FetchSession {
  return {
    periodStart,
    startTime: Math.floor(periodStart.getTime() / 1000),
    fields: null,
    ai: newExport(),
    other: newExport(),
    lastExportAt: null,
    aiDoneAt: null,
    fetchedAt: null,
    preDropped: new Set(),
    replyOrder: {},
    replyAttempted: new Set(),
    replyOrderSkipped: 0,
    staffNames: null,
  };
}

interface FieldsPage {
  ticket_fields?: { id: number; key?: string | null; title?: string }[];
  next_page?: string | null;
}

interface ExportPage {
  tickets?: ZTicket[];
  metric_sets?: ZMetricSet[];
  after_url?: string | null;
  end_of_stream?: boolean;
}

interface UsersPage {
  users?: ZUser[];
  next_page?: string | null;
}

interface CommentsPage {
  comments?: ZComment[];
  users?: ZUser[];
  next_page?: string | null;
}

function slimMetric(m: ZMetricSet, ticketId: number): ZMetricSet {
  return {
    ticket_id: m.ticket_id ?? ticketId,
    reopens: m.reopens ?? null,
    replies: m.replies ?? null,
    solved_at: m.solved_at ?? null,
  };
}

/**
 * Keep only what the mapper reads. A raw export row carries the description, every custom field
 * twice and the full `via` object: at 200k tickets that is gigabytes, cloned again into the worker.
 */
export function slimTicket(t: ZTicket, fields: ResolutionFieldIds): ZTicket {
  const keep = new Set([fields.tier, fields.type].filter((id): id is number => id !== null));
  return {
    id: t.id,
    created_at: t.created_at,
    updated_at: t.updated_at,
    status: t.status,
    requester_id: t.requester_id ?? null,
    subject: t.subject ? t.subject.slice(0, 200) : null,
    tags: t.tags?.includes(LEGACY_TAG) ? [LEGACY_TAG] : [],
    via: { channel: t.via?.channel ?? null },
    custom_fields: (t.custom_fields ?? []).filter((f) => keep.has(f.id)).map((f) => ({ id: f.id, value: f.value })),
    satisfaction_rating: t.satisfaction_rating ? { score: t.satisfaction_rating.score ?? null } : null,
    metric_set: t.metric_set ? slimMetric(t.metric_set, t.id) : null,
    support_type: t.support_type ?? null,
  };
}

/** after_url normally repeats the original query, but make sure the scoping params survive. */
export function ensureParams(url: string, required: Record<string, string>): string {
  const rel = toRelative(url);
  const q = rel.indexOf("?");
  const path = q === -1 ? rel : rel.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : rel.slice(q + 1));
  for (const [k, v] of Object.entries(required)) if (!params.has(k)) params.set(k, v);
  return `${path}?${params.toString()}`;
}

export function exportUrl(startTime: number, scoped: boolean): string {
  const base = `/api/v2/incremental/tickets/cursor.json?start_time=${startTime}&per_page=1000`;
  return scoped ? `${base}&support_type_scope=ai_agent&include=metric_sets` : base;
}

export interface ReplyOrderResult {
  /** Tickets with an answer (true/false) so far in this session. */
  checked: number;
  /** Tickets whose comments were read so far, answered or not. */
  attempted: number;
  candidates: number;
  skipped: number;
}

export interface Fetcher {
  /** Fields, then the AI export, then the unscoped export. Resumes whatever is unfinished. */
  run(session: FetchSession, cb?: FetchCallbacks): Promise<MapInput>;
  /** Comment-order check for AI tickets with agent replies. Resumes via session.replyOrder. */
  checkReplyOrder(
    session: FetchSession,
    opts?: { cap?: number; token?: CancelToken; onProgress?: (p: FetchProgress) => void; onWait?: WaitCallback },
  ): Promise<ReplyOrderResult>;
  /** AI tickets in the period that have agent replies and no answer yet. */
  replyOrderCandidates(session: FetchSession): number[];
}

export function createFetcher(zaf: Zaf, rt: ZafRuntime = realRuntime): Fetcher {
  async function paceExport(session: FetchSession, hooks: RequestHooks): Promise<void> {
    if (session.lastExportAt !== null) {
      const wait = EXPORT_MIN_GAP_MS - (rt.now() - session.lastExportAt);
      if (wait > 0) await waitWithCountdown(wait / 1000, "pacing", hooks, rt);
    }
    session.lastExportAt = rt.now();
  }

  async function readFields(session: FetchSession, hooks: RequestHooks): Promise<void> {
    if (session.fields) return;
    const all: NonNullable<FieldsPage["ticket_fields"]> = [];
    let next: string | null = "/api/v2/ticket_fields.json";
    let guard = 0;
    while (next && guard++ < 50) {
      const page: FieldsPage = await zaf.get<FieldsPage>(next, hooks);
      all.push(...(page.ticket_fields ?? []));
      next = page.next_page ?? null;
    }
    session.fields = findResolutionFields(all);
  }

  async function readExport(
    session: FetchSession,
    state: ExportState,
    scoped: boolean,
    phase: Phase,
    cb: FetchCallbacks,
  ): Promise<void> {
    const hooks: RequestHooks = { token: cb.token, onWait: cb.onWait };
    const required: Record<string, string> = scoped
      ? { support_type_scope: "ai_agent", include: "metric_sets", per_page: "1000" }
      : { per_page: "1000" };
    if (!state.done) cb.onProgress?.({ phase, pages: state.pages, tickets: state.tickets.size });
    while (!state.done) {
      cb.token?.throwIfCancelled();
      const url = state.afterUrl ? ensureParams(state.afterUrl, required) : exportUrl(session.startTime, scoped);
      await paceExport(session, hooks);
      const page = await zaf.get<ExportPage>(url, hooks);
      const start = session.periodStart.getTime();
      const fields = session.fields ?? { tier: null, type: null };
      for (const t of page.tickets ?? []) {
        const created = Date.parse(t.created_at);
        if (!Number.isNaN(created) && created < start) {
          session.preDropped.add(t.id);
          continue;
        }
        const slim = slimTicket(t, fields);
        state.tickets.set(t.id, slim);
        if (slim.metric_set) state.metricSets.set(t.id, slim.metric_set);
      }
      for (const m of page.metric_sets ?? []) {
        if (typeof m.ticket_id === "number" && !session.preDropped.has(m.ticket_id)) {
          state.metricSets.set(m.ticket_id, slimMetric(m, m.ticket_id));
        }
      }
      state.pages += 1;
      // Advance the cursor only after the page is stored: a failure re-reads the same page.
      if (page.after_url) state.afterUrl = page.after_url;
      if (page.end_of_stream === true || !page.after_url) {
        state.done = true;
        if (scoped) session.aiDoneAt = rt.now();
      }
      cb.onProgress?.({ phase, pages: state.pages, tickets: state.tickets.size });
    }
  }

  async function run(session: FetchSession, cb: FetchCallbacks = {}): Promise<MapInput> {
    const hooks: RequestHooks = { token: cb.token, onWait: cb.onWait };
    if (!session.fields) {
      cb.onProgress?.({ phase: "fields", pages: 0, tickets: 0 });
      await readFields(session, hooks);
    }
    await readExport(session, session.ai, true, "ai", cb);
    await readExport(session, session.other, false, "other", cb);
    // The AI tickets are the audited snapshot: judge the window against the time they were read,
    // not against the end of the second export (which can be much later after a resume).
    session.fetchedAt = session.fetchedAt ?? new Date(session.aiDoneAt ?? rt.now());
    return buildInput(session);
  }

  function replyOrderCandidates(session: FetchSession): number[] {
    const start = session.periodStart.getTime();
    const out: number[] = [];
    for (const t of session.ai.tickets.values()) {
      if (t.status === "deleted") continue;
      const created = Date.parse(t.created_at);
      if (Number.isNaN(created) || created < start) continue;
      const m = session.ai.metricSets.get(t.id) ?? t.metric_set;
      if (!m || !(typeof m.replies === "number" && m.replies > 0)) continue;
      if (session.replyAttempted.has(t.id)) continue;
      out.push(t.id);
    }
    // Newest first: if the cap bites, the most recent conversations are checked.
    const created = (id: number) => Date.parse(session.ai.tickets.get(id)?.created_at ?? "") || 0;
    return out.sort((a, b) => created(b) - created(a));
  }

  async function checkReplyOrder(
    session: FetchSession,
    opts: { cap?: number; token?: CancelToken; onProgress?: (p: FetchProgress) => void; onWait?: WaitCallback } = {},
  ): Promise<ReplyOrderResult> {
    const cap = Math.max(1, Math.floor(opts.cap ?? DEFAULT_REPLY_ORDER_CAP));
    const hooks: RequestHooks = { token: opts.token, onWait: opts.onWait };
    const pending = replyOrderCandidates(session);
    const already = session.replyAttempted.size;
    const candidates = pending.length + already;
    const budget = Math.max(0, cap - already);
    const queue = pending.slice(0, budget);
    session.replyOrderSkipped = pending.length - queue.length;

    let done = 0;
    let pages = 0;
    const report = () => {
      // A request still in flight when Stop was pressed must not repaint the panel as running.
      if (opts.token?.cancelled) return;
      opts.onProgress?.({ phase: "comments", pages, tickets: done, done: done + already, total: queue.length + already });
    };
    report();

    let nextAt = 0;
    async function paced<T>(url: string): Promise<T> {
      const now = rt.now();
      const wait = nextAt - now;
      nextAt = Math.max(now, nextAt) + COMMENT_MIN_GAP_MS;
      if (wait > 0) await rt.sleep(wait, opts.token);
      return zaf.get<T>(url, hooks);
    }

    async function readComments(id: number): Promise<void> {
      // Candidates come from the AI-agent export, so the AI took part from the ticket's start.
      const aiStart = session.ai.tickets.get(id)?.created_at ?? null;
      const comments: ZComment[] = [];
      const users = new Map<number, ZUser>();
      let next: string | null = `/api/v2/tickets/${id}/comments.json?include=users&per_page=100`;
      let guard = 0;
      while (next && guard++ < 100) {
        let page: CommentsPage;
        try {
          page = await paced<CommentsPage>(next);
        } catch (e) {
          // A ticket deleted since the export has no comments: skip it, keep the run going.
          if (e instanceof ZendeskError && (e.status === 404 || e.status === 410)) {
            session.replyAttempted.add(id);
            done += 1;
            report();
            return;
          }
          throw e;
        }
        pages += 1;
        comments.push(...(page.comments ?? []));
        for (const u of page.users ?? []) users.set(u.id, u);
        next = page.next_page ?? null;
      }
      const verdict = replyAfterAi(comments, [...users.values()], aiStart, session.staffNames ?? undefined);
      if (verdict !== null) session.replyOrder[id] = verdict;
      session.replyAttempted.add(id);
      done += 1;
      report();
    }

    // Teammates' messaging replies exist only inside chat transcripts, by name: read the staff once.
    if (session.staffNames === null && queue.length > 0) {
      const names = new Set<string>();
      let next: string | null = "/api/v2/users.json?role[]=agent&role[]=admin&per_page=100";
      let guard = 0;
      while (next && guard++ < 50) {
        const page: UsersPage = await zaf.get<UsersPage>(next, hooks);
        for (const u of page.users ?? []) if (u.name) names.add(u.name.trim());
        next = page.next_page ?? null;
      }
      session.staffNames = names;
    }

    let cursor = 0;
    let failure: unknown = null;
    async function worker(): Promise<void> {
      while (failure === null) {
        const i = cursor++;
        if (i >= queue.length) return;
        try {
          // Inside the try, so a cancel ends this worker without rejecting Promise.all early:
          // the call returns only after the other worker's in-flight request has settled.
          opts.token?.throwIfCancelled();
          await readComments(queue[i]);
        } catch (e) {
          failure = failure ?? e;
          return;
        }
      }
    }
    await Promise.all(Array.from({ length: REPLY_ORDER_CONCURRENCY }, worker));
    if (failure !== null) throw failure;
    return {
      checked: Object.keys(session.replyOrder).length,
      attempted: session.replyAttempted.size,
      candidates,
      skipped: session.replyOrderSkipped,
    };
  }

  return { run, checkReplyOrder, replyOrderCandidates };
}

/** Snapshot of the session as the mapper's input. */
export function buildInput(
  session: FetchSession,
  extra: { billedIds?: number[] | null } = {},
): MapInput {
  const fetchedAt = session.fetchedAt ?? new Date();
  const metricSets = new Map<number, ZMetricSet>();
  for (const [id, m] of session.other.metricSets) metricSets.set(id, m);
  for (const [id, m] of session.ai.metricSets) metricSets.set(id, m);
  return {
    aiTickets: [...session.ai.tickets.values()],
    otherTickets: [...session.other.tickets.values()],
    metricSets: [...metricSets.values()],
    fields: session.fields ?? { tier: null, type: null },
    periodStart: session.periodStart.toISOString(),
    fetchedAt: fetchedAt.toISOString(),
    replyOrder: Object.keys(session.replyOrder).length > 0 ? { ...session.replyOrder } : undefined,
    billedIds: extra.billedIds ?? null,
    preDropped: session.preDropped.size,
  };
}
