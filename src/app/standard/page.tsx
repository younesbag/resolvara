import type { Metadata } from "next";
import { pageMeta, article, graph } from "@/config/seo";
import { extractHeadings, Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { loadStandard } from "@/components/lib/content";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = pageMeta(
  "The Strict Resolution Standard: when is an AI resolution real?",
  "An open, versioned test for whether an AI support agent's billed resolution was real: five fail signals (repeat contact, reopen, human reply, negative CSAT, escalation), a pending window and adjustable parameters. CC BY 4.0.",
  "/standard",
);

const FALLBACK = `# The Strict Resolution Standard v0.2

Status: draft for public comment. Licence: CC BY 4.0.

The full text of the Standard is being finalised. The summary below is what Resolvara applies today.

## The five fail signals

- **vendor_escalated.** The vendor's own state is escalated, handoff or negative feedback.
- **human_handoff.** A human replied after the AI.
- **reopened.** The reopen count is above zero.
- **repeat_contact.** The same customer opened another conversation within the window (default 7 days).
- **negative_csat.** A satisfaction score below the threshold (default 0.4 on a 0 to 1 scale).

## The pending window

Conversations created inside the newest W days of the export cannot be judged yet. They are excluded from every rate and shown separately.`;

export default async function StandardPage() {
  const md = (await loadStandard()) ?? FALLBACK;
  const toc = extractHeadings(md).filter((h) => h.level === 2);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-12 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-16">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <nav aria-label="On this page">
            <details className="lg:hidden">
              <summary className="cursor-pointer py-2 text-sm font-semibold">On this page</summary>
              <TocList toc={toc} />
            </details>
            <div className="hidden lg:block">
              <p className="mb-2 text-sm font-semibold">On this page</p>
              <TocList toc={toc} />
            </div>
          </nav>
        </aside>
        <article className="min-w-0 rise">
          <JsonLd
            data={graph({
              ...article({
                headline: `The Strict Resolution Standard v${siteConfig.standardVersion}`,
                description: "An open test for whether an AI support agent's billed resolution was real.",
                path: "/standard",
              }),
              "@type": "TechArticle",
              version: siteConfig.standardVersion,
              license: "https://creativecommons.org/licenses/by/4.0/",
            })}
          />
          <Markdown source={md} />
        </article>
      </div>
    </div>
  );
}

function TocList({ toc }: { toc: { id: string; text: string }[] }) {
  return (
    <ul className="mt-2 space-y-0.5 border-l border-line text-sm">
      {toc.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            className="-ml-px block border-l border-transparent py-1.5 pl-4 text-ink-2 hover:border-ink hover:text-ink"
          >
            {h.text.replace(/^\d+\.\s*/, "")}
          </a>
        </li>
      ))}
    </ul>
  );
}
