// Mark: a percent sign built from the two rates. The claimed rate is the large hollow circle,
// the rate that holds up under the strict test is the small solid accent dot.
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r="10" fill="none" stroke="currentColor" strokeWidth="6" />
      <path d="M48 10 L16 54" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      <circle cx="46" cy="46" r="7" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-[1.0625rem] font-semibold tracking-tight">
      <LogoMark />
      Resolvara
    </span>
  );
}
