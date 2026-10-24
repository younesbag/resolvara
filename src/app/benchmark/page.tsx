import type { Metadata } from "next";
import Link from "next/link";
import { pct } from "@/components/auditor/format";
import { PRESET_OPTIONS } from "@/components/auditor/meta";
import { BENCHMARK_MIN_N, loadBenchmark } from "@/components/lib/benchmark";
import { PageShell } from "@/components/page-shell";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Community benchmark",
  description:
    "Opt-in, anonymous aggregates of strict resolution rates by helpdesk. Nothing is shown until 30 contributions are in.",
  alternates: { canonical: "/benchmark" },
};

export default async function BenchmarkPage() {
  const rows = await loadBenchmark();
  const byPreset = new Map((rows ?? []).map((r) => [r.preset, r]));

  return (
    <PageShell
      wide
      title="Community benchmark"
      intro={
        <p>
          People who run an audit can contribute the rates, and only the rates. A group appears here
          once {BENCHMARK_MIN_N} contributions are in, so no single company can be picked out.
        </p>
      }
    >
      <ul className="divide-y divide-line border-y border-line">
        {PRESET_OPTIONS.map((p) => {
          const row = byPreset.get(p.value);
          const n = row?.n ?? 0;
          const open = n >= BENCHMARK_MIN_N;
          return (
            <li
              key={p.value}
              className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-3 py-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:items-center"
            >
              <h2 className="text-lg font-semibold tracking-tight">{p.label}</h2>
              {open && row ? (
                <dl className="grid grid-cols-3 gap-4">
                  <div>
                    <dt className="text-sm text-ink-3">Contributions</dt>
                    <dd className="num mt-1 text-xl font-semibold">{n}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-3">Median billed</dt>
                    <dd className="num mt-1 text-xl font-semibold">{pct(row.medianBilledRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-ink-3">Median strict</dt>
                    <dd className="num mt-1 text-xl font-semibold text-pass">{pct(row.medianStrictRate)}</dd>
                    {row.strictIqr && (
                      <dd className="num mt-0.5 text-xs text-ink-3">
                        middle half {pct(row.strictIqr[0], 0)} to {pct(row.strictIqr[1], 0)}
                      </dd>
                    )}
                  </div>
                </dl>
              ) : (
                <div>
                  <p className="text-ink">
                    <span className="stamp stamp-muted">Collecting</span>{" "}
                    <span className="num ml-2 text-sm">
                      {n} of {BENCHMARK_MIN_N} contributions so far
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-ink-3">Rates stay hidden below {BENCHMARK_MIN_N}.</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-14 grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="text-xl font-semibold tracking-tight">What is collected</h2>
          <p className="mt-3 text-ink-2">
            One record per contribution: the helpdesk, the period length, a size bucket, the billed
            rate, the strict rate, the phantom share, the window and the share of each fail reason. No
            conversation IDs, no customer data, no text. You see the exact JSON before it is sent.
          </p>
          <Link href="/privacy" className="mt-3 inline-block py-1 text-sm font-medium underline underline-offset-4">
            Read the privacy details
          </Link>
        </section>
        <section>
          <h2 className="text-xl font-semibold tracking-tight">How to read it</h2>
          <p className="mt-3 text-ink-2">
            Medians and the middle half of contributions, per helpdesk. These are self-selected, so they
            describe the people who chose to contribute, not every customer of a vendor. Methods and
            limits are in the Standard. A vendor that disagrees with a figure can say so on the
            project&apos;s issue tracker and the response will be linked here.
          </p>
          <Link href="/standard" className="mt-3 inline-block py-1 text-sm font-medium underline underline-offset-4">
            Read the Standard
          </Link>
        </section>
      </div>
    </PageShell>
  );
}
