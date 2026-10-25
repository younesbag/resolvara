import { describe, expect, it } from "vitest";
import { COMMENT_MIN_GAP_MS, EXPORT_MIN_GAP_MS, buildInput, createFetcher, createSession, ensureParams } from "./fetcher";
import type { ZTicket } from "./types";
import { CancelToken, ZendeskError, type Zaf, type ZafRuntime } from "./zaf";

function fakeRuntime(): ZafRuntime {
  let t = 1_000_000;
  return {
    now: () => t,
    sleep: async (ms, token) => {
      token?.throwIfCancelled();
      t += ms;
    },
  };
}

const T0 = "2026-10-01T00:00:00Z";
const ticket = (id: number, extra: Partial<ZTicket> = {}): ZTicket => ({
  id,
  created_at: T0,
  requester_id: id,
  ...extra,
});

/** A Zaf fake that serves paths from a handler and records them with the virtual time. */
function fakeZaf(rt: ZafRuntime, handler: (path: string) => unknown) {
  const calls: { path: string; at: number }[] = [];
  const zaf: Zaf = {
    get: async <T,>(path: string) => {
      calls.push({ path, at: rt.now() });
      const out = handler(path);
      if (out instanceof Error) throw out;
      return out as T;
    },
  };
  return { zaf, calls };
}

const CURSOR = "https://a.zendesk.com/api/v2/incremental/tickets/cursor.json?cursor=";

describe("ensureParams", () => {
  it("keeps existing params and adds missing ones", () => {
    const u = ensureParams(`${CURSOR}abc&per_page=1000`, { support_type_scope: "ai_agent", per_page: "1000" });
    expect(u).toContain("cursor=abc");
    expect(u).toContain("support_type_scope=ai_agent");
    expect(u.match(/per_page/g)).toHaveLength(1);
    expect(u.startsWith("/api/v2/incremental")).toBe(true);
  });
});

describe("fetcher.run", () => {
  function setup(opts: { failOtherOnce?: boolean } = {}) {
    const rt = fakeRuntime();
    let otherFailed = false;
    const { zaf, calls } = fakeZaf(rt, (path) => {
      if (path.startsWith("/api/v2/ticket_fields")) {
        return {
          ticket_fields: [
            { id: 11, key: "standard::resolution_tier" },
            { id: 12, key: "standard::resolution_type" },
          ],
          next_page: null,
        };
      }
      const scoped = path.includes("support_type_scope=ai_agent");
      if (scoped) {
        if (!path.includes("cursor=")) {
          return {
            tickets: [ticket(1), ticket(2, { metric_set: { replies: 1 } })],
            metric_sets: [{ ticket_id: 1, replies: 2 }],
            after_url: `${CURSOR}a2`,
            end_of_stream: false,
          };
        }
        return { tickets: [ticket(3)], metric_sets: [], after_url: `${CURSOR}a3`, end_of_stream: true };
      }
      if (opts.failOtherOnce && !otherFailed) {
        otherFailed = true;
        return new ZendeskError("server", "boom", 500);
      }
      return { tickets: [ticket(9)], after_url: `${CURSOR}b2`, end_of_stream: true };
    });
    return { rt, zaf, calls };
  }

  it("reads fields, the AI export (with metric sets) and the unscoped export, pacing the export calls", async () => {
    const { rt, zaf, calls } = setup();
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    const input = await createFetcher(zaf, rt).run(session);

    expect(input.fields).toEqual({ tier: 11, type: 12 });
    expect(input.aiTickets.map((t) => t.id).sort()).toEqual([1, 2, 3]);
    expect(input.otherTickets.map((t) => t.id)).toEqual([9]);
    // sideloaded and inlined metric sets are both collected
    expect(input.metricSets.map((m) => m.ticket_id).sort()).toEqual([1, 2]);
    expect(calls[1].path).toContain("support_type_scope=ai_agent&include=metric_sets");
    expect(calls[1].path).toContain(`start_time=${Math.floor(Date.parse("2026-09-24T00:00:00Z") / 1000)}`);
    expect(calls[2].path).toContain("cursor=a2");
    expect(calls[2].path).toContain("include=metric_sets"); // scoping survives the cursor URL
    const exportCalls = calls.filter((c) => c.path.includes("incremental"));
    expect(exportCalls).toHaveLength(3);
    for (let i = 1; i < exportCalls.length; i++) {
      expect(exportCalls[i].at - exportCalls[i - 1].at).toBeGreaterThanOrEqual(EXPORT_MIN_GAP_MS);
    }
  });

  it("keeps collected rows and resumes from the last cursor after a failure", async () => {
    const { rt, zaf, calls } = setup({ failOtherOnce: true });
    const fetcher = createFetcher(zaf, rt);
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    await expect(fetcher.run(session)).rejects.toBeInstanceOf(ZendeskError);
    expect(session.ai.done).toBe(true);
    const before = calls.length;
    const input = await fetcher.run(session);
    expect(input.otherTickets.map((t) => t.id)).toEqual([9]);
    // fields and the AI export were not read again
    expect(calls.slice(before).some((c) => c.path.includes("support_type_scope"))).toBe(false);
    expect(calls.slice(before).some((c) => c.path.startsWith("/api/v2/ticket_fields"))).toBe(false);
  });

  it("stops between pages when cancelled", async () => {
    const { rt, zaf } = setup();
    const token = new CancelToken();
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    const p = createFetcher(zaf, rt).run(session, {
      token,
      onProgress: (pr) => {
        if (pr.phase === "ai" && pr.pages === 1) token.cancel();
      },
    });
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
    expect(session.ai.tickets.size).toBe(2);
    expect(session.ai.done).toBe(false);
  });
});

