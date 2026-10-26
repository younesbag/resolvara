// The Strict Resolution Standard v0.2 classifier (content/standard.md, docs/SPEC.md).
import { TOPIC_THRESHOLD, TopicIndex } from './topic';
import { CURRENT_STANDARD_VERSION } from './types';
import type {
  AuditOptions,
  AuditParams,
  AuditReport,
  ConfirmedBy,
  Conversation,
  ConvResult,
  Preset,
  Reason,
  Verdict,
} from './types';

const DAY = 86_400_000;
export const SENSITIVITY_WINDOWS = [1, 3, 7, 14, 30] as const;
/** Normalised CSAT at or above this counts as an explicit positive rating (4 or 5 on a 1-5 scale). */
export const POSITIVE_RATING = 0.75;

// Bit flags per reason.
const B_HUMAN = 1;
const B_REOPEN = 2;
const B_REPEAT = 4;
const B_CSAT = 8;
const B_VENDOR = 16;
const BIT_TO_REASON: [number, Reason][] = [
  [B_REPEAT, 'repeat_contact'],
  [B_HUMAN, 'human_handoff'],
  [B_REOPEN, 'reopened'],
  [B_CSAT, 'negative_csat'],
  [B_VENDOR, 'vendor_escalated'],
];

const ESCALATED = new Set(['escalated', 'handoff', 'negative_feedback']);

function emptyReasons(): Record<Reason, number> {
  return { human_handoff: 0, reopened: 0, repeat_contact: 0, negative_csat: 0, vendor_escalated: 0 };
}

