import { promises as fs } from "node:fs";
import path from "node:path";

// Content loaders. Everything is read defensively: a missing or malformed file
// yields an empty result, never a build failure.

export interface VendorSource {
  url: string;
  label: string;
}

export interface Vendor {
  slug: string;
  name: string;
  billingUnit: string;
  price: string | null;
  billsAssumedResolutions: boolean | null;
  quote: string | null;
  paraphrase: string | null;
  silenceWindow: string | null;
  exportPath: string | null;
  keyFields: string[];
  presetSupport: string;
  sources: VendorSource[];
  checkedAt: string;
  notes: string | null;
}

const root = process.cwd();

async function readText(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

function normalizeVendor(raw: unknown): Vendor | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slug = str(r.slug);
  const name = str(r.name);
  if (!slug || !name) return null;
  const def = (r.resolutionDefinition ?? {}) as Record<string, unknown>;
  const sources = Array.isArray(r.sources)
    ? (r.sources as unknown[])
        .map((s) => {
          if (typeof s === "string") return { url: s, label: s };
          const o = s as Record<string, unknown>;
          const url = str(o?.url);
          return url ? { url, label: str(o.label) ?? url } : null;
        })
        .filter((s): s is VendorSource => s !== null)
    : [];
  return {
    slug,
    name,
    billingUnit: str(r.billingUnit) ?? "Not published",
    price: str(r.price),
    billsAssumedResolutions:
      typeof r.billsAssumedResolutions === "boolean"
        ? r.billsAssumedResolutions
        : null,
    quote: str(def.quote),
    paraphrase: str(def.paraphrase),
    silenceWindow: str(r.silenceWindow),
    exportPath: str(r.exportPath),
    keyFields: Array.isArray(r.keyFields)
      ? (r.keyFields as unknown[]).filter(
          (k): k is string => typeof k === "string",
        )
      : [],
    presetSupport: str(r.presetSupport) ?? "generic",
    sources,
    checkedAt: str(r.checkedAt) ?? "",
    notes: str(r.notes),
  };
}

export async function loadVendors(): Promise<Vendor[]> {
  const text = await readText("content/vendors.json");
  if (!text) return [];
  try {
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as { vendors?: unknown })?.vendors)
        ? (data as { vendors: unknown[] }).vendors
        : [];
    return list.map(normalizeVendor).filter((v): v is Vendor => v !== null);
  } catch {
    return [];
  }
}

export async function loadVendor(slug: string): Promise<Vendor | null> {
  const all = await loadVendors();
  return all.find((v) => v.slug === slug) ?? null;
}

export const loadStandard = () => readText("content/standard.md");
export const loadVendorGuide = (slug: string) =>
  readText(`content/vendor-guides/${slug.replace(/[^a-z0-9-]/gi, "")}.md`);
export const loadFaq = () => readText("content/faq.md");

export interface FaqItem {
  q: string;
  a: string;
}

// content/faq.md format: "## Question" followed by the answer paragraphs.
export function parseFaq(md: string | null): FaqItem[] {
  if (!md) return [];
  const out: FaqItem[] = [];
  let cur: FaqItem | null = null;
  for (const line of md.split(/\r?\n/)) {
    const m = /^#{2,3}\s+(.*)$/.exec(line);
    if (m) {
      if (cur && cur.a.trim()) out.push(cur);
      cur = { q: m[1].trim(), a: "" };
    } else if (cur) {
      cur.a += (cur.a ? "\n" : "") + line;
    }
  }
  if (cur && cur.a.trim()) out.push(cur);
  return out.map((i) => ({ ...i, a: i.a.trim() }));
}
