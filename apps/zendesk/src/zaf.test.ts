import { describe, expect, it } from "vitest";
import { CancelToken, ZendeskError, createZaf, toRelative, type WaitInfo, type ZafClient, type ZafRuntime } from "./zaf";

/** Virtual clock: sleep advances time instantly. */
function fakeRuntime() {
  let t = 0;
  const sleeps: number[] = [];
  const rt: ZafRuntime = {
    now: () => t,
    sleep: async (ms, token) => {
      token?.throwIfCancelled();
      sleeps.push(ms);
      t += ms;
    },
  };
  return { rt, sleeps, clock: () => t };
}

type Step = { ok: unknown } | { reject: unknown };

function clientFrom(steps: Step[]): ZafClient & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  let i = 0;
  return {
    calls,
    request: async (opts) => {
      calls.push(opts);
      const step = steps[Math.min(i++, steps.length - 1)];
      if ("reject" in step) throw step.reject;
      return step.ok;
    },
  };
}

const ok = (json: unknown): Step => ({ ok: { status: 200, responseJSON: json, headers: {} } });
const fail = (status: number, headers: Record<string, string> = {}): Step => ({
  reject: { status, responseJSON: { error: "x" }, headers },
});

describe("toRelative", () => {
  it("reduces a Zendesk URL to path and query", () => {
    expect(toRelative("https://a.zendesk.com/api/v2/x.json?cursor=1")).toBe("/api/v2/x.json?cursor=1");
    expect(toRelative("/api/v2/y.json")).toBe("/api/v2/y.json");
  });
});

describe("zaf.get", () => {
  it("requests with the complete-response options and returns the JSON", async () => {
    const c = clientFrom([ok({ a: 1 })]);
    const { rt } = fakeRuntime();
    const out = await createZaf(c, rt).get<{ a: number }>("https://a.zendesk.com/api/v2/z.json");
    expect(out.a).toBe(1);
    expect(c.calls[0]).toMatchObject({
      url: "/api/v2/z.json",
      type: "GET",
      httpCompleteResponse: true,
      autoRetry: false,
      dataType: "json",
    });
  });

  it("waits Retry-After on 429 and reports the countdown", async () => {
    const c = clientFrom([fail(429, { "retry-after": "5" }), ok({ ok: true })]);
    const { rt, clock } = fakeRuntime();
    const waits: (WaitInfo | null)[] = [];
    const out = await createZaf(c, rt).get<{ ok: boolean }>("/x", { onWait: (w) => waits.push(w) });
    expect(out.ok).toBe(true);
    expect(clock()).toBe(5000);
    expect(waits[0]).toEqual({ reason: "rate_limit", secondsLeft: 5 });
    expect(waits[waits.length - 1]).toBeNull();
  });

  it("falls back to 60 s when Retry-After is missing and gives up after 6 rate limits", async () => {
    const c = clientFrom([fail(429)]);
    const { rt, clock } = fakeRuntime();
    await expect(createZaf(c, rt).get("/x")).rejects.toMatchObject({ kind: "rate_limit", status: 429 });
    expect(c.calls).toHaveLength(7);
    expect(clock()).toBe(6 * 60_000);
  });

  it("backs off 2, 4, 8 seconds on 5xx and then fails", async () => {
    const c = clientFrom([fail(503)]);
    const { rt, clock } = fakeRuntime();
    await expect(createZaf(c, rt).get("/x")).rejects.toMatchObject({ kind: "server", status: 503 });
    expect(c.calls).toHaveLength(4);
    expect(clock()).toBe(14_000);
  });

  it("retries network errors, then succeeds", async () => {
    const c = clientFrom([{ reject: new Error("offline") }, ok({ v: 2 })]);
    const { rt } = fakeRuntime();
    expect((await createZaf(c, rt).get<{ v: number }>("/x")).v).toBe(2);
  });

  it("throws typed errors for 403, 401 and 404 without retrying", async () => {
    const { rt } = fakeRuntime();
    for (const [status, kind] of [
      [403, "forbidden"],
      [401, "unauthorized"],
      [404, "http"],
    ] as const) {
      const c = clientFrom([fail(status)]);
      const err = await createZaf(c, rt)
        .get("/x")
        .catch((e) => e);
      expect(err).toBeInstanceOf(ZendeskError);
      expect(err).toMatchObject({ kind, status });
      expect(c.calls).toHaveLength(1);
    }
  });

  it("stops when cancelled, before a request and during a wait", async () => {
    const { rt } = fakeRuntime();
    const t1 = new CancelToken();
    t1.cancel();
    await expect(createZaf(clientFrom([ok({})]), rt).get("/x", { token: t1 })).rejects.toMatchObject({
      kind: "cancelled",
    });

    const t2 = new CancelToken();
    const c = clientFrom([fail(429, { "retry-after": "30" }), ok({})]);
    const rt2: ZafRuntime = {
      now: rt.now,
      sleep: async () => {
        t2.cancel();
      },
    };
    await expect(createZaf(c, rt2).get("/x", { token: t2 })).rejects.toMatchObject({ kind: "cancelled" });
    expect(c.calls).toHaveLength(1);
  });
});
