import type { AuditReport } from "@/engine";
import { siteConfig } from "@/config/site";
import { pct } from "./format";

// Draws the shareable card. By design it carries only two rates, the vendor name,
// the Standard version and the site host: no counts, no dollars, no identifiers.
export async function renderShareCard(opts: {
  report: AuditReport;
  vendorName: string;
  windowDays: number;
}): Promise<Blob> {
  const { report, vendorName, windowDays } = opts;
  const W = 1200;
  const H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext("2d");
  if (!c) throw new Error("Canvas is not available in this browser.");

  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const mono = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-geist-mono")
    .trim();
  const monoFamily = mono ? `${mono}, ui-monospace, monospace` : "ui-monospace, monospace";
  try {
    await Promise.all([
      document.fonts.load(`600 72px ${family}`),
      document.fonts.load(`600 120px ${monoFamily}`),
    ]);
  } catch {
    /* fall back to whatever is loaded */
  }

  const INK = "#0f1317";
  const PAPER = "#f5f6f7";
  const MUTED = "#9aa4ae";
  const PASS = "#52c690";
  const ACCENT = "#ff7d5c";

  c.fillStyle = INK;
  c.fillRect(0, 0, W, H);

  // frame
  c.strokeStyle = "#2a3139";
  c.lineWidth = 2;
  c.strokeRect(40, 40, W - 80, H - 80);

  c.textBaseline = "alphabetic";
  c.fillStyle = PAPER;
  c.font = `600 34px ${family}`;
  c.fillText("Resolvara", 80, 112);

  c.fillStyle = MUTED;
  c.font = `500 26px ${family}`;
  c.fillText(`${vendorName}: billed vs strictly resolved`, 80, 168);

  // Lead with the phantom share of billed: it is the one number that needs no comparison of
  // rates. The two rates share one population (judged AI conversations), so they can sit together.
  c.fillStyle = MUTED;
  c.font = `500 28px ${family}`;
  c.fillText("Billed resolutions that fail the strict test", 80, 262);
  c.fillStyle = ACCENT;
  c.font = `600 170px ${monoFamily}`;
  c.fillText(pct(report.phantomShareOfBilled, 0), 80, 430);

  const side = (y: number, label: string, value: string, color: string) => {
    c.fillStyle = MUTED;
    c.font = `500 24px ${family}`;
    c.fillText(label, 760, y);
    c.fillStyle = color;
    c.font = `600 72px ${monoFamily}`;
    c.fillText(value, 760, y + 76);
  };
  side(262, "Billed as resolved", pct(report.billedRate, 0), PAPER);
  side(388, "Strictly resolved", pct(report.strictRate, 0), PASS);

  c.fillStyle = MUTED;
  c.font = `500 22px ${family}`;
  c.fillText("Judged AI conversations only. Newest days are held back.", 80, 520);
  c.textAlign = "right";
  c.fillText(`Strict Resolution Standard v${report.standardVersion}, ${windowDays}-day window`, W - 80, 520);
  c.fillText(new URL(siteConfig.url).host, W - 80, 560);
  c.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image."))), "image/png");
  });
}
