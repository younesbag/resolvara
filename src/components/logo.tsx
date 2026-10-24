// Mark: a ledger frame with a long line (billed) and a shorter accent line (strictly resolved).
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="1.5" width="21" height="21" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M6 9h12" stroke="currentColor" strokeWidth="2" />
      <path d="M6 15h7" stroke="var(--accent)" strokeWidth="2.5" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[1.0625rem] font-semibold tracking-tight">
      <LogoMark />
      Resolvara
    </span>
  );
}
