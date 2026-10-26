// Server-side contribution schema, aggregation and rate limiting.
// Server only: imports nothing from React or the browser. See docs/SPEC.md "Contribution API".
import { z } from "zod";
import { CONTRIBUTION_VENDORS, STANDARD_VERSIONS, type Contribution, type ContributionVendor } from "@/engine";

export const CONTRIBUTION_PREFIX = "contributions/";
export const BENCHMARK_MIN_N = 30;

const rate = z.number().finite().min(0).max(1);

// Strict: unknown keys are rejected, so nothing can be smuggled into the store.
export const contributionSchema = z.strictObject({
  // Old stored contributions (0.1) stay valid. 0.2 differs from 0.1 only when an action receipt column was mapped.
  standardVersion: z.enum(STANDARD_VERSIONS),
  preset: z.enum(["intercom", "zendesk", "ada", "gorgias", "generic"]),
  // A closed list (the slugs in content/vendors.json plus "other"), never free text.
  vendor: z.enum(CONTRIBUTION_VENDORS),
  periodDays: z.number().int().min(1).max(3650),
  aiConversationsBucket: z.enum(["<1k", "1k-10k", "10k-100k", ">100k"]),
  billedRate: rate,
  strictRate: rate,
  phantomShareOfBilled: rate,
  windowDays: z.number().int().min(1).max(365),
  byReasonShare: z.strictObject({
    human_handoff: rate,
    reopened: rate,
    repeat_contact: rate,
    negative_csat: rate,
    vendor_escalated: rate,
  }),
}) satisfies z.ZodType<Contribution>;

// ---------- rate limit (per hashed IP, in memory, best effort) ----------

const WINDOW_MS = 60 * 60 * 1000;
export const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

/** Returns true when the caller is over the limit. Records the hit otherwise. */
export function rateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

export function resetRateLimit() {
  hits.clear();
}

// ---------- benchmark aggregation ----------

/** Only contributions made with the default 7-day window are compared; others are stored but not pooled. */
export const BENCHMARK_WINDOW_DAYS = 7;

export interface BenchmarkAggregate {
  vendor: ContributionVendor;
  n: number;
  medianBilledRate?: number;
  medianStrictRate?: number;
  strictIqr?: [number, number];
}

/** Linear-interpolated quantile of a numeric list (q in 0..1). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Aggregates per vendor over contributions that used the same window (7 days). Rates are included
 * only when n >= minN (the n>=30 rule). The `other` group lumps unlisted vendors together.
 */
export function aggregateContributions(
  items: Contribution[],
  minN = BENCHMARK_MIN_N,
): BenchmarkAggregate[] {
  const comparable = items.filter((c) => c.windowDays === BENCHMARK_WINDOW_DAYS);
  return CONTRIBUTION_VENDORS.map((vendor) => {
    const group = comparable.filter((c) => c.vendor === vendor);
    const n = group.length;
    if (n < minN) return { vendor, n };
    return {
      vendor,
      n,
      medianBilledRate: quantile(group.map((c) => c.billedRate), 0.5),
      medianStrictRate: quantile(group.map((c) => c.strictRate), 0.5),
      strictIqr: [
        quantile(group.map((c) => c.strictRate), 0.25),
        quantile(group.map((c) => c.strictRate), 0.75),
      ] as [number, number],
    };
  });
}
