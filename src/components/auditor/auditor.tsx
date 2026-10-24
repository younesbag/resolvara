"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Intake } from "./intake";
import { MapperDialog } from "./mapper-dialog";
import type { VendorNote } from "./options-panel";
import { Results } from "./results";
import { useAuditor } from "./use-auditor";

// The tool is the hero: copy on the left, the drop zone on the right. Once an audit
// finishes, the results take the full width in place.
export function Auditor({ hero, notes }: { hero: ReactNode; notes: Record<string, VendorNote> }) {
  const api = useAuditor();
  const { state } = api;
  const showResults = state.phase === "results" && state.report !== null;
  const working = state.phase === "working" || state.phase === "mapping";

  // Bring the top of the tool into view when the view swaps between intake and results.
  const rootRef = useRef<HTMLDivElement>(null);
  const prev = useRef(showResults);
  useEffect(() => {
    if (prev.current !== showResults) {
      prev.current = showResults;
      rootRef.current?.scrollIntoView({ block: "start" });
    }
  }, [showResults]);

  return (
    <div id="audit" ref={rootRef} className="scroll-mt-16">
      {showResults ? (
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 sm:px-6 sm:pt-14">
          <Results state={state} api={api} notes={notes} />
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16 lg:pb-24 lg:pt-20">
          <div>{hero}</div>
          <div className="rise rise-2">
            <Intake
              onFile={api.loadFile}
              onSample={api.loadSample}
              working={working}
              stage={state.stage}
              progress={state.progress}
              label={state.label}
              error={state.phase === "error" ? state.error : null}
              onRetry={api.reset}
            />
          </div>
        </div>
      )}

      <MapperDialog
        open={state.mapperOpen}
        headers={state.headers}
        initialPreset={state.preset}
        initialMapping={state.mapping}
        detected={state.detected}
        onApply={api.applyMapping}
        onClose={api.closeMapper}
      />
    </div>
  );
}
