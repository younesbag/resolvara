"use client";

import { useEffect, useRef } from "react";
import type { EventName } from "@/server/events-shared";
import { track } from "./track";

/** Counts one event the first time this spot scrolls into view, for content that has no button. */
export function TrackSeen({ name }: { name: EventName }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track(name);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [name]);
  return <span ref={ref} aria-hidden className="block h-px" />;
}
