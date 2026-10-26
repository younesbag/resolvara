// Renders the brand mark to the PNGs that cannot be SVG: Zendesk app logos, the Apple touch icon
// and the X profile picture. Source of truth for the mark: src/components/logo.tsx.
//   node scripts/render-brand.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const INK = "#0f1317";
const LIGHT = "#f5f6f7";
const ACCENT = "#ff7d5c";

const mark = `
  <circle cx="20" cy="20" r="10" fill="none" stroke="${LIGHT}" stroke-width="6"/>
  <path d="M48 10 L16 54" stroke="${LIGHT}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="46" cy="46" r="7" fill="${ACCENT}"/>`;

// scale < 1 leaves more room around the mark (round crops such as the X avatar).
function tile({ rx = 14, scale = 1 } = {}) {
  const t = 32 - 32 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${rx}" fill="${INK}"/>
  <g transform="translate(${t} ${t}) scale(${scale})">${mark}</g>
</svg>`;
}

async function png(svg, size, out) {
  await sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 64) * 2 }).resize(size, size).png().toFile(out);
  console.log("wrote", out, `${size}x${size}`);
}

mkdirSync("brand", { recursive: true });
await png(tile({ rx: 0, scale: 0.8 }), 320, "apps/zendesk/assets/logo.png");
await png(tile({ rx: 0, scale: 0.8 }), 128, "apps/zendesk/assets/logo-small.png");
await png(tile({ rx: 0, scale: 0.8 }), 180, "src/app/apple-icon.png");
await png(tile({ rx: 0, scale: 0.62 }), 400, "brand/x-avatar-400.png");
await png(tile({ rx: 0, scale: 0.62 }), 1000, "brand/x-avatar-1000.png");
