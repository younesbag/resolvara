"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { track } from "./track";

/** One "visit" count per page the visitor opens. */
export function TrackVisit() {
  const pathname = usePathname();
  useEffect(() => {
    track("visit");
  }, [pathname]);
  return null;
}
