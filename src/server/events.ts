// Anonymous usage counts: which steps of the tool people reach. Server only.
// An event is a name from a closed list plus a few enum fields. Never file content, file names,
// counts that could identify a company, or anything the visitor typed. See /privacy "Usage counts".
import { z } from "zod";
import { EVENT_NAMES, MAX_BATCH, SIZE_BUCKETS, type TrackedEvent } from "./events-shared";

export { EVENT_NAMES, MAX_BATCH, SIZE_BUCKETS, sizeBucket } from "./events-shared";
export type { EventName, SizeBucket, TrackedEvent } from "./events-shared";

// Strict: unknown keys are rejected, so nothing can be smuggled into the store.
export const eventSchema = z.strictObject({
  name: z.enum(EVENT_NAMES),
  // Campaign tag from ?ref= in a link we sent. Lowercase slug only.
  ref: z.string().regex(/^[a-z0-9._-]{1,40}$/).optional(),
  // Random per page load, never stored on the device: groups one visit's steps.
  vid: z.uuid().optional(),
  path: z.string().regex(/^\/[A-Za-z0-9/_-]{0,99}$/).optional(),
  props: z
    .strictObject({
      preset: z.enum(["intercom", "zendesk", "ada", "gorgias", "generic"]).optional(),
      sample: z.boolean().optional(),
      size: z.enum(SIZE_BUCKETS).optional(),
      stage: z.enum(["read", "parse", "audit", "worker"]).optional(),
    })
    .optional(),
}) satisfies z.ZodType<TrackedEvent>;
export const batchSchema = z.strictObject({ events: z.array(eventSchema).min(1).max(MAX_BATCH) });

// ---------- rate limit (per hashed IP, in memory, best effort) ----------

const WINDOW_MS = 60 * 60 * 1000;
export const MAX_EVENTS_PER_WINDOW = 120;
const hits = new Map<string, number[]>();

/** Returns true when the caller is over the limit. Records the hit otherwise. */
export function eventRateLimited(key: string, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_EVENTS_PER_WINDOW) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

export function resetEventRateLimit() {
  hits.clear();
}

// ---------- store ----------

/** Inserts a batch through the Supabase REST API with an insert-only key. Returns false on failure. */
export async function storeEvents(events: TrackedEvent[], url: string, key: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/rest/v1/resolvara_events`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(
        events.map((e) => ({
          name: e.name,
          ref: e.ref ?? null,
          vid: e.vid ?? null,
          path: e.path ?? null,
          props: e.props ?? {},
        })),
      ),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
