import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PageShell } from "@/components/page-shell";
import { loadVendors, type Vendor } from "@/components/lib/content";

export const metadata: Metadata = {
  title: "Vendor definitions",
  description:
    "How AI support vendors define and bill a resolution, with the price, the silence rule, how to export, and a source link and check date for every fact.",
  alternates: { canonical: "/definitions" },
};

function Silence({ v }: { v: Vendor }) {
  if (v.billsAssumedResolutions === true) return <span className="font-medium">Yes</span>;
  if (v.billsAssumedResolutions === false) return <span className="font-medium">No</span>;
  return <span className="text-ink-3">Not confirmed</span>;
}

function Row({ v }: { v: Vendor }) {
  return (
    <li>
      <Link
        href={`/vendors/${v.slug}`}
        className="group grid gap-x-8 gap-y-2 py-5 hover:bg-surface md:grid-cols-[minmax(0,12rem)_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem] md:items-start md:px-3"
      >
        <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {v.name}
          <ArrowRight
            size={16}
            weight="bold"
            aria-hidden
            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </span>
        <span className="text-sm text-ink-2">
          <span className="block text-xs font-medium text-ink-3 md:hidden">Billing unit</span>
          {v.billingUnit}
          {v.price && <span className="mt-1 block text-ink-3">{v.price}</span>}
        </span>
        <span className="text-sm text-ink-2">
          <span className="block text-xs font-medium text-ink-3 md:hidden">Bills silence as resolved</span>
          <Silence v={v} />
          {v.silenceWindow && <span className="mt-1 block text-ink-3">{v.silenceWindow}</span>}
        </span>
        <span className="num text-sm text-ink-3">
          <span className="block text-xs font-medium md:hidden">Checked</span>
          {v.checkedAt}
        </span>
      </Link>
    </li>
  );
}

function Group({ title, note, vendors }: { title: string; note: string; vendors: Vendor[] }) {
  if (vendors.length === 0) return null;
  return (
    <section className="mt-14 first:mt-0" aria-labelledby={`g-${title}`}>
      <h2 id={`g-${title}`} className="text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-2 max-w-[60ch] text-ink-2">{note}</p>
      <div
        className="mt-6 hidden grid-cols-[minmax(0,12rem)_minmax(0,1.3fr)_minmax(0,1.3fr)_7rem] gap-x-8 px-3 pb-2 text-xs font-medium text-ink-3 md:grid"
        aria-hidden
      >
        <span>Vendor</span>
        <span>Billing unit and price</span>
        <span>Bills silence as resolved</span>
        <span>Checked</span>
      </div>
      <ul className="mt-4 divide-y divide-line border-y border-line md:mt-0">
        {vendors.map((v) => (
          <Row key={v.slug} v={v} />
        ))}
      </ul>
    </section>
  );
}

export default async function DefinitionsPage() {
  const vendors = await loadVendors();
  const native = vendors.filter((v) => v.presetSupport === "native");
  const rest = vendors.filter((v) => v.presetSupport !== "native");

  return (
    <PageShell
      wide
      title="How vendors define a resolution"
      intro={
        <p>
          Each vendor writes its own rule for what it bills. Here they are side by side, from the
          vendors&apos; own pages. Every fact links to its source and carries the date it was checked.
          Terms change, so confirm against the vendor before you rely on one.
        </p>
      }
    >
      {vendors.length === 0 ? (
        <p className="rounded-[var(--radius)] bg-surface-2 p-6 text-ink-2">
          The vendor index is being compiled. Check back shortly.
        </p>
      ) : (
        <>
          <Group
            title="Ready to audit"
            note="Resolvara reads these exports directly. The export columns are detected automatically and you can still correct the mapping."
            vendors={native}
          />
          <Group
            title="Needs column mapping"
            note="These vendors bill by resolution, conversation or session but have no AI outcome column that we can confirm. Map the columns once and the same audit runs."
            vendors={rest}
          />
        </>
      )}
    </PageShell>
  );
}
