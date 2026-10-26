import type { Metadata } from "next";
import Link from "next/link";
import { ContractClient } from "@/components/contract-client";
import { JsonLd } from "@/components/json-ld";
import { loadVendors, type Vendor } from "@/components/lib/content";
import { PageShell } from "@/components/page-shell";
import { article, breadcrumbs, graph, pageMeta } from "@/config/seo";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = pageMeta(
  "A resolution definition you can sign: contract clause generator",
  "Free generator of contract language that defines a billable AI support resolution, built from the open Strict Resolution Standard, with the data rights a buyer needs to check it. Copy it into an order form or renewal.",
  "/contract",
);

interface Question {
  q: string;
  /** A fact from content/vendors.json, or null when no vendor fact supports one. */
  fact: string | null;
}

// Every fact below is read from content/vendors.json and only shown when the field says it.
function buildQuestions(vendors: Vendor[]): Question[] {
  const by = (slug: string) => vendors.find((v) => v.slug === slug);
  const assumed = vendors.filter((v) => v.billsAssumedResolutions === true);
  const silence = ["hubspot", "gorgias", "front"]
    .map(by)
    .filter((v): v is Vendor => !!v && !!v.silenceWindow)
    .map((v) => `${v.name}: ${v.silenceWindow}`);
  const hubspot = by("hubspot");
  const helpScout = by("help-scout");
  const intercom = by("intercom");
  const ada = by("ada");
  const zendesk = by("zendesk");

  return [
    {
      q: "Is a customer who stops replying billed? After how long?",
      fact:
        assumed.length > 0
          ? `${assumed.length} of the ${vendors.length} vendors on the definitions page are listed as billing assumed resolutions, where silence counts.${
              silence.length ? ` The silence window differs: ${silence.join(" ")}` : ""
            }`
          : null,
    },
    {
      q: "Can we get a per-conversation export that shows which conversations were billed?",
      fact:
        helpScout?.exportPath && /unconfirmed/i.test(helpScout.exportPath)
          ? `Not every vendor documents one. Help Scout: ${helpScout.exportPath}`
          : null,
    },
    {
      q: "Is a conversation still billed if a human replies after the AI?",
      fact:
        hubspot?.paraphrase && /manual assignment/i.test(hubspot.paraphrase)
          ? "Practice differs. HubSpot's published rule treats manual assignment as not a qualifying handoff, so a human can handle the thread and it still counts as resolved."
          : null,
    },
    {
      q: "If the customer comes back about the same problem, is the first conversation credited?",
      fact: intercom?.keyFields.some((k) => k.includes("count_reopens"))
        ? "The data usually exists. Intercom's documented fields include a reopen count (statistics.count_reopens)."
        : null,
    },
    {
      q: "Are test and internal conversations left out of the billed count?",
      fact: ada?.keyFields.includes("is_test_user")
        ? "Ask for the flag. Ada's documented export includes an is_test_user field."
        : null,
    },
    {
      q: "Can the billing definition change during our term, and who decides?",
      fact:
        zendesk?.billingUnit && hubspot?.price
          ? `Vendors do change units and prices. Zendesk bills ${zendesk.billingUnit}. HubSpot: ${hubspot.price}.`
          : null,
    },
    {
      q: "Can we check the count ourselves, and what happens to a conversation we dispute?",
      fact: null,
    },
  ];
}

export default async function ContractPage() {
  const questions = buildQuestions(await loadVendors());

  return (
    <PageShell
      wide
      title="A resolution definition you can sign"
      intro={
        <p>
          Per-resolution pricing is only as fair as its definition. This clause is built from the{" "}
          <Link href="/standard" className="underline underline-offset-4 hover:text-ink">
            Strict Resolution Standard
          </Link>
          . Adjust it, then paste it into your order form, an MSA addendum or a renewal.
        </p>
      }
    >
      <JsonLd
        data={graph(
          article({
            headline: "A resolution definition you can sign",
            description:
              "Contract language that defines a billable AI support resolution, adapted from the Strict Resolution Standard (CC BY 4.0).",
            path: "/contract",
            about: "Contract language for AI support billing",
          }),
          breadcrumbs([{ name: "Contract clause", path: "/contract" }]),
        )}
      />
      <ContractClient standardVersion={siteConfig.standardVersion} />

      <p className="mt-8 max-w-[70ch] text-sm text-ink-3">
        This is not legal advice. Have counsel review any clause before you sign it. The Standard is a measurement, not a
        verdict, and your vendor will apply its own contract definition unless you agree otherwise.
      </p>

      <section className="mt-16 max-w-3xl" aria-labelledby="ask">
        <h2 id="ask" className="text-2xl font-semibold tracking-tight">
          Questions to ask your vendor before signing
        </h2>
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {questions.map((x) => (
            <li key={x.q} className="py-5">
              <p className="font-medium">{x.q}</p>
              {x.fact && <p className="mt-2 text-sm text-ink-2">{x.fact}</p>}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-3">
          Facts come from each vendor&apos;s published documentation, with sources and check dates on the{" "}
          <Link href="/definitions" className="underline underline-offset-4 hover:text-ink">
            definitions page
          </Link>
          .
        </p>
      </section>
    </PageShell>
  );
}
