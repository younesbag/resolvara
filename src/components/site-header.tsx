import Link from "next/link";
import { Wordmark } from "./logo";
import { SiteNav } from "./site-nav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="Resolvara home" className="rounded-[var(--radius)] py-2">
          <Wordmark />
        </Link>
        <SiteNav />
      </div>
    </header>
  );
}
