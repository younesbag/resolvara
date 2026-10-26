import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_BATCH,
  MAX_EVENTS_PER_WINDOW,
  batchSchema,
  eventRateLimited,
  resetEventRateLimit,
  sizeBucket,
} from "../events";

const ok = { name: "audit_done", ref: "kalshi", vid: "6f1c1e2a-3b4d-4c5e-8f90-a1b2c3d4e5f6", path: "/", props: { preset: "intercom", sample: false, size: "1k-10k" } };

describe("batchSchema", () => {
  it("accepts a batch of known events", () => {
    expect(batchSchema.safeParse({ events: [ok, { name: "visit" }] }).success).toBe(true);
  });

  it("rejects unknown names, extra fields and file-like data", () => {
    expect(batchSchema.safeParse({ events: [{ name: "upload" }] }).success).toBe(false);
    expect(batchSchema.safeParse({ events: [{ ...ok, fileName: "export.csv" }] }).success).toBe(false);
    expect(batchSchema.safeParse({ events: [{ ...ok, props: { rows: 1234 } }] }).success).toBe(false);
    expect(batchSchema.safeParse({ events: [ok], extra: 1 }).success).toBe(false);
  });

  it("only accepts slug refs and plain paths", () => {
    expect(batchSchema.safeParse({ events: [{ ...ok, ref: "Kalshi Inc" }] }).success).toBe(false);
    expect(batchSchema.safeParse({ events: [{ ...ok, path: "/?q=secret" }] }).success).toBe(false);
  });

  it("bounds the batch size", () => {
    expect(batchSchema.safeParse({ events: [] }).success).toBe(false);
    expect(batchSchema.safeParse({ events: Array(MAX_BATCH + 1).fill(ok) }).success).toBe(false);
  });
});

describe("sizeBucket", () => {
  it("puts counts in coarse ranges", () => {
    expect(sizeBucket(0)).toBe("<1k");
    expect(sizeBucket(999)).toBe("<1k");
    expect(sizeBucket(1000)).toBe("1k-10k");
    expect(sizeBucket(99999)).toBe("10k-100k");
    expect(sizeBucket(100000)).toBe(">100k");
  });
});

describe("eventRateLimited", () => {
  beforeEach(() => resetEventRateLimit());

  it("allows up to the limit per hour, then refuses", () => {
    for (let i = 0; i < MAX_EVENTS_PER_WINDOW; i++) expect(eventRateLimited("k", 0)).toBe(false);
    expect(eventRateLimited("k", 0)).toBe(true);
    expect(eventRateLimited("k", 60 * 60 * 1000 + 1)).toBe(false);
  });
});
