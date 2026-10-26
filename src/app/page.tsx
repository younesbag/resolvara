import { Auditor } from "@/components/auditor/auditor";
import type { VendorNote } from "@/components/auditor/options-panel";
import { FaqTeaser } from "@/components/home/faq-teaser";
import { HeroCopy } from "@/components/home/hero-copy";
import { HowItWorks } from "@/components/home/how-it-works";
import { SampleReport } from "@/components/home/sample-report";
import { StrictTest } from "@/components/home/strict-test";
import { TrustStrip } from "@/components/home/trust-strip";
import { JsonLd } from "@/components/json-ld";
import { loadFaq, loadVendors, parseFaq } from "@/components/lib/content";
import { FAQ_TEASER_COUNT } from "@/components/home/faq-teaser";
import { faqPage, graph, organization, pageMeta, SITE_DESCRIPTION, softwareApp, website } from "@/config/seo";

export const metadata = pageMeta("Resolvara: audit your AI agent's billed resolutions", SITE_DESCRIPTION, "/");

export default async function Home() {
  const [vendors, faqMd] = await Promise.all([loadVendors(), loadFaq()]);
  const faq = parseFaq(faqMd);

  const notes: Record<string, VendorNote> = {};
  for (const v of vendors) {
    notes[v.slug] = {
      href: `/vendors/${v.slug}`,
      checkedAt: v.checkedAt,
      priceSource: (v.sources.find((s) => /pricing/i.test(s.url)) ?? v.sources[0])?.url,
    };
  }

  return (
    <>
      <Auditor hero={<HeroCopy />} notes={notes} />
      <SampleReport />
      <HowItWorks />
      <StrictTest />
      <TrustStrip />
      <FaqTeaser items={faq} />
      <JsonLd data={graph(organization(), website(), softwareApp(), faqPage(faq.slice(0, FAQ_TEASER_COUNT)))} />
    </>
  );
}
