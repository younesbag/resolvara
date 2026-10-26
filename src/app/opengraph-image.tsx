import { ImageResponse } from "next/og";

export const alt = "Resolvara: audit your AI agent's billed resolutions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0f1317",
          color: "#f5f6f7",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}>
          <svg width="56" height="56" viewBox="0 0 64 64">
            <circle cx="20" cy="20" r="10" fill="none" stroke="#f5f6f7" strokeWidth="6" />
            <path d="M48 10 L16 54" stroke="#f5f6f7" strokeWidth="6" strokeLinecap="round" />
            <circle cx="46" cy="46" r="7" fill="#ff7d5c" />
          </svg>
          Resolvara
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, maxWidth: 980 }}>
            Were the resolutions you paid for real?
          </div>
          <div style={{ fontSize: 34, color: "#9aa4ae" }}>
            Drop your support export. Your file never leaves your browser.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
