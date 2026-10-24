// Starts the audit worker from the source string that build.mjs injects. A Blob URL is same-origin
// with the ZAF iframe; a URL to an asset file would be cross-origin and fail to load.
import type { WorkerIn, WorkerOut } from "../worker-protocol";

export interface AuditWorker {
  post(msg: WorkerIn): void;
  onMessage(fn: (m: WorkerOut) => void): void;
  onFailure(fn: (message: string) => void): void;
  terminate(): void;
}

export function makeWorker(): AuditWorker {
  const url = URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: "text/javascript" }));
  const w = new Worker(url);
  // The worker has been fetched by now; the URL is no longer needed.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return {
    post: (msg) => w.postMessage(msg),
    onMessage: (fn) => {
      w.onmessage = (ev: MessageEvent<WorkerOut>) => fn(ev.data);
    },
    onFailure: (fn) => {
      w.onerror = (e) => {
        e.preventDefault();
        fn(e.message || "The audit worker failed to start.");
      };
    },
    terminate: () => w.terminate(),
  };
}
