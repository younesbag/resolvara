// Server-side loader for the community benchmark: lists the private contribution
// blobs, validates each one against the contribution schema, and aggregates per
// vendor (7-day window only). Rates are only returned for a vendor once n >= BENCHMARK_MIN_N.
// Without BLOB_READ_WRITE_TOKEN (or on any storage error) it returns null and
// /benchmark shows the "collecting" state.
import { get, list } from "@vercel/blob";
import type { Contribution, ContributionVendor } from "@/engine";
import {
  BENCHMARK_MIN_N,
  CONTRIBUTION_PREFIX,
  aggregateContributions,
  contributionSchema,
} from "@/server/contribution";

export { BENCHMARK_MIN_N };

export interface BenchmarkRow {
  vendor: ContributionVendor;
  n: number;
  medianBilledRate?: number; // 0..1
  medianStrictRate?: number; // 0..1
  strictIqr?: [number, number]; // 25th and 75th percentile, 0..1
}

// Keep the newest MAX_BLOBS contributions. Names start with the UTC day, so listing order is oldest first.
const MAX_BLOBS = 5000;
const MAX_LISTED = 50000;
const CONCURRENCY = 20;

async function readOne(pathname: string, token: string): Promise<Contribution | null> {
  try {
    const res = await get(pathname, { access: "private", token });
    if (!res || res.statusCode !== 200) return null;
    const text = await new Response(res.stream).text();
    const parsed = contributionSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function loadBenchmark(): Promise<BenchmarkRow[] | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const paths: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: CONTRIBUTION_PREFIX, limit: 1000, cursor, token });
      for (const b of page.blobs) paths.push(b.pathname);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor && paths.length < MAX_LISTED);
    if (paths.length > MAX_BLOBS) paths.splice(0, paths.length - MAX_BLOBS);

    const items: Contribution[] = [];
    for (let i = 0; i < paths.length; i += CONCURRENCY) {
      const batch = await Promise.all(paths.slice(i, i + CONCURRENCY).map((p) => readOne(p, token)));
      for (const c of batch) if (c) items.push(c);
    }
    return aggregateContributions(items);
  } catch {
    return null;
  }
}
