import type { Metadata } from "next";
import { pageMeta } from "@/config/seo";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { GITHUB_URL } from "@/components/lib/links";

export const metadata: Metadata = pageMeta(
  "About",
  "Why Resolvara exists, what it will not do, and how to challenge a number or correct a vendor fact. Independent and open source, not affiliated with any vendor.",
  "/about",
);

export default function AboutPage() {
  return (
    <PageShell
      title="About Resolvara"
      intro={
        <p>
          AI support agents are increasingly billed per resolution, and the vendor decides what counts as
          one. Resolvara gives the buyer a second, stricter definition to test the first against.
        </p>
      }
    >
      <div className="prose-doc">
        <h2 style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>What it is</h2>
        <p>
          A free tool that runs in your browser, and an open definition behind it. The{" "}
          <Link href="/standard">Strict Resolution Standard</Link> says what a resolution has to show before
          it counts: no human takeover, no reopen, no repeat contact inside a window, no bad rating, no
          vendor escalation. The tool applies it to your own export and shows its evidence for every flagged
          conversation.
        </p>

        <h2>What it will not do</h2>
        <ul>
          <li>It will not call anyone a fraud. Phantom means billed but not strictly resolved.</li>
          <li>It does not decide what you owe. Your contract does, and a vendor will apply its own definition.</li>
          <li>It does not read message text to judge answer quality.</li>
          <li>It does not keep your data.</li>
        </ul>

        <h2>Vendor facts</h2>
        <p>
          Every vendor statement on this site comes from the vendor&apos;s own published pages, with a link and
          the date it was checked. Pricing and rules change. If something is out of date or wrong, open an
          issue on{" "}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>{" "}
          with the source and it will be corrected. The same goes for a vendor that wants to respond to a
          published figure. See <Link href="/definitions">the definitions index</Link>.
        </p>

        <h2>Licences</h2>
        <p>
          The text of the Standard is licensed CC BY 4.0, so you can reuse and adapt it with attribution. The
          software is MIT. Independent and not affiliated with any vendor named on this site.
        </p>
      </div>
    </PageShell>
  );
}
