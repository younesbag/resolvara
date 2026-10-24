import Link from "next/link";
import { siteConfig } from "@/config/site";

export function HeroCopy() {
  return (
    <div className="rise">
      <Link href="/standard" className="stamp stamp-muted hover:text-ink">
        Strict Resolution Standard v{siteConfig.standardVersion}
      </Link>
      <h1 className="mt-6 max-w-[21ch] text-[2.6rem] font-semibold leading-[1.04] tracking-[-0.035em] sm:text-5xl lg:text-[3.4rem]">
        Were the resolutions you paid for real?
      </h1>
      <p className="mt-6 max-w-[44ch] text-lg text-ink-2">
        Drop your support export to count the billed resolutions that were not. Your file never leaves
        your browser.
      </p>
    </div>
  );
}
