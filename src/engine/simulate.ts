// "Same conversations, different bills": how many of the audited conversations each vendor's
// PUBLISHED billing rule would count, using only fields the export has. Pure TS, no React or Next.
// Population = the report's judged AI conversations, so every row compares with the report's rates.
// Sources for every rule: content/vendors.json (a test keeps LIST_PRICES and CHECKED_AT in step).
import type { AuditReport, Conversation, VendorState } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAYS_PER_MONTH = 30.4375;

/** List prices in USD per billable conversation, from content/vendors.json (checked on CHECKED_AT). */
export const LIST_PRICES = { fin: 0.99, gorgias: 1.0, front: 0.89, hubspot: 0.5 } as const;
/** The `checkedAt` date of the vendor facts the rules below rely on. */
export const CHECKED_AT = '2026-10-24';
/** Fin's "customer came back" window. Intercom does not state one; third-party blogs say 24 hours. */
export const FIN_COMEBACK_HOURS = 24;
/** The window-free "3-day" rule used for the Zendesk upper bound (72 hours, as Zendesk's email end). */
export const ZENDESK_WINDOW_HOURS = 72;

export type SimKind = 'modelled' | 'upper_bound' | 'actual' | 'standard';
export type SimRuleId = 'actual' | 'fin' | 'gorgias' | 'front' | 'hubspot' | 'zendesk' | 'strict' | 'confirmed_only';

export interface SimRow {
  id: SimRuleId;
  label: string;
  vendors: string;
  ruleSummary: string;
  billable: number;
  /** billable / judged (0 when nothing was judged). */
  share: number;
  /** Price per billable conversation, or null when there is none to apply. */
  listPrice: number | null;
  /** billable * listPrice for this export, or null without a price. */
  dollars: number | null;
  kind: SimKind;
  caveat: string;
}

export interface BillSplit {
  /** Billed and judged: equals report.billedJudged. */
  billed: number;
  /** Billed with a fail signal (the report's phantom). */
  phantom: number;
  /** Billed, passes the Standard, but nothing positive backs it: the customer just stopped replying. */
  silenceOnly: number;
  /** Billed and passes with a positive rating or a vendor "confirmed" state. */
  positive: number;
  phantomShare: number;
  silenceOnlyShare: number;
  positiveShare: number;
}

export interface BillingSimulation {
  judged: number;
  rows: SimRow[];
  billSplit: BillSplit;
  /** Days of conversations the judged population covers (period minus the pending window), or null. */
  judgedDays: number | null;
  /** Multiply a total for this export by this to get a 30.4-day month. Null when under 7 days. */
  monthlyFactor: number | null;
  /** Table-level notes, e.g. when the export has no resolution-state column. */
  notes: string[];
}

const ESCALATED: ReadonlySet<VendorState> = new Set<VendorState>(['escalated', 'handoff', 'negative_feedback']);

const CLAIMED: ReadonlySet<VendorState> = new Set<VendorState>(['assumed', 'confirmed', 'verified', 'contained', 'billed_unknown']);

const PREFIX = "Modelled from the vendor's published rule using only your export's fields; not the vendor's own count. ";

export interface SimulateOptions {
  /** Override the list prices (tests). Defaults to LIST_PRICES. */
  prices?: Partial<Record<keyof typeof LIST_PRICES, number>>;
}

