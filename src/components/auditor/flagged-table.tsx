"use client";

import { useEffect, useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { ConvResult, Reason } from "@/engine";
import { Stamp } from "../stamp";
import { int } from "./format";
import { REASON_ORDER, REASON_SHORT } from "./meta";

const PAGE = 20;

export function FlaggedTable({ results, total }: { results: ConvResult[]; total: number }) {
  const [reason, setReason] = useState<Reason | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    const c: Record<Reason, number> = {
      human_handoff: 0,
      reopened: 0,
      repeat_contact: 0,
      negative_csat: 0,
      vendor_escalated: 0,
    };
    for (const r of results) for (const x of r.reasons) c[x] += 1;
    return c;
  }, [results]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return results.filter(
      (r) =>
        (reason === "all" || r.reasons.includes(reason)) &&
        (!needle || r.id.toLowerCase().includes(needle)),
    );
  }, [results, reason, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * PAGE, safePage * PAGE + PAGE);

  // The filtered set shrinks when the window or price changes; keep the page in range.
  useEffect(() => {
    if (page > pages - 1) setPage(Math.max(0, pages - 1));
  }, [page, pages]);

  return (
    <section aria-labelledby="flagged-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="flagged-h" className="text-base font-semibold tracking-tight">
          Flagged conversations
        </h2>
        <p className="num text-sm text-ink-3">
          {int(filtered.length)} of {int(total)} shown
        </p>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        Billed but not strictly resolved. Each row says why, with the evidence from your own file.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_16rem]">
        <div role="group" aria-label="Filter by reason" className="flex flex-wrap gap-2">
          <FilterChip active={reason === "all"} onClick={() => { setReason("all"); setPage(0); }}>
            All <span className="num opacity-70">{int(total)}</span>
          </FilterChip>
          {REASON_ORDER.filter((r) => counts[r] > 0).map((r) => (
            <FilterChip
              key={r}
              active={reason === r}
              onClick={() => {
                setReason(r);
                setPage(0);
              }}
            >
              {REASON_SHORT[r]} <span className="num opacity-70">{int(counts[r])}</span>
            </FilterChip>
          ))}
        </div>
        <div className="relative">
          <label htmlFor="flag-search" className="sr-only">
            Search by conversation ID
          </label>
          <MagnifyingGlass
            size={16}
            weight="bold"
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            id="flag-search"
            type="search"
            className="field pl-9"
            placeholder="Search by ID"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
      </div>

      {total === 0 ? (
        <p className="mt-6 rounded-[var(--radius)] bg-surface-2 p-5 text-sm text-ink-2">
          No phantom resolutions at this window. Try a longer window in Parameters, or check that the
          billed column is mapped correctly.
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-6 rounded-[var(--radius)] bg-surface-2 p-5 text-sm text-ink-2">
          Nothing matches that filter.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => {
              setReason("all");
              setQ("");
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {slice.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-2 py-4 md:grid-cols-[14rem_1fr]">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 md:flex-col md:items-start">
                <span className="num break-all text-sm font-semibold">{r.id}</span>
                <Stamp verdict={r.verdict} />
              </div>
              <div className="min-w-0">
                <p className="flex flex-wrap gap-1.5">
                  {r.reasons.map((x) => (
                    <span
                      key={x}
                      className="rounded-[var(--radius)] bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-ink"
                    >
                      {REASON_SHORT[x]}
                    </span>
                  ))}
                </p>
                {r.evidence.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm text-ink-2">
                    {r.evidence.map((e, i) => (
                      <li key={i} className="break-words">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Previous
          </button>
          <p className="num text-sm text-ink-2" aria-live="polite">
            Page {safePage + 1} of {pages}
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-[var(--radius)] border px-3 text-sm font-medium transition-colors ${
        active
          ? "border-ink bg-ink text-bg"
          : "border-line-strong bg-surface text-ink hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}