describe("fetcher.checkReplyOrder", () => {
  function setup() {
    const rt = fakeRuntime();
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    for (let id = 1; id <= 5; id++) {
      session.ai.tickets.set(id, ticket(id, { created_at: `2026-10-0${id}T00:00:00Z`, requester_id: 100 }));
      session.ai.metricSets.set(id, { ticket_id: id, replies: id === 5 ? 0 : 1 });
    }
    const { zaf, calls } = fakeZaf(rt, (path) => {
      const id = Number(path.split("/")[4]);
      if (id === 3) return new ZendeskError("http", "gone", 404);
      const t0 = Date.parse("2026-10-01T00:00:00Z");
      return {
        comments: [
          { id: 1, author_id: 100, public: true, created_at: new Date(t0).toISOString() },
          {
            id: 2,
            author_id: 7,
            public: true,
            created_at: new Date(t0 + 1000).toISOString(),
            via: { channel: "ai_agent" },
          },
          ...(id % 2 === 0
            ? [{ id: 3, author_id: 8, public: true, created_at: new Date(t0 + 9000).toISOString() }]
            : []),
        ],
        users: [
          { id: 100, role: "end-user" },
          { id: 7, role: "end-user" },
          { id: 8, role: "agent" },
        ],
        next_page: null,
      };
    });
    return { rt, zaf, calls, session };
  }

  it("checks only AI tickets with replies, skips 404s, and records the order", async () => {
    const { rt, zaf, session } = setup();
    const f = createFetcher(zaf, rt);
    expect(f.replyOrderCandidates(session).sort()).toEqual([1, 2, 3, 4]);
    const r = await f.checkReplyOrder(session);
    expect(r).toMatchObject({ candidates: 4, skipped: 0 });
    expect(session.replyOrder).toEqual({ 1: false, 2: true, 4: true });
    expect(buildInput(session).replyOrder).toEqual({ 1: false, 2: true, 4: true });
  });

  it("honours the cap, newest first, and reports what it skipped", async () => {
    const { rt, zaf, session } = setup();
    const f = createFetcher(zaf, rt);
    const r = await f.checkReplyOrder(session, { cap: 2 });
    expect(r.skipped).toBe(2);
    // newest first: tickets 4 and 3 (3 is a 404, so only 4 answered)
    expect(session.replyOrder).toEqual({ 4: true });
  });
});

