import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { loadVendors } from "@/components/lib/content";

// /benchmark is left out while it is noindex (no group has enough contributions yet).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vendors = await loadVendors();
  const latest = vendors.map((v) => v.checkedAt).sort().at(-1);
  const paths = ["", "/standard", "/definitions", "/faq", "/calculator", "/privacy", "/about"];
  return [
    ...paths.map((p) => ({
      url: `${siteConfig.url}${p}`,
      changeFrequency: "monthly" as const,
      ...(p === "/definitions" && latest ? { lastModified: latest } : {}),
    })),
    ...vendors.map((v) => ({
      url: `${siteConfig.url}/vendors/${v.slug}`,
      changeFrequency: "monthly" as const,
      lastModified: v.checkedAt,
    })),
  ];
}
