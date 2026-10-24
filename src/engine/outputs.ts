// Outputs: dispute CSV, summary + email text, anonymous contribution payload.
import { SENSITIVITY_WINDOWS } from './audit';
import type {
  AuditOptions,
  AuditReport,
  Contribution,
  ContributionVendor,
  Conversation,
  Preset,
  Reason,
} from './types';

const DAY = 86_400_000;

const REASON_TEXT: Record<Reason, string> = {
  repeat_contact: 'Same customer came back',
  human_handoff: 'A human replied after the AI',
  reopened: 'Reopened',
  negative_csat: 'Negative CSAT',
  vendor_escalated: 'Vendor marked it escalated',
};
const REASON_ORDER: Reason[] = ['repeat_contact', 'human_handoff', 'reopened', 'negative_csat', 'vendor_escalated'];

// ---------------------------------------------------------------------------
// Dispute CSV
// ---------------------------------------------------------------------------

/** One CSV cell. Quoted; a leading = + - @ tab or CR is defused so spreadsheets do not run it. */
function cell(value: string): string {
  let v = value.replace(/[\r\n]+/g, ' ');
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export function toDisputeCsv(report: AuditReport, convs: Conversation[]): string {
  const byId = new Map<string, Conversation>();
  for (const c of convs) if (!byId.has(c.id)) byId.set(c.id, c);
  const rows = ['conversation_id,created_at_utc,channel,reasons,evidence'];
  for (const r of report.results) {
    if (r.verdict !== 'phantom') continue;
    const c = byId.get(r.id);
    rows.push(
      [
        cell(r.id),
        cell(c ? c.createdAt.toISOString() : ''),
        cell(c?.channel ?? ''),
        cell(r.reasons.map((x) => REASON_TEXT[x]).join('; ')),
        cell(r.evidence.join(' ')),
      ].join(','),
    );
  }
  return rows.join('\r\n') + '\r\n';
}

// ---------------------------------------------------------------------------
// Summary and email template
// ---------------------------------------------------------------------------

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
/** Money with at least 2 and at most 4 decimals, so a price like 0.995 and its total are shown unrounded. */
function money(x: number): string {
  const [whole, frac = ''] = x.toFixed(4).split('.');
  return `$${whole}.${frac.replace(/0+$/, '').padEnd(2, '0')}`;
}
const day = (d: Date) => (Number.isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10));

/**
 * The parameters printed here are the ones the audit used (`report.params`), not the caller's raw
 * options: the audit replaces an invalid window or threshold. `opts` is kept for older callers.
 */
