import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { loadFaq, parseFaq } from "@/components/lib/content";
import { Markdown } from "@/components/markdown";
import { PageShell } from "@/components/page-shell";
import { breadcrumbs, faqPage, graph, pageMeta } from "@/config/seo";

export const metadata: Metadata = pageMeta(
  "FAQ: auditing AI agent resolutions",
  "Answers about checking AI support agent resolutions: whether your data leaves the browser, how accurate the audit is, phantom resolutions, pending and unverifiable conversations, supported vendors.",
  "/faq",
);

const slug = (q: string) =>
  q.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export default async function FaqPage() {
  const items = parseFaq(await loadFaq());

  return (
    <PageShell
      title="Questions about auditing AI resolutions"
      intro={<p>Short answers first, details after. Every rule mentioned here is defined in the Standard.</p>}
    >
      <JsonLd data={graph(faqPage(items), breadcrumbs([{ name: "FAQ", path: "/faq" }]))} />
      <div className="divide-y divide-line border-y border-line">
        {items.map((f) => (
          <section key={f.q} id={slug(f.q)} className="scroll-mt-24 py-8">
            <h2 className="text-xl font-semibold tracking-tight">{f.q}</h2>
            <div className="mt-3 text-ink-2">
              <Markdown source={f.a} />
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
