import { beforeEach, describe, expect, it } from "vitest";
import { CONTRIBUTION_VENDORS, type Contribution } from "@/engine";
import vendorsJson from "../../../content/vendors.json";
import {
  MAX_PER_WINDOW,
  aggregateContributions,
  contributionSchema,
  quantile,
  rateLimited,
  resetRateLimit,
} from "../contribution";

const base: Contribution = {
  standardVersion: "0.1",
  preset: "intercom",
  vendor: "intercom",
  periodDays: 90,
  aiConversationsBucket: "1k-10k",
  billedRate: 0.6,
  strictRate: 0.4,
  phantomShareOfBilled: 0.3,
  windowDays: 7,
  byReasonShare: { human_handoff: 0.2, reopened: 0.1, repeat_contact: 0.5, negative_csat: 0.1, vendor_escalated: 0.1 },
};

describe("contributionSchema", () => {
  it("accepts a valid contribution", () => {
    expect(contributionSchema.safeParse(base).success).toBe(true);
  });
  it("rejects extra fields", () => {
    expect(contributionSchema.safeParse({ ...base, email: "a@b.c" }).success).toBe(false);
    expect(
      contributionSchema.safeParse({ ...base, byReasonShare: { ...base.byReasonShare, extra: 0.1 } }).success,
    ).toBe(false);
  });
  it("rejects out-of-range values and bad buckets", () => {
    expect(contributionSchema.safeParse({ ...base, strictRate: 1.2 }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, billedRate: -0.1 }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, windowDays: 0 }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, aiConversationsBucket: "5" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, preset: "other" }).success).toBe(false);
  });
  it("rejects free text in vendor: only the fixed list is accepted", () => {
    expect(contributionSchema.safeParse({ ...base, vendor: "<script>alert(1)</script>" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, vendor: "Acme Corp" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, vendor: "Zendesk's" }).success).toBe(false);
    expect(contributionSchema.safeParse({ ...base, vendor: "other" }).success).toBe(true);
    expect(contributionSchema.safeParse({ ...base, vendor: "help-scout" }).success).toBe(true);
  });
  it("keeps the vendor list in step with content/vendors.json", () => {
    const slugs = (vendorsJson as { slug: string }[]).map((v) => v.slug).sort();
    expect([...CONTRIBUTION_VENDORS].filter((v) => v !== "other").sort()).toEqual(slugs);
  });
});

describe("rateLimited", () => {
  beforeEach(() => resetRateLimit());
  it("allows 5 per hour then blocks, then recovers", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < MAX_PER_WINDOW; i++) expect(rateLimited("k", t0 + i)).toBe(false);
    expect(rateLimited("k", t0 + 10)).toBe(true);
    expect(rateLimited("other", t0 + 10)).toBe(false);
    expect(rateLimited("k", t0 + 60 * 60 * 1000 + 100)).toBe(false);
  });
});

describe("aggregateContributions", () => {
  it("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
  });
  it("hides rates below n=30 and shows them at n=30", () => {
    const mk = (i: number): Contribution => ({ ...base, strictRate: i / 100, billedRate: 0.5 });
    const below = aggregateContributions(Array.from({ length: 29 }, (_, i) => mk(i)));
    const row29 = below.find((r) => r.vendor === "intercom")!;
    expect(row29).toEqual({ vendor: "intercom", n: 29 });
    const at = aggregateContributions(Array.from({ length: 30 }, (_, i) => mk(i)));
    const row30 = at.find((r) => r.vendor === "intercom")!;
    expect(row30.n).toBe(30);
    expect(row30.medianStrictRate).toBeCloseTo(0.145, 5);
    expect(row30.medianBilledRate).toBe(0.5);
    expect(row30.strictIqr![0]).toBeLessThan(row30.strictIqr![1]);
    expect(at.find((r) => r.vendor === "zendesk")).toEqual({ vendor: "zendesk", n: 0 });
  });
  it("groups by vendor, not by preset (review M1)", () => {
    // Thirty generic-preset exports from thirty different vendors must not form one "vendor".
    const items: Contribution[] = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      preset: "generic",
      vendor: i % 2 === 0 ? "hubspot" : "front",
    }));
    const rows = aggregateContributions(items);
    expect(rows.find((r) => r.vendor === "hubspot")).toEqual({ vendor: "hubspot", n: 15 });
    expect(rows.find((r) => r.vendor === "front")).toEqual({ vendor: "front", n: 15 });
  });
  it("pools only contributions made with the default 7-day window (review M1)", () => {
    const items: Contribution[] = [
      ...Array.from({ length: 30 }, () => ({ ...base, windowDays: 7, strictRate: 0.4 })),
      ...Array.from({ length: 10 }, () => ({ ...base, windowDays: 30, strictRate: 0.9 })),
    ];
    const row = aggregateContributions(items).find((r) => r.vendor === "intercom")!;
    expect(row.n).toBe(30);
    expect(row.medianStrictRate).toBeCloseTo(0.4, 10);
  });
});
