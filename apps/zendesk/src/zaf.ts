// Typed wrapper over the Zendesk Apps Framework `client.request`.
// The only network path of the app: the user's own Zendesk session, same origin as the account.
// No tokens are read or stored. Nothing here persists anything.

/** The part of the ZAF client this app uses. */
export interface ZafClient {
  request(options: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Window {
    ZAFClient?: { init(): ZafClient };
  }
}

export type ZendeskErrorKind = "cancelled" | "forbidden" | "unauthorized" | "rate_limit" | "server" | "network" | "http";

export class ZendeskError extends Error {
  readonly kind: ZendeskErrorKind;
  /** HTTP status when there was a response, null for network errors and cancellation. */
  readonly status: number | null;
  constructor(kind: ZendeskErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "ZendeskError";
    this.kind = kind;
    this.status = status;
  }
}

/** Cooperative cancellation. Checked between requests and during waits. */
export class CancelToken {
  private flag = false;
  private listeners = new Set<() => void>();
  get cancelled(): boolean {
    return this.flag;
  }
  cancel(): void {
    if (this.flag) return;
    this.flag = true;
    for (const fn of [...this.listeners]) fn();
    this.listeners.clear();
  }
  /** Calls fn on cancel (immediately when already cancelled). Returns an unsubscribe function. */
  onCancel(fn: () => void): () => void {
    if (this.flag) {
      fn();
      return () => {};
    }
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  throwIfCancelled(): void {
    if (this.flag) throw new ZendeskError("cancelled", "Cancelled.");
  }
}

/** Reported while the app is waiting. `secondsLeft` counts down; `null` means the wait is over. */
export interface WaitInfo {
  reason: "rate_limit" | "retry" | "pacing";
  secondsLeft: number;
}
export type WaitCallback = (info: WaitInfo | null) => void;

export interface RequestHooks {
  token?: CancelToken;
  onWait?: WaitCallback;
}

export interface ZafRuntime {
  /** Replaceable in tests. Resolves after ms, rejects with a cancelled error when the token fires. */
  sleep: (ms: number, token?: CancelToken) => Promise<void>;
  now: () => number;
}

export const realRuntime: ZafRuntime = {
  now: () => Date.now(),
  sleep: (ms, token) =>
    new Promise<void>((resolve, reject) => {
      if (token?.cancelled) return reject(new ZendeskError("cancelled", "Cancelled."));
      let off: () => void = () => {};
      const t = setTimeout(() => {
        off();
        resolve();
      }, ms);
      if (token) {
        off = token.onCancel(() => {
          clearTimeout(t);
          reject(new ZendeskError("cancelled", "Cancelled."));
        });
      }
    }),
};

/** Sleep in one-second steps so the UI can show a countdown. Always ends with onWait(null). */
export async function waitWithCountdown(
  seconds: number,
  reason: WaitInfo["reason"],
  hooks: RequestHooks,
  rt: ZafRuntime,
): Promise<void> {
  const total = Math.max(0, seconds);
  const start = rt.now();
  try {
    for (;;) {
      hooks.token?.throwIfCancelled();
      const left = total - (rt.now() - start) / 1000;
      if (left <= 0) break;
      hooks.onWait?.({ reason, secondsLeft: Math.ceil(left) });
      await rt.sleep(Math.min(1000, left * 1000), hooks.token);
    }
  } finally {
    hooks.onWait?.(null);
  }
}

const MAX_RATE_LIMIT_RETRIES = 6;
const BACKOFF_SECONDS = [2, 4, 8];
const DEFAULT_RETRY_AFTER = 60;

interface RawResponse {
  status?: number;
  responseJSON?: unknown;
  responseText?: string;
  headers?: unknown;
  getAllResponseHeaders?: () => string;
}

function headerValue(h: unknown, name: string): string | null {
  if (!h) return null;
  const lower = name.toLowerCase();
  if (typeof h === "string") {
    for (const line of h.split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i > 0 && line.slice(0, i).trim().toLowerCase() === lower) return line.slice(i + 1).trim();
    }
    return null;
  }
  if (typeof h === "object") {
    for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
      if (k.toLowerCase() === lower && (typeof v === "string" || typeof v === "number")) return String(v);
    }
  }
  return null;
}

