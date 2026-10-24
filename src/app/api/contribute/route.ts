import { createHash, randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { CONTRIBUTION_PREFIX, contributionSchema, rateLimited } from "@/server/contribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
// Per-process salt: the hash cannot be reversed or linked across restarts.
const SALT = randomBytes(16).toString("hex");

const noStore = { "Cache-Control": "no-store" };
const json = (body: Record<string, unknown>, status: number, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { ...noStore, ...extra } });

function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(SALT + ip).digest("hex");
}

export async function POST(req: Request) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return json(
      {
        error: "storage_unavailable",
        message:
          "Contributions are not enabled on this deployment (no storage configured). Nothing was stored.",
      },
      503,
    );
  }

  // Browsers always send Origin on cross-site POSTs; reject a mismatching one.
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* invalid origin: rejected below */
    }
    if (originHost !== host) {
      return json({ error: "forbidden_origin", message: "Cross-site contributions are not accepted." }, 403);
    }
  }

  if (rateLimited(clientKey(req))) {
    return json(
      { error: "rate_limited", message: "Too many contributions from this connection. Try again later." },
      429,
      { "Retry-After": "3600" },
    );
  }

  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) {
    return json({ error: "too_large", message: "Payload too large." }, 413);
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    return json({ error: "too_large", message: "Payload too large." }, 413);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return json({ error: "invalid_json", message: "Body must be JSON." }, 400);
  }

  const parsed = contributionSchema.safeParse(data);
  if (!parsed.success) {
    return json(
      {
        error: "invalid_contribution",
        message: "The contribution did not match the schema.",
        issues: parsed.error.issues.slice(0, 10).map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400,
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const pathname = `${CONTRIBUTION_PREFIX}${stamp}-${randomBytes(6).toString("hex")}.json`;
  try {
    await put(pathname, JSON.stringify(parsed.data), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
      token,
    });
  } catch {
    return json({ error: "store_failed", message: "Could not store the contribution. Nothing was saved." }, 502);
  }
  return json({ ok: true }, 201);
}

export function GET() {
  return json({ error: "method_not_allowed", message: "Use POST." }, 405, { Allow: "POST" });
}
