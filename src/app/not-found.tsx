import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6">
      <p className="stamp stamp-muted">404</p>
      <h1 className="mt-6 max-w-[18ch] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
        That page is not in the ledger.
      </h1>
      <p className="mt-4 max-w-[48ch] text-lg text-ink-2">
        The link may be old or mistyped. The audit tool is on the home page.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-primary">
          Back to the audit
        </Link>
        <Link href="/definitions" className="btn btn-secondary">
          Vendor definitions
        </Link>
      </div>
    </div>
  );
}
