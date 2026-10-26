import type { Metadata } from "next";
import { pageMeta } from "@/config/seo";
import { PageShell } from "@/components/page-shell";
import { GITHUB_URL } from "@/components/lib/links";

export const metadata: Metadata = pageMeta(
  "Privacy",
  "Exactly what runs where: your file stays in your browser, the optional contribution sends aggregates only, and you can verify it in DevTools.",
  "/privacy",
);

export default function PrivacyPage() {
  return (
    <PageShell
      title="Privacy, in plain terms"
      intro={<p>Your support data is the sensitive part, so the design keeps it on your device.</p>}
    >
      <div className="prose-doc">
        <h2 style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>Your file never leaves your browser</h2>
        <p>
          When you drop a file, it is read and scored by a Web Worker inside your tab. Customer IDs, emails
          and any message text are used in memory to find repeat contacts and are discarded when you start
          over or close the tab. Your file and your results are never written to a server, to cookies or to local
          storage.
        </p>

        <h2>The one thing that can send data</h2>
        <p>
          The Contribute button. It is off by default and it shows you the complete JSON before you
          confirm. That message holds only aggregates:
        </p>
        <ul>
          <li>the helpdesk preset and a vendor label</li>
          <li>the length of the period in days and a size bucket (under 1k, 1k to 10k, 10k to 100k, over 100k)</li>
          <li>the billed rate, the strict rate and the phantom share of billed</li>
          <li>the window you used and the share of each failure reason</li>
        </ul>
        <p>
          It has no conversation IDs, customer data or text. Each contribution is stored as a single
          anonymous record. Because it carries no identifier, an individual contribution cannot be looked
          up or removed later, which is why you see it first. To limit abuse, the server keeps a short-lived
          hash of the connecting address in memory. It is not stored with the record.
        </p>

        <h2>Analytics</h2>
        <p>
          The site uses Vercel Web Analytics, which is cookieless and counts page views. It does not see your
          file or your results. Fonts are served from this site, and there are no third-party scripts on the
          audit page.
        </p>

        <h2>Usage counts</h2>
        <p>
          To learn which steps people reach, the page notes when you open a page, run a sample, load a file,
          finish an audit, download the dispute CSV or the finance report, or open the dispute-help email, and sends these notes to this site in one request when you
          switch away from or close the page, never while an audit runs. Each note holds only the
          step name, the export format (for example &quot;intercom&quot;), whether it was sample data, a size range
          (such as &quot;1k-10k&quot; conversations), a campaign tag if the link you followed had one, and a random
          id for this page load. It never holds your file, its name, its rows or your results. Nothing is saved
          on your device for it. The source is in <code>src/components/track.ts</code> and{" "}
          <code>src/server/events.ts</code>.
        </p>

        <h2>The only thing stored on your device</h2>
        <p>
          If you switch the light or dark theme, that choice is saved in your browser&apos;s local storage so
          the site remembers it. It holds no personal data.
        </p>

        <h2>Check it yourself</h2>
        <ol>
          <li>Open your browser&apos;s DevTools and go to the Network tab.</li>
          <li>Clear the list, then drop a file or press Try sample data.</li>
          <li>
            Watch the list while the audit runs. There are no requests. Later, when you switch away from or
            close the page, it sends one anonymous usage note to <code>/api/e</code> (see Usage counts). The
            only other request is the one you trigger with Send in the Contribute dialog.
          </li>
          <li>Turn off your network and run it again. It still works.</li>
        </ol>

        <h2>Source</h2>
        <p>
          The code is open source, so you can read how files are handled and run your own copy:{" "}
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            {GITHUB_URL.replace("https://", "")}
          </a>
          .
        </p>
      </div>
    </PageShell>
  );
}
