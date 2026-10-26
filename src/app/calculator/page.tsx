import type { Metadata } from "next";
import { pageMeta } from "@/config/seo";
import { CalculatorClient } from "@/components/calculator-client";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = pageMeta(
  "What phantom AI resolutions cost: a per-resolution pricing calculator",
  "Estimate what billed but not strictly resolved AI agent conversations cost at your volume and price per resolution. Your own assumptions, no data upload.",
  "/calculator",
);

export default function CalculatorPage() {
  return (
    <PageShell
      wide
      title="What phantom resolutions cost"
      intro={
        <p>
          Enter your volume, your price and the share you think does not hold up. Or measure the share
          from your own export first.
        </p>
      }
    >
      <CalculatorClient />
    </PageShell>
  );
}
