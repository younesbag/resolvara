// A one-page report a support lead can hand to Finance, built entirely in the browser from the
// audit already on screen. Nothing is uploaded. The fingerprint is a SHA-256 of the figures, so a
// reader can tell whether two copies report the same numbers; it is not a cryptographic signature.
import type { AuditReport } from "@/engine";
import { siteConfig } from "@/config/site";
import { dateShort, int, money, pct } from "./format";
import { REASON_LABEL, REASON_ORDER } from "./meta";

const MAX_EXAMPLES = 25;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function fingerprint(figures: object): Promise<string> {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(figures));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "unavailable in this browser";
  }
}

export async function buildFinanceReport({
  report,
  vendorName,
  generatedAt = new Date(),
}: {
  report: AuditReport;
  vendorName: string;
  generatedAt?: Date;
}): Promise<string> {
  const r = report;
  const p = r.params;
  const figures = {
    standard: r.standardVersion,
    vendor: vendorName,
    period: [r.period.start.toISOString().slice(0, 10), r.period.end.toISOString().slice(0, 10)],
    windowDays: p.windowDays,
    price: p.pricePerResolution,
    aiConversations: r.aiConversations,
    billed: r.billed,
    billedJudged: r.billedJudged,
    billedStrictPass: r.billedStrictPass,
    phantom: r.phantom,
    pending: r.pending,
    unverifiable: r.unverifiable,
    dollarsAtRisk: r.dollarsAtRisk,
    byReason: r.byReason,
  };
  const fp = await fingerprint(figures);

  const reasons = REASON_ORDER.filter((k) => r.byReason[k] > 0)
    .map((k) => `<tr><td>${esc(REASON_LABEL[k])}</td><td class="n">${int(r.byReason[k])}</td></tr>`)
    .join("");
  const examples = r.results
    .filter((c) => c.verdict === "phantom")
    .slice(0, MAX_EXAMPLES)
    .map(
      (c) =>
        `<tr><td class="mono">${esc(c.id)}</td><td>${esc(c.reasons.map((x) => REASON_LABEL[x]).join("; "))}</td><td>${esc(c.evidence[0] ?? "")}</td></tr>`,
    )
    .join("");
  const priced = p.pricePerResolution > 0;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI resolution audit: ${esc(vendorName)}, ${esc(dateShort(r.period.start))} to ${esc(dateShort(r.period.end))}</title>
<style>
  :root { --ink:#0f1317; --ink2:#444c55; --line:#d6dadf; --accent:#c43d1c; }
  * { box-sizing: border-box; }
  body { font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 40px; max-width: 860px; }
  h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
  h2 { font-size: 15px; margin: 28px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--ink2); }
  .meta { color: var(--ink2); margin: 0 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .box { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
  .box b { display: block; font-size: 22px; font-variant-numeric: tabular-nums; }
  .box.hl b { color: var(--accent); }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  td, th { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--ink2); font-weight: 600; }
  .n { text-align: right; } .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
  .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 12px; }
  .sign div { border-top: 1px solid var(--ink); padding-top: 6px; color: var(--ink2); min-height: 56px; }
  .foot { margin-top: 28px; color: var(--ink2); font-size: 12px; }
  @media print { body { padding: 0; } .noprint { display: none; } }
</style></head><body>
<p class="noprint" style="background:#f5f6f7;padding:8px 12px;border-radius:6px">To save as PDF, use your browser's Print and choose "Save as PDF".</p>
<h1>AI agent resolution audit: ${esc(vendorName)}</h1>
<p class="meta">Conversations from ${esc(dateShort(r.period.start))} to ${esc(dateShort(r.period.end))} · Strict Resolution Standard v${esc(r.standardVersion)} · ${p.windowDays}-day window · generated ${esc(dateShort(generatedAt))}</p>

<h2>Summary</h2>
<div class="grid">
  <div class="box"><span>Billed as resolved (judged)</span><b>${int(r.billedJudged)}</b></div>
  <div class="box"><span>Of those, pass the Standard</span><b>${int(r.billedStrictPass)} (${pct(r.billedStrictRate)})</b></div>
  <div class="box hl"><span>Billed but not strictly resolved</span><b>${int(r.phantom)} (${pct(r.phantomShareOfBilled)})</b></div>
</div>
<p>${
    priced
      ? `At ${money(p.pricePerResolution)} per resolution, the ${int(r.phantom)} conversations above represent <b>${money(r.dollarsAtRisk)}</b> billed for resolutions that did not hold.`
      : "No price per resolution was entered, so no amount is shown."
  } ${int(r.pending)} conversations are still inside the ${p.windowDays}-day window and ${int(r.unverifiable)} could not be judged from the export; both are left out of the figures above.</p>

<h2>Why they failed</h2>
${reasons ? `<table><tr><th>Signal</th><th class="n">Conversations</th></tr>${reasons}</table><p class="meta">One conversation can carry several signals.</p>` : "<p>No billed conversation failed a signal.</p>"}

<h2>Method</h2>
<p>Each conversation the vendor billed as resolved was checked for five signals inside the window: the same customer came back, a human replied after the AI, it was reopened, it got a negative rating, or the vendor marked it escalated. A billed conversation that shows any of them is counted above. The definition is public: ${siteConfig.url}/standard. This is evidence for a conversation with the vendor, not a claim of an invoice error: the vendor bills by its own published definition.</p>

${examples ? `<h2>Examples (${Math.min(r.phantom, MAX_EXAMPLES)} of ${int(r.phantom)})</h2><table><tr><th>Conversation</th><th>Signal</th><th>Evidence</th></tr>${examples}</table><p class="meta">The full list is in the dispute CSV exported with this audit.</p>` : ""}

<h2>Review</h2>
<div class="sign"><div>Prepared by (support)</div><div>Reviewed by (finance)</div></div>

<p class="foot">Generated locally in the browser by Resolvara (${siteConfig.url}), a free, open-source tool not affiliated with any vendor. The export never left the device it was opened on.<br>
Figures fingerprint (SHA-256): <span class="mono">${fp}</span></p>
</body></html>`;
}
