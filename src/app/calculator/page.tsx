import type { Metadata } from "next";
import { CalculatorClient } from "@/components/calculator-client";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = {
  title: "What phantom resolutions cost",
  description:
    "Estimate what billed-but-not-strictly-resolved conversations cost at your volume and price. Your own assumptions, no data upload.",
  alternates: { canonical: "/calculator" },
};

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
