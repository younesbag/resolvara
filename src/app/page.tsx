import { Auditor } from "@/components/auditor/auditor";
import type { VendorNote } from "@/components/auditor/options-panel";
import { FaqTeaser } from "@/components/home/faq-teaser";
import { HeroCopy } from "@/components/home/hero-copy";
import { HowItWorks } from "@/components/home/how-it-works";
import { SampleReport } from "@/components/home/sample-report";
import { StrictTest } from "@/components/home/strict-test";
import { TrustStrip } from "@/components/home/trust-strip";
import { loadFaq, loadVendors, parseFaq } from "@/components/lib/content";

export default async function Home() {
  const [vendors, faqMd] = await Promise.all([loadVendors(), loadFaq()]);

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
      <FaqTeaser items={parseFaq(faqMd)} />
    </>
  );
}
