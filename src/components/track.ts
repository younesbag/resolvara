"use client";

// Anonymous usage counts (see /privacy "Usage counts" and src/server/events.ts).
// Events wait in memory and leave in one request when the page is hidden or closed, so nothing is
// sent while an audit runs: the "no request during an audit" promise on the site stays literally true.
// Nothing is kept on the device: the visit id and the campaign tag live in memory for this page load.
import { MAX_BATCH, type EventName, type TrackedEvent } from "@/server/events-shared";

const queue: TrackedEvent[] = [];
let vid: string | null = null;
let ref: string | null | undefined;
let listening = false;

function visitId(): string | undefined {
  if (vid) return vid;
  try {
    vid = crypto.randomUUID();
    return vid;
  } catch {
    return undefined;
  }
}

function campaignRef(): string | undefined {
  if (ref === undefined) {
    const raw = new URLSearchParams(window.location.search).get("ref")?.toLowerCase() ?? "";
    ref = /^[a-z0-9._-]{1,40}$/.test(raw) ? raw : null;
  }
  return ref ?? undefined;
}

function flush() {
  if (!queue.length) return;
  const text = JSON.stringify({ events: queue.splice(0, MAX_BATCH) });
  try {
    if (navigator.sendBeacon?.("/api/e", new Blob([text], { type: "application/json" }))) return;
  } catch {
    /* fall back to fetch */
  }
  fetch("/api/e", { method: "POST", body: text, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(
    () => {},
  );
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

export function track(name: EventName, props?: TrackedEvent["props"]) {
  if (typeof window === "undefined") return;
  listen();
  const path = window.location.pathname.slice(0, 100);
  queue.push({
    name,
    ref: campaignRef(),
    vid: visitId(),
    path: /^\/[A-Za-z0-9/_-]{0,99}$/.test(path) ? path : undefined,
    props,
  });
  if (queue.length >= MAX_BATCH) queue.shift(); // keep the newest steps; a visit never needs more
}