export function simulateBilling(
  convs: Conversation[],
  report: AuditReport,
  options: SimulateOptions = {},
): BillingSimulation {
  const prices = { ...LIST_PRICES, ...options.prices };
  const auditPrice = report.params.pricePerResolution > 0 ? report.params.pricePerResolution : null;
  const countAgent = report.params.countAgentReplies;

  // Same population as the audit: first row per id wins, rows without a usable date are dropped.
  const byId = new Map<string, Conversation>();
  const times = new Map<string, number[]>(); // customer -> sorted creation times (all conversations)
  for (const c of convs) {
    if (byId.has(c.id) || Number.isNaN(c.createdAt.getTime())) continue;
    byId.set(c.id, c);
    if (c.customerKey !== null) {
      const a = times.get(c.customerKey);
      if (a) a.push(c.createdAt.getTime());
      else times.set(c.customerKey, [c.createdAt.getTime()]);
    }
  }
  for (const a of times.values()) a.sort((x, y) => x - y);

  /** The same customer opened another conversation later, within `ms` (inclusive, as the audit does). */
  const cameBack = (c: Conversation, ms: number): boolean => {
    if (c.customerKey === null) return false;
    const a = times.get(c.customerKey);
    if (!a) return false;
    const t = c.createdAt.getTime();
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo < a.length && a[lo] - t <= ms;
  };

  // Every vendor rule starts from "the AI marked it resolved". A billed row always counts as claimed.
  // Without any resolution-state data (generic exports) every non-escalated AI conversation stands in.
  let hasState = false;
  for (const r of report.results) {
    if (r.verdict === 'pending_window' || r.verdict === 'unverifiable') continue;
    const st = byId.get(r.id)?.vendorState;
    if (st !== undefined && st !== 'unknown' && st !== 'not_ai') {
      hasState = true;
      break;
    }
  }
  const claimed = (c: Conversation) =>
    c.billed || (hasState ? CLAIMED.has(c.vendorState) : !ESCALATED.has(c.vendorState));

  const humanReplied = (c: Conversation) => c.humanReplied === true || (countAgent && c.agentReplied === true);
  const escalated = (c: Conversation) => ESCALATED.has(c.vendorState);

  let judged = 0;
  let strict = 0;
  let confirmed = 0;
  let fin = 0;
  let noHuman = 0;
  let hubspot = 0;
  let zendesk = 0;
  let billedJudged = 0;
  let phantom = 0;
  let silenceOnly = 0;
  let positive = 0;

  for (const r of report.results) {
    if (r.verdict === 'pending_window' || r.verdict === 'unverifiable') continue;
    const c = byId.get(r.id);
    if (!c) continue;
    judged += 1;
    const isConfirmed = r.verdict === 'confirmed_pass';
    const isStrict = r.verdict === 'strict_pass';
    // Compare like with like: the Standard rows cover the same conversations the vendor rules start
    // from (the AI marked them resolved), so a silent conversation the AI never claimed is not a "pass".
    if (isStrict && claimed(c)) strict += 1;
    if (isConfirmed && claimed(c)) confirmed += 1;
    if (c.billed) {
      billedJudged += 1;
      if (r.verdict === 'phantom') phantom += 1;
      else if (isConfirmed) positive += 1;
      else if (isStrict) silenceOnly += 1;
    }

    const esc = escalated(c) || !claimed(c);
    const human = humanReplied(c);
    if (!esc) hubspot += 1;
    if (!esc && !human) {
      noHuman += 1;
      if (!cameBack(c, FIN_COMEBACK_HOURS * HOUR)) fin += 1;
      const reopened = c.reopenedAt
        ? c.reopenedAt.getTime() - c.createdAt.getTime() <= ZENDESK_WINDOW_HOURS * HOUR
        : c.reopenCount !== null && c.reopenCount > 0;
      if (!reopened && !cameBack(c, ZENDESK_WINDOW_HOURS * HOUR)) zendesk += 1;
    }
  }

  const share = (n: number) => (judged > 0 ? n / judged : 0);
  const row = (
    id: SimRuleId,
    label: string,
    vendors: string,
    ruleSummary: string,
    billable: number,
    listPrice: number | null,
    kind: SimKind,
    caveat: string,
  ): SimRow => ({
    id,
    label,
    vendors,
    ruleSummary,
    billable,
    share: share(billable),
    listPrice,
    dollars: listPrice === null ? null : billable * listPrice,
    kind,
    caveat,
  });

  const rows: SimRow[] = [
    row(
      'actual',
      'What your vendor billed',
      'Your vendor',
      'Conversations your export marks as billed.',
      billedJudged,
      auditPrice,
      'actual',
      auditPrice === null
        ? 'Set a price per resolution in the options to see dollars.'
        : 'Priced at the price per resolution you set in the options.',
    ),
    row(
      'fin',
      'Intercom Fin',
      'Intercom',
      'The AI marked it resolved, no escalation, no human reply, and the customer did not come back within 24 hours. Silence counts.',
      fin,
      prices.fin,
      'modelled',
      `${PREFIX}Per Intercom docs, checked ${CHECKED_AT}, Fin deducts a resolution when the customer comes back seeking help. Intercom does not state the window; 24 hours comes from third-party blogs and is unconfirmed. A minimum monthly commitment applies to the real invoice.`,
    ),
    row(
      'gorgias',
      'Gorgias AI Agent',
      'Gorgias',
      'The AI marked it resolved, with no human reply and no escalation. A repeat contact does not remove it. Silence counts.',
      noHuman,
      prices.gorgias,
      'modelled',
      `${PREFIX}Per Gorgias docs, checked ${CHECKED_AT}, a human reply within 72 hours makes it a ticket instead. The export cannot show whether a reply fell inside 72 hours, so any human reply excludes it here. $1.00 is the monthly-plan price; annual plans are $0.90.`,
    ),
    row(
      'front',
      'Front',
      'Front',
      'Same signals as Gorgias: the AI marked it resolved, no teammate follow-up, no escalation. Only the price differs.',
      noHuman,
      prices.front,
      'modelled',
      `${PREFIX}Per Front docs, checked ${CHECKED_AT}, a conversation reaches the Resolution level when no teammate follows up within 24 hours (chat) or 72 hours (email). The export cannot show the timing of a reply, so any human reply excludes it here.`,
    ),
    row(
      'hubspot',
      'HubSpot Customer Agent',
      'HubSpot',
      'The AI marked it resolved and the visitor was not handed to a human. A human who picks it up later does not remove it.',
      hubspot,
      prices.hubspot,
      'modelled',
      `${PREFIX}Per HubSpot docs, checked ${CHECKED_AT}, only visitor-initiated handoffs disqualify; manual assignment does not. An export shows only the vendor's escalation state, so human replies are ignored here.`,
    ),
    row(
      'zendesk',
      'Zendesk Verified',
      'Zendesk',
      'The AI marked it resolved and it passes every condition an export can show: no escalation, no human reply, no reopen, no repeat contact within 3 days.',
      zendesk,
      null,
      'upper_bound',
      `Upper bound, not a count. Per Zendesk docs, checked ${CHECKED_AT}, Verified also needs an LLM review of the ended conversation, which cannot be reproduced from an export. Zendesk publishes no per-resolution price, so no dollars are shown.`,
    ),
    row(
      'strict',
      'Strict Resolution Standard',
      'The Standard',
      `The AI marked it resolved and it shows no fail signal inside your ${report.params.windowDays}-day window: no human reply, reopen, repeat contact, negative rating or escalation.`,
      strict + confirmed,
      auditPrice,
      'standard',
      'Of the judged conversations the AI marked resolved, billed or not, those that pass the Standard. Priced at your price per resolution for comparison.',
    ),
    row(
      'confirmed_only',
      'Only with positive evidence',
      'The Standard, floor',
      'The AI marked it resolved, it passes the Standard, and it has positive evidence: a positive rating, a vendor "confirmed" state or an action receipt. Nothing rests on silence.',
      confirmed,
      auditPrice,
      'standard',
      'The floor: conversations where the customer, or the vendor, said it worked. Priced at your price per resolution for comparison.',
    ),
  ];

  const frac = (n: number) => (billedJudged > 0 ? n / billedJudged : 0);
  const billSplit: BillSplit = {
    billed: billedJudged,
    phantom,
    silenceOnly,
    positive,
    phantomShare: frac(phantom),
    silenceOnlyShare: frac(silenceOnly),
    positiveShare: frac(positive),
  };

  const spanDays = (report.period.end.getTime() - report.period.start.getTime()) / DAY - report.params.windowDays;
  const judgedDays = Number.isFinite(spanDays) && spanDays > 0 ? spanDays : null;
  const monthlyFactor = judgedDays !== null && judgedDays >= 7 ? DAYS_PER_MONTH / judgedDays : null;

  const notes = hasState || judged === 0
    ? []
    : ['Your export has no resolution-state column, so every non-escalated AI conversation is treated as an answered one.'];
  return { judged, rows, billSplit, judgedDays, monthlyFactor, notes };
}

/** The headline sentence for the bill split, or null when nothing billed was judged. */
export function billSplitSentence(s: BillSplit): string | null {
  if (s.billed <= 0) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return `${pct(s.silenceOnlyShare)} of what you were billed rests on silence alone: the customer stopped replying and nothing else. Another ${pct(s.phantomShare)} shows a fail signal, and ${pct(s.positiveShare)} has positive evidence.`;
}
