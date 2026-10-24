import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { Markdown } from "@/components/markdown";
import { loadVendor, loadVendorGuide, loadVendors } from "@/components/lib/content";

export const dynamicParams = false;

export async function generateStaticParams() {
  const vendors = await loadVendors();
  return vendors.map((v) => ({ slug: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const v = await loadVendor(slug);
  if (!v) return {};
  return {
    title: `${v.name}: how a resolution is defined and billed`,
    description: `${v.name} bills ${v.billingUnit}. See its definition of a resolution, how to export your data, and the sources, checked ${v.checkedAt}.`,
    alternates: { canonical: `/vendors/${v.slug}` },
  };
}

// The guide files start with a title and end with a plain "Sources" list; the page has
// its own heading and renders the structured sources (with labels), so both are dropped.
function stripSources(md: string): string {
  const noTitle = md.replace(/^#[ ]+[^\n]*\n/, "");
  const i = noTitle.search(/^##\s+Sources\s*$/m);
  return i === -1 ? noTitle : noTitle.slice(0, i).trimEnd();
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-4">
      <dt className="text-sm font-medium text-ink-3">{label}</dt>
      <dd className="mt-1 text-ink">{children}</dd>
    </div>
  );
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const v = await loadVendor(slug);
  if (!v) notFound();
  const guide = await loadVendorGuide(slug);
  const native = v.presetSupport === "native";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
        <Link href="/definitions" className="underline underline-offset-4 hover:text-ink">
          Vendor definitions
        </Link>
      </nav>
      <header className="rise mt-4">
        <h1 className="max-w-[22ch] text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-5xl">
          {v.name}
        </h1>
        <p className="mt-4 max-w-[60ch] text-lg text-ink-2">
          How {v.name} defines a resolution, what it bills, and how to audit your own export.
        </p>
      </header>

      <dl className="mt-10 grid divide-y divide-line border-y border-line md:grid-cols-2 md:gap-x-12 md:divide-y-0 md:[&>*]:border-b md:[&>*]:border-line">
        <Fact label="Billing unit">{v.billingUnit}</Fact>
        <Fact label="Price">
          {v.price ?? <span className="text-ink-3">Not published</span>}
        </Fact>
        <Fact label="Silence counts as resolved">
          {v.billsAssumedResolutions === true
            ? "Yes, a customer who stops replying can be billed as resolved."
            : v.billsAssumedResolutions === false
              ? "No."
              : <span className="text-ink-3">Not confirmed from public pages.</span>}
        </Fact>
        {v.silenceWindow && <Fact label="Waiting window">{v.silenceWindow}</Fact>}
        <Fact label="Checked">
          <span className="num">{v.checkedAt}</span>
        </Fact>
        <Fact label="Resolvara support">
          {native
            ? "Detected automatically. You can still correct the column mapping."
            : "Works through the column mapper."}
        </Fact>
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/#audit" className="btn btn-primary">
          Audit a {v.name.split(" ")[0]} export
        </Link>
        <Link href="/calculator" className="btn btn-secondary">
          Estimate the cost
        </Link>
      </div>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-16">
        <div className="min-w-0">
          {guide ? (
            <Markdown source={stripSources(guide)} />
          ) : (
            <div className="prose-doc">
              {(v.quote || v.paraphrase) && (
                <>
                  <h2>The vendor&apos;s definition</h2>
                  {v.paraphrase && <p>{v.paraphrase}</p>}
                  {v.quote && <blockquote>{v.quote}</blockquote>}
                </>
              )}
              {v.exportPath && (
                <>
                  <h2>How to export</h2>
                  <p>{v.exportPath}</p>
                </>
              )}
              {v.keyFields.length > 0 && (
                <>
                  <h2>Fields that matter</h2>
                  <ul>
                    {v.keyFields.map((f) => (
                      <li key={f}>
                        <code>{f}</code>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {v.notes && (
                <>
                  <h2>Notes</h2>
                  <p>{v.notes}</p>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-base font-semibold tracking-tight">Sources</h2>
          <p className="mt-1 text-sm text-ink-3">
            Checked <span className="num">{v.checkedAt}</span>. Vendors change terms, so confirm before
            you rely on a figure.
          </p>
          <ul className="mt-4 space-y-3 text-sm">
            {v.sources.map((s) => (
              <li key={s.url}>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-start gap-1.5 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                >
                  <span className="min-w-0 break-words">{s.label}</span>
                  <ArrowUpRight size={14} weight="bold" aria-hidden className="mt-1 shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
