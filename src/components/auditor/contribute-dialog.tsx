"use client";

import { useState } from "react";
import { CheckCircle, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { CONTRIBUTION_VENDORS, type Contribution, type ContributionVendor } from "@/engine";
import { Modal } from "../modal";
import { CONTRIBUTION_VENDOR_LABEL } from "./meta";

type Status = "idle" | "sending" | "done" | "error";

export function ContributeDialog({
  open,
  payload,
  onClose,
}: {
  open: boolean;
  payload: Contribution | null;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [vendorPick, setVendorPick] = useState<ContributionVendor | null>(null);

  // The vendor is chosen from a fixed list, never typed. Everything else is exactly what the engine built.
  const outgoing: Contribution | null = payload ? { ...payload, vendor: vendorPick ?? payload.vendor } : null;
  const json = outgoing ? JSON.stringify(outgoing, null, 2) : "";

  async function send() {
    if (!outgoing) return;
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(outgoing),
      });
      if (res.ok) {
        setStatus("done");
      } else {
        setStatus("error");
        setMessage(
          res.status === 429
            ? "Too many contributions from this connection. Try again in an hour."
            : res.status === 404
              ? "The contribution endpoint is not live on this deployment yet. Nothing was sent."
              : `The server rejected the contribution (status ${res.status}). Nothing was stored.`,
        );
      }
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Nothing was sent.");
    }
  }

  function close() {
    onClose();
    // reset after the close animation frame so a re-open starts clean
    setTimeout(() => setStatus("idle"), 150);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Contribute anonymously"
      description="This is the complete message. Nothing else is sent."
    >
      {status === "done" ? (
        <div className="flex items-start gap-3">
          <CheckCircle size={26} weight="bold" className="mt-0.5 shrink-0 text-pass" />
          <div>
            <p className="font-semibold">Thank you. The aggregate was received.</p>
            <p className="mt-1 text-sm text-ink-2">
              It joins the community benchmark. A vendor shows up there only after 30 contributions.
            </p>
            <Link href="/benchmark" className="mt-3 inline-block text-sm font-medium underline underline-offset-2">
              See the benchmark
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <label htmlFor="contribute-vendor" className="field-label">
              Which vendor is this?
            </label>
            <select
              id="contribute-vendor"
              className="field"
              value={vendorPick ?? payload?.vendor ?? "other"}
              onChange={(e) => setVendorPick(e.target.value as ContributionVendor)}
            >
              {CONTRIBUTION_VENDORS.map((v) => (
                <option key={v} value={v}>
                  {CONTRIBUTION_VENDOR_LABEL[v]}
                </option>
              ))}
            </select>
            <p className="field-help">Picked from a fixed list so no free text is ever sent.</p>
          </div>
          <pre
            tabIndex={0}
            aria-label="The exact JSON that will be sent"
            className="num max-h-72 overflow-auto rounded-[var(--radius)] border border-line bg-surface-2 p-4 text-[0.8125rem] leading-6 text-ink"
          >
            {json}
          </pre>
          <ul className="space-y-1.5 text-sm text-ink-2">
            <li>Rates, buckets and shares only. No conversation IDs, customer data or text.</li>
            <li>It is stored as one anonymous record. You can read the code that handles it.</li>
            <li>
              Details are on the{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                privacy page
              </Link>
              .
            </li>
          </ul>
          {status === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-[var(--radius)] bg-accent-soft p-3 text-sm text-accent-ink">
              <Warning size={18} weight="bold" className="mt-0.5 shrink-0" />
              {message}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
            <button type="button" className="btn btn-secondary" onClick={close}>
              Keep it private
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={send}
              disabled={!outgoing || status === "sending"}
            >
              {status === "sending" ? "Sending" : "Send these numbers"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
