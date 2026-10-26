import { describe, expect, it } from "vitest";
import { audit, parseFile, sampleDataset } from "@/engine";
import { buildFinanceReport } from "../finance-report";

async function sampleReport() {
  const { conversations } = await parseFile(sampleDataset("intercom"), { preset: "intercom" });
  return audit(
    conversations,
    { windowDays: 7, pricePerResolution: 0.99, sameTopicOnly: false, negativeCsatThreshold: 0.4, countAgentReplies: false },
    "intercom",
  );
}

describe("buildFinanceReport", () => {
  it("states the figures from the audit and a stable fingerprint", async () => {
    const report = await sampleReport();
    const at = new Date("2026-10-27T00:00:00Z");
    const a = await buildFinanceReport({ report, vendorName: "Intercom Fin", generatedAt: at });
    const b = await buildFinanceReport({ report, vendorName: "Intercom Fin", generatedAt: at });
    expect(a).toContain(report.billedJudged.toLocaleString("en-US"));
    expect(a).toContain(report.phantom.toLocaleString("en-US"));
    expect(a).toContain("Reviewed by (finance)");
    const fp = /SHA-256\): <span class="mono">([0-9a-f]{64})</.exec(a)?.[1];
    expect(fp).toBeDefined();
    expect(b).toContain(fp!);
  });

  it("escapes text that came from the export", async () => {
    const report = await sampleReport();
    const html = await buildFinanceReport({ report, vendorName: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("says no amount when no price was entered", async () => {
    const report = await sampleReport();
    const html = await buildFinanceReport({
      report: { ...report, params: { ...report.params, pricePerResolution: 0 } },
      vendorName: "Intercom Fin",
    });
    expect(html).toContain("No price per resolution was entered");
  });
});
