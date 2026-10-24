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
          <div
            style={{
              width: 48,
              height: 48,
              border: "4px solid #f5f6f7",
              borderRadius: 4,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 8,
              padding: "0 8px",
            }}
          >
            <div style={{ height: 4, width: 28, background: "#f5f6f7" }} />
            <div style={{ height: 5, width: 14, background: "#ff7d5c" }} />
          </div>
          Resolvara
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1.02, letterSpacing: -3, maxWidth: 980 }}>
            Were the resolutions you paid for real?
          </div>
          <div style={{ fontSize: 34, color: "#9aa4ae" }}>
            Drop your support export. Nothing leaves your browser.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
