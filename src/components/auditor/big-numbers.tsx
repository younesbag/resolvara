import type { AuditOptions, AuditReport } from "@/engine";
import { int, money, pct } from "./format";

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "accent" | "pass";
}) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium text-ink-2">{label}</p>
      <p
        className={`num-lg mt-1 text-5xl font-semibold leading-none sm:text-6xl ${
          tone === "accent" ? "text-accent" : tone === "pass" ? "text-pass" : "text-ink"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-2 text-sm text-ink-3">{note}</p>}
    </div>
  );
}

export function BigNumbers({ report, opts }: { report: AuditReport; opts: AuditOptions }) {
  const priceMissing = !(opts.pricePerResolution > 0);
  return (
    <div className="rise">
      <div className="grid gap-8 sm:grid-cols-2">
        <Stat
          label="Billed as resolved by the vendor"
          value={pct(report.billedRate)}
          note={`${int(report.billedJudged)} of ${int(report.judged)} judged AI conversations`}
        />
        <Stat
          label="Really resolved, of those billed"
          value={pct(report.billedStrictRate)}
          tone="pass"
          note={`${int(report.billedStrictPass)} of ${int(report.billedJudged)} billed resolutions pass the Strict Resolution Standard`}
        />
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-line pt-6 lg:grid-cols-4">
        <div>
          <dt className="text-sm font-medium text-ink-2">Phantom resolutions</dt>
          <dd className="num-lg mt-1 text-3xl font-semibold text-accent">{int(report.phantom)}</dd>
          <dd className="mt-1 text-sm text-ink-3">Billed but not strictly resolved</dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-2">Share of billed</dt>
          <dd className="num-lg mt-1 text-3xl font-semibold">{pct(report.phantomShareOfBilled)}</dd>
          <dd className="mt-1 text-sm text-ink-3">
            Of {int(report.billedJudged)} billed and judged. Pending and unverifiable left out
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-2">Dollars at risk</dt>
          <dd className="num-lg mt-1 text-3xl font-semibold">
            {priceMissing ? "Enter a price" : money(report.dollarsAtRisk)}
          </dd>
          <dd className="mt-1 text-sm text-ink-3">
            {priceMissing ? "Set the price per resolution below" : `At ${money(opts.pricePerResolution)} per resolution`}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-2">Overall strict rate</dt>
          <dd className="num-lg mt-1 text-3xl font-semibold">{pct(report.strictRate)}</dd>
          <dd className="mt-1 text-sm text-ink-3">
            {int(report.strictPass + report.confirmedPass)} of all {int(report.judged)} judged AI conversations pass the
            Standard ({int(report.confirmedPass)} with positive evidence), billed or not
          </dd>
          {report.confirmedPass > 0 && (
            <dd className="mt-1 text-sm text-ink-3">
              Positive evidence: {int(report.confirmedBy.vendorConfirmed)} vendor confirmed,{" "}
              {int(report.confirmedBy.positiveRating)} {report.confirmedBy.positiveRating === 1 ? "rating" : "ratings"}
              {report.confirmedBy.actionReceipt > 0 &&
                `, ${int(report.confirmedBy.actionReceipt)} ${report.confirmedBy.actionReceipt === 1 ? "receipt" : "receipts"}`}
              {report.confirmedBy.vendorConfirmed + report.confirmedBy.positiveRating + report.confirmedBy.actionReceipt >
                report.confirmedPass && " (one conversation can have several)"}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-sm font-medium text-ink-2">Not judged yet</dt>
          <dd className="num-lg mt-1 text-3xl font-semibold">{int(report.pending + report.unverifiable)}</dd>
          <dd className="mt-1 text-sm text-ink-3">
            {int(report.pending)} pending, {int(report.unverifiable)} unverifiable
          </dd>
        </div>
      </dl>
    </div>
  );
}
