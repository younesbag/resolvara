// UI-level constants. The GitHub URL is a placeholder until the repository exists;
// override with NEXT_PUBLIC_GITHUB_URL at deploy time.
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/younesbag/resolvara";

export const NAV_ITEMS = [
  { href: "/", label: "Audit" },
  { href: "/standard", label: "Standard" },
  { href: "/definitions", label: "Definitions" },
  { href: "/calculator", label: "Calculator" },
  { href: "/benchmark", label: "Benchmark" },
] as const;

export const FOOTER_LINKS = [
  { href: "/standard", label: "The Standard" },
  { href: "/definitions", label: "Vendor definitions" },
  { href: "/calculator", label: "Calculator" },
  { href: "/benchmark", label: "Benchmark" },
  { href: "/faq", label: "FAQ" },
  { href: "/privacy", label: "Privacy" },
  { href: "/about", label: "About" },
] as const;
