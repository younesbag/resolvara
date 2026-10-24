// Server-side loader for the community benchmark.
//
// INTEGRATION POINT: the contribution store (Vercel Blob, see docs/SPEC.md "Contribution API")
// is owned by the integration step. Until it exists, this returns null and /benchmark
// shows the "collecting" state. Replace the body of loadBenchmark() with the real
// aggregation and keep the BenchmarkRow shape: the page only renders these fields and
// only shows rates when n >= BENCHMARK_MIN_N.
import type { Preset } from "@/engine";

export const BENCHMARK_MIN_N = 30;

export interface BenchmarkRow {
  preset: Preset;
  n: number;
  medianBilledRate?: number; // 0..1
  medianStrictRate?: number; // 0..1
  strictIqr?: [number, number]; // 25th and 75th percentile, 0..1
}

export async function loadBenchmark(): Promise<BenchmarkRow[] | null> {
  return null;
}
