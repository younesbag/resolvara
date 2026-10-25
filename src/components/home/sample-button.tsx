"use client";

import type { ReactNode } from "react";
import type { Preset } from "@/engine";
import { SAMPLE_EVENT } from "../auditor/sample-event";

export function SampleButton({ preset, children }: { preset: Preset; children: ReactNode }) {
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => window.dispatchEvent(new CustomEvent<Preset>(SAMPLE_EVENT, { detail: preset }))}
    >
      {children}
    </button>
  );
}