function retryAfterSeconds(e: RawResponse): number {
  let raw = headerValue(e.headers, "retry-after");
  if (raw === null && typeof e.getAllResponseHeaders === "function") {
    try {
      raw = headerValue(e.getAllResponseHeaders(), "retry-after");
    } catch {
      raw = null;
    }
  }
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.ceil(n), 300) : DEFAULT_RETRY_AFTER;
}

function parseBody(e: RawResponse): unknown {
  if (e.responseJSON !== undefined && e.responseJSON !== null) return e.responseJSON;
  if (typeof e.responseText === "string" && e.responseText) {
    try {
      return JSON.parse(e.responseText);
    } catch {
      return null;
    }
  }
  return null;
}

function apiMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { error?: unknown; description?: unknown; message?: unknown };
  const parts = [b.error, b.description, b.message].filter((x): x is string => typeof x === "string" && x.length > 0);
  if (parts.length > 0) return parts[0];
  if (b.error && typeof b.error === "object") {
    const m = (b.error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return null;
}

function isCompleteResponse(r: unknown): r is RawResponse & { status: number } {
  return !!r && typeof r === "object" && typeof (r as RawResponse).status === "number";
}

function describeFailure(status: number | null, body: unknown): ZendeskError {
  const detail = apiMessage(body);
  if (status === 403) {
    return new ZendeskError(
      "forbidden",
      "Zendesk refused this request (403). Reading the incremental ticket export needs an administrator. Open the app as an admin and try again.",
      403,
    );
  }
  if (status === 401) {
    return new ZendeskError("unauthorized", "Your Zendesk session is no longer valid (401). Reload the page and sign in again.", 401);
  }
  if (status !== null && status >= 500) {
    return new ZendeskError("server", `Zendesk had a server error (HTTP ${status})${detail ? `: ${detail}` : ""}.`, status);
  }
  if (status === null) return new ZendeskError("network", "Could not reach Zendesk. Check the connection and try again.");
  return new ZendeskError("http", `Zendesk returned HTTP ${status}${detail ? `: ${detail}` : ""}.`, status);
}

export interface Zaf {
  /** GET a Zendesk API path (or a full Zendesk URL, reduced to its path). Resolves to the parsed JSON. */
  get<T>(url: string, hooks?: RequestHooks): Promise<T>;
}

/** Relative path + query of a Zendesk URL. ZAF requests go to the account's own origin. */
export function toRelative(url: string): string {
  if (url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function createZaf(client: ZafClient, rt: ZafRuntime = realRuntime): Zaf {
  async function get<T>(url: string, hooks: RequestHooks = {}): Promise<T> {
    const path = toRelative(url);
    let rateLimited = 0;
    let backoffs = 0;
    for (;;) {
      hooks.token?.throwIfCancelled();
      let status: number | null = null;
      let body: unknown = null;
      let raw: RawResponse = {};
      try {
        const res = await client.request({
          url: path,
          type: "GET",
          dataType: "json",
          httpCompleteResponse: true,
          autoRetry: false,
        });
        if (isCompleteResponse(res)) {
          status = res.status;
          body = parseBody(res);
          raw = res;
          if (res.status >= 200 && res.status < 300) return body as T;
        } else {
          // The SDK did not honour httpCompleteResponse: the value is the body itself.
          return res as T;
        }
      } catch (e) {
        if (e instanceof ZendeskError) throw e;
        raw = (e && typeof e === "object" ? e : {}) as RawResponse;
        status = typeof raw.status === "number" && raw.status > 0 ? raw.status : null;
        body = parseBody(raw);
      }

      if (status === 429) {
        if (rateLimited >= MAX_RATE_LIMIT_RETRIES) {
          throw new ZendeskError("rate_limit", "Zendesk kept rate-limiting this request. Wait a minute and press Resume.", 429);
        }
        rateLimited += 1;
        await waitWithCountdown(retryAfterSeconds(raw), "rate_limit", hooks, rt);
        continue;
      }
      if (status === null || status >= 500) {
        if (backoffs >= BACKOFF_SECONDS.length) throw describeFailure(status, body);
        const seconds = BACKOFF_SECONDS[backoffs];
        backoffs += 1;
        await waitWithCountdown(seconds, "retry", hooks, rt);
        continue;
      }
      throw describeFailure(status, body);
    }
  }
  return { get };
}

/** The ZAF client of the page, or null when the SDK did not load (not inside Zendesk). */
export function initClient(): ZafClient | null {
  try {
    return window.ZAFClient ? window.ZAFClient.init() : null;
  } catch {
    return null;
  }
}
