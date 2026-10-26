import { createHash, randomBytes } from "node:crypto";
import { batchSchema, eventRateLimited, storeEvents } from "@/server/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8192;
// Per-process salt: the hash cannot be reversed or linked across restarts.
const SALT = randomBytes(16).toString("hex");

// Counting is best effort and invisible to the visitor: every outcome is an empty response.
const done = (status: number) => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(SALT + ip).digest("hex");
}

export async function POST(req: Request) {
  const url = process.env.RESOLVARA_EVENTS_URL;
  const key = process.env.RESOLVARA_EVENTS_KEY;
  if (!url || !key) return done(204);

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* invalid origin: rejected below */
    }
    if (originHost !== host) return done(403);
  }

  if (eventRateLimited(clientKey(req))) return done(429);

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return done(413);
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return done(413);

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return done(400);
  }
  const parsed = batchSchema.safeParse(data);
  if (!parsed.success) return done(400);

  return done((await storeEvents(parsed.data.events, url, key)) ? 204 : 502);
}

export function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
