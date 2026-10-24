// Zendesk API tickets -> engine Conversations. Runs in the worker; pure, no network.
// Field semantics follow the CSV preset (src/engine/parse.ts zendeskDraft) so an API audit and a
// CSV audit of the same tickets give the same report (tested in map.test.ts).
import type { Conversation, VendorState } from '@/engine';
import { zendeskTier } from '@/engine/presets';
import type { MapInput, MapStats, ResolutionFieldIds, ZMetricSet, ZTicket } from './types';

const TOPIC_MAX = 200;
// satisfaction_rating.score: "offered" / "unoffered" mean no answer.
const CSAT: Record<string, number> = { good: 1, bad: 0 };

export function findResolutionFields(
  fields: { id: number; key?: string | null; title?: string }[],
): ResolutionFieldIds {
  const find = (key: string, title: string) =>
    fields.find((f) => f.key === key)?.id ??
    fields.find((f) => (f.title ?? '').trim().toLowerCase() === title)?.id ??
    null;
  return {
    tier: find('standard::resolution_tier', 'resolution tier'),
    type: find('standard::resolution_type', 'resolution type'),
  };
}

function fieldValue(t: ZTicket, id: number | null): string {
  if (id === null) return '';
  const v = t.custom_fields?.find((f) => f.id === id)?.value;
  return v === null || v === undefined ? '' : String(v);
}

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function count(n: number | null | undefined): number | null {
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

export function toConversations(
  input: MapInput,
  hash: (raw: unknown) => string | null,
): { conversations: Conversation[]; stats: MapStats } {
  const start = Date.parse(input.periodStart);
  const metrics = new Map<number, ZMetricSet>();
  for (const m of input.metricSets) if (typeof m.ticket_id === 'number') metrics.set(m.ticket_id, m);

  // A ticket in both exports is AI-scoped; its fields come from whichever copy is newer, because
  // the two exports run minutes (or, after a resume, hours) apart.
  const aiIds = new Set(input.aiTickets.map((t) => t.id));
  const byId = new Map<number, { t: ZTicket; scoped: boolean }>();
  const newer = (a: ZTicket, b: ZTicket) => (Date.parse(b.updated_at ?? '') || 0) > (Date.parse(a.updated_at ?? '') || 0);
  for (const t of [...input.aiTickets, ...input.otherTickets]) {
    const prev = byId.get(t.id);
    if (!prev || newer(prev.t, t)) byId.set(t.id, { t, scoped: aiIds.has(t.id) });
  }

  const billedSet = input.billedIds ? new Set(input.billedIds) : null;
  const order = input.replyOrder ?? {};
  const pre = input.preDropped ?? 0;
  const stats: MapStats = {
    ticketsRead: byId.size + pre,
    droppedBeforePeriod: pre,
    droppedDeleted: 0,
    droppedNoDate: 0,
    aiConversations: 0,
    billedByTier: 0,
    billedByUsageCsv: billedSet ? 0 : null,
    usageCsvUnmatched: null,
    aiNotInUsageCsv: billedSet ? 0 : null,
    fieldsMissing: input.fields.tier === null && input.fields.type === null,
    replyOrderChecked: 0,
  };
  const aiInPeriod = new Set<number>();
  const conversations: Conversation[] = [];

  for (const { t, scoped } of byId.values()) {
    if (t.status === 'deleted') {
      stats.droppedDeleted += 1;
      continue;
    }
    const created = toDate(t.created_at);
    if (!created) {
      stats.droppedNoDate += 1;
      continue;
    }
    if (created.getTime() < start) {
      stats.droppedBeforePeriod += 1;
      continue;
    }

    const m = t.metric_set ?? metrics.get(t.id) ?? null;
    const tier = fieldValue(t, input.fields.tier);
    const type = fieldValue(t, input.fields.type);
    const z = zendeskTier(tier, type, (t.tags ?? []).join(' '));
    // A ticket from the AI-agent scope with no resolution fields yet (still open, say) is AI-handled
    // with an unknown state. Once Zendesk sets the tier, the tier decides, as in the CSV preset.
    const ai = z.ai || (scoped && tier === '' && type === '');
    const state: VendorState = !ai ? 'not_ai' : z.ai ? z.state : 'unknown';
    const tierBilled = ai && z.billed;
    let billed = tierBilled;
    if (billedSet) billed = ai && billedSet.has(t.id);
    if (ai) {
      stats.aiConversations += 1;
      aiInPeriod.add(t.id);
      if (tierBilled) stats.billedByTier += 1;
      if (billedSet && billed) stats.billedByUsageCsv = (stats.billedByUsageCsv ?? 0) + 1;
      if (billedSet && tierBilled && !billed) stats.aiNotInUsageCsv = (stats.aiNotInUsageCsv ?? 0) + 1;
    }

    // A checked comment order is a statement of the order; otherwise "replies" is a whole-ticket
    // count, kept apart like the CSV's "Agent replies".
    const checked = order[t.id];
    let humanReplied: boolean | null = null;
    let agentReplied: boolean | null | undefined;
    if (typeof checked === 'boolean') {
      humanReplied = checked;
      agentReplied = undefined;
      if (ai) stats.replyOrderChecked += 1;
    } else {
      const replies = count(m?.replies);
      agentReplied = replies === null ? null : replies > 0;
    }

    const score = (t.satisfaction_rating?.score ?? '').toLowerCase();
    const subject = (t.subject ?? '').trim();
    conversations.push({
      id: String(t.id),
      customerKey: hash(t.requester_id ?? null),
      createdAt: created,
      closedAt: toDate(m?.solved_at),
      aiInvolved: ai,
      vendorState: state,
      billed,
      humanReplied,
      agentReplied,
      reopenCount: count(m?.reopens),
      reopenedAt: null,
      csat: score in CSAT ? CSAT[score] : null,
      channel: t.via?.channel ?? null,
      topicText: subject ? subject.slice(0, TOPIC_MAX) : null,
    });
  }

  if (billedSet) {
    let unmatched = 0;
    for (const id of billedSet) if (!aiInPeriod.has(id)) unmatched += 1;
    stats.usageCsvUnmatched = unmatched;
  }
  return { conversations, stats };
}
