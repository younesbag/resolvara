// Names, ranges and limits shared by the page (src/components/track.ts) and the server
// (src/server/events.ts). No dependencies, so the page bundle stays small.

export const EVENT_NAMES = [
  "visit",
  "sample_opened",
  "file_loaded",
  "audit_done",
  "csv_downloaded",
  "audit_error",
  "finance_report",
  "dispute_help",
  "sample_report_seen",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export const SIZE_BUCKETS = ["<1k", "1k-10k", "10k-100k", ">100k"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

// The page sends its steps in one batch when it is hidden or closed.
export const MAX_BATCH = 20;

export interface EventProps {
  preset?: "intercom" | "zendesk" | "ada" | "gorgias" | "generic";
  sample?: boolean;
  size?: SizeBucket;
  stage?: "read" | "parse" | "audit" | "worker";
}

export interface TrackedEvent {
  name: EventName;
  ref?: string;
  vid?: string;
  path?: string;
  props?: EventProps;
}

export function sizeBucket(conversations: number): SizeBucket {
  if (conversations < 1000) return "<1k";
  if (conversations < 10000) return "1k-10k";
  if (conversations < 100000) return "10k-100k";
  return ">100k";
}
