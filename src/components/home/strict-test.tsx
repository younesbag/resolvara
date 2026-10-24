import Link from "next/link";

export function StrictTest() {
  return (
    <section
      aria-labelledby="strict-h"
      className="border-t border-line bg-surface-2"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
        <h2 id="strict-h" className="max-w-[22ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
          Five things that fail a billed resolution.
        </h2>
        <p className="mt-4 max-w-[60ch] text-ink-2">
          A conversation passes when none of them show up inside your window. The default window is
          seven days, and you can change it.
        </p>

        <div className="mt-12 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-6">
          <article className="flex flex-col justify-between gap-10 rounded-[var(--radius)] bg-accent-soft p-6 sm:p-8 lg:col-span-4">
            <div>
              <h3 className="text-xl font-semibold tracking-tight text-accent-ink">The customer came back</h3>
              <p className="mt-3 max-w-[48ch] text-accent-ink">
                The same customer opened another conversation inside the window. The evidence names that
                conversation and the gap in days. An optional same-topic filter cuts false positives.
              </p>
            </div>
            <p className="num-lg text-6xl font-semibold leading-none text-accent sm:text-7xl">
              7<span className="ml-1 text-3xl sm:text-4xl">days</span>
            </p>
          </article>

          <article className="flex flex-col justify-between gap-8 rounded-[var(--radius)] border border-line bg-surface p-6 sm:p-8 lg:col-span-2">
            <div>
              <h3 className="text-xl font-semibold tracking-tight">A human stepped in</h3>
              <p className="mt-3 text-ink-2">
                A person replied after the AI. The Standard counts it even where the vendor does not.
              </p>
            </div>
            <p>
              <span className="stamp stamp-phantom text-base">Phantom</span>
            </p>
          </article>

          <article className="rounded-[var(--radius)] border border-line bg-surface p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold tracking-tight">It was reopened</h3>
            <p className="mt-2 text-sm text-ink-2">The reopen count is above zero, or timestamps show it reopened in the window.</p>
          </article>

          <article className="rounded-[var(--radius)] border border-line bg-surface p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold tracking-tight">The rating was low</h3>
            <p className="mt-2 text-sm text-ink-2">
              CSAT below 0.4 on a 0 to 1 scale. A 1 to 5 rating of 2 counts as 0.25.
            </p>
          </article>

          <article className="rounded-[var(--radius)] border border-line bg-surface p-6 lg:col-span-2">
            <h3 className="text-lg font-semibold tracking-tight">The vendor escalated it</h3>
            <p className="mt-2 text-sm text-ink-2">
              The vendor&apos;s own state says escalated, handed off or negative feedback.
            </p>
          </article>
        </div>

        <p className="mt-8">
          <Link
            href="/standard"
            className="inline-block py-1 text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Read the full Standard, including edge cases and limits
          </Link>
        </p>
      </div>
    </section>
  );
}