export function disputeSummaryText(report: AuditReport, opts: AuditOptions | undefined, vendorName: string): string {
  void opts;
  const vendor = vendorName.trim() || 'the vendor';
  const { windowDays: w, negativeCsatThreshold, sameTopicOnly, countAgentReplies } = report.params;
  const price = report.params.pricePerResolution > 0 ? money(report.params.pricePerResolution) : null;
  const reasons = REASON_ORDER.filter((r) => report.byReason[r] > 0)
    .map((r) => `  - ${REASON_TEXT[r]}: ${report.byReason[r]}`)
    .join('\n');

  const lines = [
    `Resolvara audit summary`,
    `Standard: The Strict Resolution Standard, version ${report.standardVersion}`,
    `Vendor: ${vendor}`,
    `Period: ${day(report.period.start)} to ${day(report.period.end)} (UTC)`,
    `Parameters: ${w}-day window, negative CSAT below ${negativeCsatThreshold.toFixed(2)}, same-topic filter ${sameTopicOnly ? 'on' : 'off'}${report.preset === 'zendesk' || countAgentReplies ? `, agent replies counted as human handoff ${countAgentReplies ? 'on (order after the AI not confirmed)' : 'off'}` : ''}`,
    ``,
    `AI conversations: ${report.aiConversations}`,
    `Judged (old enough, and with a customer key or a fail signal): ${report.judged}`,
    `Left out: ${report.pending} pending (newest ${w} days), ${report.unverifiable} unverifiable`,
    `Billed as resolved: ${report.billedJudged} of ${report.judged} judged (${pct(report.billedRate)})`,
    `Strictly resolved: ${report.strictPass + report.confirmedPass} of ${report.judged} judged (${pct(report.strictRate)})`,
    `Phantom resolutions (billed but not strictly resolved): ${report.phantom}, ${pct(report.phantomShareOfBilled)} of the billed ones that were judged`,
    price
      ? `Amount in question: ${report.phantom} x ${price} = ${money(report.dollarsAtRisk)}`
      : `Amount in question: price per resolution not set`,
  ];
  if (reasons) lines.push(``, `Why they failed (a conversation can have several reasons):`, reasons);
  lines.push(
    ``,
    `Sensitivity to the window:`,
    ...SENSITIVITY_WINDOWS.map((d) => {
      const s = report.sensitivity.find((x) => x.windowDays === d);
      const unit = d === 1 ? 'day' : 'days';
      return s ? `  - ${d} ${unit}: ${s.phantom} phantom, strict rate ${pct(s.strictRate)}` : `  - ${d} ${unit}: n/a`;
    }),
    ``,
    `Read this as evidence, not as a finding. Repeat contact can be a different issue, and a conversation can be billed correctly under the contract and still fail the Standard.`,
    ``,
    `----- Email draft -----`,
    `Subject: Request to review billed AI resolutions (${day(report.period.start)} to ${day(report.period.end)})`,
    ``,
    `Hello,`,
    ``,
    `We reviewed our ${vendor} AI agent conversations for ${day(report.period.start)} to ${day(report.period.end)} against a stricter public definition of a resolution (The Strict Resolution Standard, version ${report.standardVersion}, ${w}-day window).`,
    ``,
    `${report.phantom} of ${report.billedJudged} billed resolutions that we could judge show at least one sign that the issue was not resolved: a repeat contact from the same customer, a human reply after the AI, a reopen, a low satisfaction score, or an escalation state.${price ? ` At ${price} per resolution that is ${money(report.dollarsAtRisk)}.` : ''}`,
    ``,
    `We have attached the list of conversations with the reason for each. Could you review them and tell us which you consider billable under our agreement, and credit the ones that are not? We are happy to go through examples together.`,
    ``,
    `Thank you,`,
    `[Your name]`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Contribution payload
// ---------------------------------------------------------------------------

export function vendorForPreset(preset: Preset): ContributionVendor {
  return preset === 'generic' ? 'other' : preset;
}

function bucket(n: number): Contribution['aiConversationsBucket'] {
  if (n < 1000) return '<1k';
  if (n < 10_000) return '1k-10k';
  if (n < 100_000) return '10k-100k';
  return '>100k';
}

const unit = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Aggregates only: no ids, keys, text or timestamps. `vendor` defaults to the preset's vendor.
 * The window comes from `report.params`, the one the audit used. The community benchmark groups
 * results by whole-day windows, so a fractional window is rejected rather than rounded into a
 * different bucket. (`opts` is kept for older callers.)
 */
export function contributionPayload(
  report: AuditReport,
  opts?: AuditOptions,
  vendor?: ContributionVendor,
): Contribution {
  void opts;
  const windowDays = report.params.windowDays;
  if (!Number.isInteger(windowDays)) {
    throw new RangeError(`The contribution needs a whole number of days for the window, not ${windowDays}.`);
  }
  const span = (report.period.end.getTime() - report.period.start.getTime()) / DAY;
  const share = (r: Reason) => (report.phantom > 0 ? unit(report.byReason[r] / report.phantom) : 0);
  return {
    standardVersion: report.standardVersion,
    preset: report.preset,
    vendor: vendor ?? vendorForPreset(report.preset),
    periodDays: Number.isFinite(span) ? Math.min(3650, Math.max(1, Math.ceil(span))) : 1,
    aiConversationsBucket: bucket(report.aiConversations),
    billedRate: unit(report.billedRate),
    strictRate: unit(report.strictRate),
    phantomShareOfBilled: unit(report.phantomShareOfBilled),
    windowDays: Math.min(365, Math.max(1, windowDays)),
    byReasonShare: {
      human_handoff: share('human_handoff'),
      reopened: share('reopened'),
      repeat_contact: share('repeat_contact'),
      negative_csat: share('negative_csat'),
      vendor_escalated: share('vendor_escalated'),
    },
  };
}