describe("review fixes", () => {
  it("slims tickets on arrival and drops tickets created before the period (finding 1)", async () => {
    const rt = fakeRuntime();
    const big = {
      ...ticket(1, { created_at: "2026-10-02T00:00:00Z", subject: "x".repeat(500), tags: ["vip", "ai_agent_automated_resolution"] }),
      description: "y".repeat(5000),
      fields: [{ id: 11, value: "zd_resolution_tier_core_resolution" }],
      custom_fields: [
        { id: 11, value: "zd_resolution_tier_core_resolution" },
        { id: 99, value: "secret" },
      ],
      via: { channel: "web", source: { from: { address: "a@b.c" }, rel: null } },
    } as unknown as ZTicket;
    const old = ticket(2, { created_at: "2026-01-01T00:00:00Z" });
    const { zaf } = fakeZaf(rt, (path) => {
      if (path.startsWith("/api/v2/ticket_fields")) return { ticket_fields: [{ id: 11, key: "standard::resolution_tier" }] };
      if (path.includes("support_type_scope")) return { tickets: [big, old], metric_sets: [{ ticket_id: 2, replies: 1 }], end_of_stream: true };
      return { tickets: [old], end_of_stream: true };
    });
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    const input = await createFetcher(zaf, rt).run(session);
    const t = input.aiTickets[0] as unknown as Record<string, unknown>;
    expect(input.aiTickets.map((x) => x.id)).toEqual([1]);
    expect(input.otherTickets).toEqual([]);
    expect(input.preDropped).toBe(1); // counted once although both exports returned it
    expect(input.metricSets).toEqual([]);
    expect(t.description).toBeUndefined();
    expect(t.fields).toBeUndefined();
    expect(t.custom_fields).toEqual([{ id: 11, value: "zd_resolution_tier_core_resolution" }]);
    expect(t.tags).toEqual(["ai_agent_automated_resolution"]);
    expect(t.via).toEqual({ channel: "web" });
    expect((t.subject as string).length).toBe(200);
  });

  it("uses the end of the AI export as the snapshot time (finding 10)", async () => {
    const rt = fakeRuntime();
    let aiEnd = 0;
    const { zaf } = fakeZaf(rt, (path) => {
      if (path.startsWith("/api/v2/ticket_fields")) return { ticket_fields: [] };
      if (path.includes("support_type_scope")) {
        aiEnd = rt.now();
        return { tickets: [ticket(1)], end_of_stream: true };
      }
      return { tickets: [ticket(9)], end_of_stream: true };
    });
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    const input = await createFetcher(zaf, rt).run(session);
    expect(Date.parse(input.fetchedAt)).toBe(aiEnd);
    expect(input.fields).toEqual({ tier: null, type: null });
  });
});

describe("reply-order review fixes", () => {
  function setup(verdictFor: (id: number) => "marked" | "gone") {
    const rt = fakeRuntime();
    const session = createSession(new Date("2026-09-24T00:00:00Z"));
    for (let id = 1; id <= 4; id++) {
      session.ai.tickets.set(id, ticket(id, { created_at: `2026-10-0${id}T00:00:00Z` }));
      session.ai.metricSets.set(id, { ticket_id: id, replies: 1 });
    }
    const { zaf, calls } = fakeZaf(rt, (path) => {
      const id = Number(path.split("/")[4]);
      if (verdictFor(id) === "gone") return new ZendeskError("http", "gone", 404);
      return {
        comments: [
          { id: 1, author_id: 7, public: true, created_at: "2026-10-01T00:00:00Z", via: { channel: "ai_agent" } },
          { id: 2, author_id: 8, public: true, created_at: "2026-10-01T01:00:00Z" },
        ],
        users: [{ id: 7, role: "end-user" }, { id: 8, role: "agent" }],
      };
    });
    return { rt, zaf, calls, session };
  }

  it("never re-reads a ticket without an answer (here: deleted, 404), and counts it in the cap (finding 5)", async () => {
    const { rt, zaf, calls, session } = setup((id) => (id % 2 ? "gone" : "marked"));
    const f = createFetcher(zaf, rt);
    const r1 = await f.checkReplyOrder(session, { cap: 2 });
    expect(r1).toMatchObject({ attempted: 2, checked: 1, candidates: 4, skipped: 2 });
    expect(f.replyOrderCandidates(session).sort()).toEqual([1, 2]);
    const r2 = await f.checkReplyOrder(session, { cap: 10 });
    expect(r2).toMatchObject({ attempted: 4, checked: 2, skipped: 0 });
    expect(calls).toHaveLength(4); // each ticket read exactly once across both runs
    expect(f.replyOrderCandidates(session)).toEqual([]);
  });

  it("paces comment reads", async () => {
    const { rt, zaf, calls, session } = setup(() => "marked");
    await createFetcher(zaf, rt).checkReplyOrder(session);
    const at = calls.map((c) => c.at).sort((a, b) => a - b);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(COMMENT_MIN_GAP_MS);
  });

  it("after Stop, no progress is reported and the call settles without rejecting early (finding 4)", async () => {
    const { rt, zaf, session } = setup(() => "marked");
    const token = new CancelToken();
    const progress: number[] = [];
    const p = createFetcher(zaf, rt).checkReplyOrder(session, {
      token,
      onProgress: (pr) => {
        progress.push(pr.done ?? 0);
        if ((pr.done ?? 0) >= 1) token.cancel();
      },
    });
    await expect(p).rejects.toMatchObject({ kind: "cancelled" });
    const after = progress.length;
    await new Promise((r) => setTimeout(r, 0));
    expect(progress.length).toBe(after);
    expect(progress.at(-1)).toBe(1);
  });
});
