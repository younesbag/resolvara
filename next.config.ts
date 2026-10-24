import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Strict CSP (docs/SPEC.md). No third-party origins. @vercel/analytics posts to same-origin
// /_vercel/insights, so connect-src needs 'self' only.
// - script-src 'unsafe-inline': Next injects inline bootstrap scripts and the layout sets the theme before paint.
// - style-src 'unsafe-inline': React style attributes and next/font.
// - worker-src: the audit Web Worker is a same-origin bundle; blob: kept for bundler-generated wrappers.
// - img-src blob: data: -> the share-card canvas preview and inline SVG/data images.
// - connect-src: the only request the app makes after load is POST /api/contribute (same origin),
//   plus the same-origin analytics beacon.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' https://va.vercel-scripts.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
