import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { loadVendors } from "@/components/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const vendors = await loadVendors();
  const paths = ["", "/standard", "/definitions", "/calculator", "/benchmark", "/privacy", "/about"];
  return [
    ...paths.map((p) => ({ url: `${siteConfig.url}${p}`, changeFrequency: "monthly" as const })),
    ...vendors.map((v) => ({
      url: `${siteConfig.url}/vendors/${v.slug}`,
      changeFrequency: "monthly" as const,
    })),
  ];
}
