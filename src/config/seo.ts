// Per-page metadata and schema.org JSON-LD. Facts come from siteConfig and content/*, never typed
// here twice, so the site, the structured data and llms.txt say the same thing.
import type { Metadata } from "next";
import { GITHUB_URL } from "@/components/lib/links";
import { siteConfig } from "./site";

export const SITE_DESCRIPTION =
  "Free, open-source tool that checks which of your AI support agent's billed resolutions were real. Drop a support export; it runs in your browser and the file never leaves it.";

/** title is the page title without the brand suffix (the layout template adds " | Resolvara"). */
export function pageMeta(title: string, description: string, path: string): Metadata {
  const home = path === "/";
  const full = home ? title : `${title} | ${siteConfig.name}`;
  // A page's openGraph replaces the layout's (and the file convention's image), so the shared
  // image from app/opengraph-image is named here for every page.
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: full }];
  return {
    title: home ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: siteConfig.name, title: full, description, url: path, images },
    twitter: { card: "summary_large_image", title: full, description, images },
  };
}

const url = (path: string) => `${siteConfig.url}${path === "/" ? "" : path}`;

export const ORG_ID = `${siteConfig.url}/#org`;

export function organization() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/apple-icon.png`,
    sameAs: [GITHUB_URL],
  };
}

export function website() {
  return { "@type": "WebSite", "@id": `${siteConfig.url}/#website`, name: siteConfig.name, url: siteConfig.url, publisher: { "@id": ORG_ID } };
}

export function softwareApp() {
  return {
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    url: siteConfig.url,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (runs in a web browser)",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    license: "https://opensource.org/licenses/MIT",
    sameAs: [GITHUB_URL],
    publisher: { "@id": ORG_ID },
  };
}

export function breadcrumbs(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: url(it.path) })),
  };
}

export function faqPage(items: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[*_`]/g, "") },
    })),
  };
}

export function article(o: { headline: string; description: string; path: string; dateModified?: string; citation?: string[]; about?: string }) {
  return {
    "@type": "Article",
    headline: o.headline,
    description: o.description,
    url: url(o.path),
    mainEntityOfPage: url(o.path),
    ...(o.dateModified ? { dateModified: o.dateModified } : {}),
    ...(o.about ? { about: { "@type": "Thing", name: o.about } } : {}),
    ...(o.citation?.length ? { citation: o.citation } : {}),
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };
}

/** One JSON-LD graph per page. */
export function graph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
