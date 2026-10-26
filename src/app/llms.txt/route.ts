// llms.txt: a plain-language map of the site for language models (https://llmstxt.org).
// Built from the same content files as the pages, so it cannot drift from them.
import { loadVendors } from "@/components/lib/content";
import { SITE_DESCRIPTION } from "@/config/seo";
import { siteConfig } from "@/config/site";
import { GITHUB_URL } from "@/components/lib/links";

export const dynamic = "force-static";

export async function GET() {
  const vendors = await loadVendors();
  const u = siteConfig.url;
  const lines = [
    `# ${siteConfig.name}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "Resolvara is independent and not affiliated with any vendor. It is free and open source (MIT). The audit runs in the visitor's browser: the support export is never uploaded.",
    "",
    "## What it does",
    "",
    "- Reads a support export (Intercom Fin, Zendesk, Ada, Gorgias, or any CSV/JSON via column mapping) and marks each AI conversation the vendor billed as a resolution.",
    "- Tests each billed resolution against five fail signals inside a window (7 days by default): the same customer came back, a human replied after the AI, the conversation was reopened, the rating was negative, the vendor escalated it.",
    "- A billed resolution that fails any signal is called a phantom resolution. Phantom is evidence for a conversation with the vendor, not an accusation of fraud.",
    "- Outputs the strict resolution rate next to the billed rate, the money at risk at the user's price per resolution, and a dispute CSV with the reason for each flagged conversation.",
    "",
    "## Key pages",
    "",
    `- [Audit tool](${u}/): drop an export or run the built-in sample.`,
    `- [The Strict Resolution Standard v${siteConfig.standardVersion}](${u}/standard): the open definition of a real resolution, CC BY 4.0.`,
    `- [How AI support vendors define and bill a resolution](${u}/definitions): pricing and resolution rules side by side, with sources and check dates.`,
    `- [FAQ](${u}/faq)`,
    `- [Calculator](${u}/calculator): what phantom resolutions cost at a given volume and price.`,
    `- [Contract clause](${u}/contract): ready-to-paste contract language that defines a billable AI resolution, built from the Standard, for order forms and renewals.`,
    `- [Privacy](${u}/privacy): what runs where, verifiable in the browser.`,
    "",
    "## Vendor pages",
    "",
    ...vendors.map(
      (v) => `- [${v.name}](${u}/vendors/${v.slug}): bills ${v.billingUnit}${v.price ? `, ${v.price}` : ""}. Checked ${v.checkedAt}.`,
    ),
    "",
    "## Source",
    "",
    `- Code: ${GITHUB_URL}`,
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