function weekStart(ms: number): string {
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

interface Counts {
  pending: number;
  unverifiable: number;
  strictPass: number;
  confirmedPass: number;
  confirmedBy: ConfirmedBy;
  phantom: number;
  failUnbilled: number;
  billedJudged: number;
}

export function audit(convs: Conversation[], opts: AuditOptions, preset: Preset): AuditReport {
  const windowDays = Number.isFinite(opts.windowDays) && opts.windowDays > 0 ? opts.windowDays : 7;
  const price = Number.isFinite(opts.pricePerResolution) && opts.pricePerResolution > 0 ? opts.pricePerResolution : 0;
  const csatThreshold = Number.isFinite(opts.negativeCsatThreshold) ? opts.negativeCsatThreshold : 0.4;
  const countAgentReplies = opts.countAgentReplies === true;
  const params: AuditParams = {
    windowDays,
    pricePerResolution: price,
    negativeCsatThreshold: csatThreshold,
    sameTopicOnly: opts.sameTopicOnly === true,
    countAgentReplies,
  };
  const warnings: string[] = [];

  // Deduplicate by id (first row wins) and drop rows without a usable date.
  const seen = new Set<string>();
  const list: Conversation[] = [];
  let skipped = 0;
  for (const c of convs) {
    if (seen.has(c.id) || Number.isNaN(c.createdAt.getTime())) {
      skipped += 1;
      continue;
    }
    seen.add(c.id);
    list.push(c);
  }
  const n = list.length;
  const t = new Float64Array(n);
  let maxT = -Infinity;
  let minT = Infinity;
  for (let i = 0; i < n; i++) {
    t[i] = list[i].createdAt.getTime();
    if (t[i] > maxT) maxT = t[i];
    if (t[i] < minT) minT = t[i];
  }
  const exportEnd = opts.exportEnd ? opts.exportEnd.getTime() : n > 0 ? maxT : 0;

  // Customer groups, ordered by time. A "next contact" is the nearest strictly later conversation
  // by the same customer, AI-handled or not, billed or not (Standard section 4).
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = list[i].customerKey;
    if (k === null) continue;
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  const nextIdx = new Int32Array(n).fill(-1);
  const grpOf = new Int32Array(n).fill(-1);
  const posIn = new Int32Array(n).fill(-1);
  const grpList: number[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => t[a] - t[b]);
    const gi = grpList.length;
    grpList.push(g);
    for (let p = 0; p < g.length; p++) {
      grpOf[g[p]] = gi;
      posIn[g[p]] = p;
    }
    for (let p = g.length - 2; p >= 0; p--) {
      const i = g[p];
      const j = g[p + 1];
      nextIdx[i] = t[j] > t[i] ? j : nextIdx[j];
    }
  }

  // W-independent signals.
  const ai: number[] = [];
  const base = new Uint8Array(n);
  // Reopen timestamps, where the export has them: judged against the window like repeat contact.
  const reopenAt = new Float64Array(n).fill(NaN);
  let billed = 0;
  let noKey = 0;
  let humanKnown = 0;
  let agentKnown = 0;
  let agentUnordered = 0; // AI conversations with an agent reply whose order after the AI is unknown
  let reopenKnown = 0;
  let csatKnown = 0;
  for (let i = 0; i < n; i++) {
    const c = list[i];
    if (!c.aiInvolved) continue;
    ai.push(i);
    if (c.billed) billed += 1;
    let m = 0;
    if (ESCALATED.has(c.vendorState)) m |= B_VENDOR;
    if (c.humanReplied === true) m |= B_HUMAN;
    else if (c.agentReplied === true) {
      agentUnordered += 1;
      if (countAgentReplies) m |= B_HUMAN;
    }
    const ra = c.reopenedAt ? c.reopenedAt.getTime() : NaN;
    if (!Number.isNaN(ra)) reopenAt[i] = ra;
    else if (c.reopenCount !== null && c.reopenCount > 0) m |= B_REOPEN;
    if (c.csat !== null && c.csat < csatThreshold) m |= B_CSAT;
    base[i] = m;
    if (c.customerKey === null) noKey += 1;
    if (c.humanReplied !== null) humanKnown += 1;
    if (c.agentReplied !== undefined && c.agentReplied !== null) agentKnown += 1;
    if (c.reopenCount !== null || !Number.isNaN(ra)) reopenKnown += 1;
    if (c.csat !== null) csatKnown += 1;
  }

  let topics: TopicIndex | null = null;
  if (opts.sameTopicOnly) {
    topics = new TopicIndex(list.map((c) => c.topicText));
    if (topics.withText === 0) {
      warnings.push('The same-topic filter is on, but no conversation has topic text, so no repeat contact is counted.');
    }
  }

  /** Index of the first later conversation by the same customer inside (t, t + W], or -1. */
  const repeatOf = (i: number, wMs: number): number => {
    const j = nextIdx[i];
    if (j < 0 || t[j] - t[i] > wMs) return -1;
    if (!topics) return j;
    const g = grpList[grpOf[i]];
    for (let p = posIn[j]; p < g.length; p++) {
      const o = g[p];
      if (t[o] - t[i] > wMs) break;
      if (topics.similarity(i, o) >= TOPIC_THRESHOLD) return o;
    }
    return -1;
  };

  const classify = (w: number, detail: boolean) => {
    const wMs = w * DAY;
    const cutoff = exportEnd - wMs;
    const p: Counts = {
      pending: 0,
      unverifiable: 0,
      strictPass: 0,
      confirmedPass: 0,
      confirmedBy: { vendorConfirmed: 0, positiveRating: 0, actionReceipt: 0 },
      phantom: 0,
      failUnbilled: 0,
      billedJudged: 0,
    };
    const results: ConvResult[] = [];
    const byReason = emptyReasons();
    const weeks = new Map<string, { billed: number; phantom: number; strictPass: number }>();

    for (const i of ai) {
      const c = list[i];
      let verdict: Verdict;
      let mask = 0;
      let other = -1;
      if (t[i] > cutoff) {
        verdict = 'pending_window';
        p.pending += 1;
      } else {
        mask = base[i];
        if (!Number.isNaN(reopenAt[i]) && reopenAt[i] - t[i] <= wMs) mask |= B_REOPEN;
        if (c.customerKey !== null) {
          other = repeatOf(i, wMs);
          if (other >= 0) mask |= B_REPEAT;
        }
        if (mask !== 0) {
          if (c.billed) {
            verdict = 'phantom';
            p.phantom += 1;
            p.billedJudged += 1;
          } else {
            verdict = 'fail_unbilled';
            p.failUnbilled += 1;
          }
        } else if (c.customerKey === null) {
          // Without a customer key the repeat-contact test cannot run, so a pass cannot be shown.
          verdict = 'unverifiable';
          p.unverifiable += 1;
        } else {
          if (c.billed) p.billedJudged += 1;
          // Positive evidence (Standard section 3): vendor confirmed, explicit positive rating, or an
          // action receipt. Each source is counted on its own; the conversation counts once as confirmed.
          const vendorOk = c.vendorState === 'confirmed';
          const ratingOk = c.csat !== null && c.csat >= POSITIVE_RATING;
          const receiptOk = c.actionReceipt === true;
          if (vendorOk || ratingOk || receiptOk) {
            verdict = 'confirmed_pass';
            p.confirmedPass += 1;
            if (vendorOk) p.confirmedBy.vendorConfirmed += 1;
            if (ratingOk) p.confirmedBy.positiveRating += 1;
            if (receiptOk) p.confirmedBy.actionReceipt += 1;
          } else {
            verdict = 'strict_pass';
            p.strictPass += 1;
          }
        }
      }

      if (!detail) continue;
      const reasons: Reason[] = [];
      const evidence: string[] = [];
      if (mask !== 0) {
        for (const [bit, reason] of BIT_TO_REASON) {
          if (!(mask & bit)) continue;
          reasons.push(reason);
          if (verdict === 'phantom') byReason[reason] += 1;
          if (reason === 'repeat_contact') {
            const gap = ((t[other] - t[i]) / DAY).toFixed(1);
            evidence.push(`The same customer opened conversation ${list[other].id} ${gap} days later.`);
          } else if (reason === 'human_handoff') {
            evidence.push(
              c.humanReplied === true
                ? 'A human replied after the AI in this conversation.'
                : 'An agent replied in this conversation. The export cannot show whether it came after the AI; it is counted because you turned that option on.',
            );
          } else if (reason === 'reopened') {
            evidence.push(
              !Number.isNaN(reopenAt[i])
                ? `Reopened ${Math.max(0, (reopenAt[i] - t[i]) / DAY).toFixed(1)} days after it started.`
                : `Reopened ${c.reopenCount} ${c.reopenCount === 1 ? 'time' : 'times'}.`,
            );
          } else if (reason === 'negative_csat') {
            evidence.push(
              `Satisfaction ${(c.csat as number).toFixed(2)} on a 0 to 1 scale, below the ${csatThreshold} threshold.`,
            );
          } else {
            evidence.push(`The vendor's own state for this conversation is "${c.vendorState}".`);
          }
        }
      }
      results.push({ id: c.id, verdict, reasons, evidence });

      const wk = weekStart(t[i]);
      let b = weeks.get(wk);
      if (!b) {
        b = { billed: 0, phantom: 0, strictPass: 0 };
        weeks.set(wk, b);
      }
      if (c.billed) b.billed += 1;
      if (verdict === 'phantom') b.phantom += 1;
      if (verdict === 'strict_pass' || verdict === 'confirmed_pass') b.strictPass += 1;
    }
    return { p, results, byReason, weeks };
  };

  const rate = (num: number, den: number) => (den > 0 ? num / den : 0);
  const main = classify(windowDays, true);
  const p = main.p;
  const aiCount = ai.length;
  const judged = aiCount - p.pending - p.unverifiable;

  const sensitivity = SENSITIVITY_WINDOWS.map((w) => {
    const r = w === windowDays ? main.p : classify(w, false).p;
    const j = aiCount - r.pending - r.unverifiable;
    return { windowDays: w, phantom: r.phantom, strictRate: rate(r.strictPass + r.confirmedPass, j) };
  });

  if (aiCount === 0) {
    warnings.push('No AI conversations were found in this file.');
  } else {
    if (p.pending === aiCount) {
      warnings.push(`Every AI conversation is inside the newest ${windowDays} days, so none can be judged yet.`);
    }
    if (noKey > 0) {
      warnings.push(
        `${noKey} of ${aiCount} AI conversations have no customer identifier. Repeat contact cannot be checked for them, and those without another fail signal are reported as unverifiable.`,
      );
    }
    if (agentUnordered > 0 && !countAgentReplies) {
      warnings.push(
        `${agentUnordered} AI conversations have an agent reply, but this export cannot show that the reply came after the AI took part, so the human_handoff signal is off for them. Turn on "Count agent replies as human handoff (cannot confirm order)" to include them, knowing some of those replies may predate the AI.`,
      );
    } else if (agentUnordered > 0) {
      warnings.push(
        `Agent replies are counted as human_handoff for ${agentUnordered} AI conversations, as you chose. The export cannot show that these replies came after the AI took part, so some may be false positives.`,
      );
    }
    if (humanKnown === 0 && agentKnown === 0) {
      warnings.push('No human-reply data was found, so the human_handoff signal is unavailable.');
    }
    if (reopenKnown === 0) warnings.push('No reopen data was found, so the reopened signal is unavailable.');
    if (csatKnown === 0) warnings.push('No satisfaction scores were found, so the negative_csat signal is unavailable.');
    if (billed === 0) {
      warnings.push('No conversation is marked as billed, so there are no phantom resolutions and no dollars at risk.');
    }
  }
  if (skipped > 0) warnings.push(`${skipped} rows were ignored (duplicate ids or no usable date).`);

  const weekly = [...main.weeks.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([wk, v]) => ({ weekStart: wk, ...v }));

  return {
    standardVersion: CURRENT_STANDARD_VERSION,
    preset,
    params,
    rowsRead: convs.length,
    rowsSkipped: skipped,
    warnings,
    period: { start: new Date(n > 0 ? minT : exportEnd), end: new Date(exportEnd) },
    aiConversations: aiCount,
    billed,
    judged,
    billedJudged: p.billedJudged,
    billedRate: rate(p.billedJudged, judged),
    verifiable: judged,
    strictPass: p.strictPass,
    confirmedPass: p.confirmedPass,
    confirmedBy: p.confirmedBy,
    phantom: p.phantom,
    failUnbilled: p.failUnbilled,
    pending: p.pending,
    unverifiable: p.unverifiable,
    strictRate: rate(p.strictPass + p.confirmedPass, judged),
    phantomShareOfBilled: rate(p.phantom, p.billedJudged),
    billedStrictPass: p.billedJudged - p.phantom,
    billedStrictRate: rate(p.billedJudged - p.phantom, p.billedJudged),
    dollarsAtRisk: p.phantom * price,
    byReason: main.byReason,
    weekly,
    sensitivity,
    results: main.results,
  };
}
