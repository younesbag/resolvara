import Link from "next/link";
import { GithubLogo, LockSimple } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";
import { Wordmark } from "./logo";
import { FOOTER_LINKS, GITHUB_URL } from "./lib/links";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-bg">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <Wordmark />
          <p className="mt-4 max-w-[46ch] text-sm text-ink-2">
            An independent, open check of AI agent resolutions that vendors bill for. Not affiliated
            with any vendor.
          </p>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-2">
            <LockSimple size={16} weight="bold" aria-hidden />
            Runs in your browser. Your file never leaves it.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          {FOOTER_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="py-1 text-ink-2 hover:text-ink hover:underline">
              {l.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 py-1 text-ink-2 hover:text-ink hover:underline"
          >
            <GithubLogo size={18} weight="bold" aria-hidden />
            GitHub
          </a>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-ink-3 sm:px-6">
          The Strict Resolution Standard v{siteConfig.standardVersion} text is licensed CC BY 4.0. Code
          is MIT.
        </p>
      </div>
    </footer>
  );
}
