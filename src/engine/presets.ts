// Vendor presets: which columns/keys to read and how to turn a row into canonical fields.
// Only names confirmed in docs/research/vendor-facts.md are used as exact keys. Where the
// vendor's CSV headers are unconfirmed, columns are matched fuzzily and the mapper can override.
import type { Preset, VendorState } from './types';

export type FieldKey =
  | 'id'
  | 'created'
  | 'closed'
  | 'customer'
  | 'ai'
  | 'billed'
  | 'state'
  | 'human'
  | 'reopens'
  | 'reopenAt'
  | 'csat'
  | 'csat2'
  | 'topic'
  | 'channel'
  | 'tier'
  | 'type'
  | 'tags'
  | 'classification'
  | 'escalated'
  | 'handoffs'
  | 'agentMsgs'
  | 'agentId'
  | 'handleTime'
  | 'isTest'
  | 'adminReplyAt'
  | 'aiStartedAt';

export type Candidates = Partial<Record<FieldKey, string[]>>;

/** Mapper keys (ColumnMapping) -> the field each one overrides. */
export const MAPPING_KEYS: Record<string, FieldKey> = {
  id: 'id',
  createdAt: 'created',
  closedAt: 'closed',
  customerKey: 'customer',
  billed: 'billed',
  aiInvolved: 'ai',
  humanReplied: 'human',
  reopenCount: 'reopens',
  reopenedAt: 'reopenAt',
  csat: 'csat',
  topicText: 'topic',
  channel: 'channel',
};

export const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------------------
// Candidate names per preset. Dotted names are JSON paths (arrays by index).
// ---------------------------------------------------------------------------

export const INTERCOM: Candidates = {
  id: ['id', 'conversation_id', 'Conversation ID'],
  created: ['created_at', 'Created at', 'Conversation created at'],
  closed: ['statistics.last_close_at', 'statistics.first_close_at', 'Last closed at'],
  customer: [
    'contacts.contacts.0.id',
    'contact_ids.0',
    'contacts.0.id',
    'contact_id',
    'Contact ID',
    'Contact email',
  ],
  ai: ['ai_agent_participated', 'AI agent participated', 'Fin AI Agent participated'],
  state: ['ai_agent.resolution_state', 'AI agent resolution state', 'Fin AI Agent resolution state'],
  adminReplyAt: ['statistics.last_admin_reply_at', 'Last admin reply at', 'Last teammate reply at'],
  aiStartedAt: ['ai_agent.created_at'],
  reopens: ['statistics.count_reopens', 'count_reopens', 'Count reopens', 'Reopens'],
  csat: ['conversation_rating.rating', 'conversation_rating.score', 'Conversation rating'],
  csat2: ['ai_agent.rating', 'AI agent rating', 'Fin rating'],
  topic: ['source.subject', 'source.body', 'Subject', 'First message'],
  channel: ['source.type', 'Channel', 'Source type'],
};

export const ZENDESK: Candidates = {
  id: ['Ticket ID', 'id', 'ticket_id', 'Ticket'],
  created: ['Ticket created - Timestamp', 'Created at', 'created_at', 'Created', 'Ticket created'],
  closed: ['Ticket solved - Timestamp', 'Solved at', 'solved_at', 'Solved'],
  customer: ['Requester email', 'Requester ID', 'requester_id', 'Requester'],
  tier: ['Resolution tier'],
  type: ['Resolution type'],
  tags: ['Tags', 'tags'],
  human: ['Agent replies', 'Agent comments', 'Public agent comments'],
  reopens: ['Reopens', 'Ticket reopens', 'reopens'],
  csat: ['Satisfaction score', 'Satisfaction rating', 'satisfaction_rating.score', 'Satisfaction'],
  topic: ['Subject', 'subject'],
  channel: ['Channel group', 'Channel', 'via.channel'],
};

export const ADA: Candidates = {
  id: ['_id', 'id', 'conversation_id'],
  created: ['date_created', 'Date created'],
  closed: ['date_updated', 'record_last_updated'],
  customer: ['end_user_id', 'chatter_id'],
  classification: ['automated_resolution_classification'],
  escalated: ['is_escalated'],
  handoffs: ['handoffs'],
  agentId: ['agent_id', 'agent_name'],
  handleTime: ['agent_handle_time'],
  isTest: ['is_test_user'],
  csat: ['csat'],
  topic: ['inquiry_summary'],
  channel: ['platform'],
};

// Gorgias view export columns (docs.gorgias.com/en-US/exports-404844). No AI column exists.
export const GORGIAS: Candidates = {
  id: ['Ticket ID', 'id'],
  created: ['Creation date', 'Created datetime', 'created_datetime'],
  closed: ['Closed date'],
  customer: ['Customer email', 'Customer'],
  agentMsgs: ['Number of agent messages'],
  csat: ['Survey score'],
  topic: ['Subject'],
  channel: ['Initial channel', 'Channel'],
};

// Generic synonyms, normalised (see norm()). Used for exact matches first, then for
// substring matches on candidates of 4+ characters.
export const GENERIC: Candidates = {
  id: ['id', 'conversationid', 'ticketid', 'ticketnumber', 'conversationnumber', 'caseid', 'ticket', 'conversation'],
  created: [
    'createdat',
    'created',
    'creationdate',
    'datecreated',
    'createdtime',
    'starttime',
    'startedat',
    'openedat',
    'opened',
    'timestamp',
    'date',
  ],
  closed: ['closedat', 'closed', 'solvedat', 'resolvedat', 'closeddate', 'solved'],
  customer: [
    'customeremail',
    'customerid',
    'customer',
    'requesteremail',
    'requesterid',
    'requester',
    'enduserid',
    'contactemail',
    'contactid',
    'contact',
    'useremail',
    'userid',
    'email',
  ],
  billed: [
    'billed',
    'isbilled',
    'billedasairesolution',
    'billedasresolution',
    'billable',
    'airesolution',
    'resolvedbyai',
    'automatedresolution',
    'billedresolution',
  ],
  ai: ['aiinvolved', 'aihandled', 'aiagentparticipated', 'aiparticipated', 'handledbyai', 'isai', 'aiagent'],
  human: ['humanreply', 'humanreplied', 'humanrepliedafterai', 'agentreplied', 'agentreply', 'humaninvolved', 'humanhandoff', 'human', 'handoff'],
  reopenAt: ['reopenedat', 'lastreopenedat', 'reopendate', 'reopeneddate', 'reopentime', 'reopenedtime'],
  reopens: ['reopens', 'reopencount', 'reopened', 'countreopens', 'timesreopened'],
  csat: ['csat', 'csatscore', 'rating', 'satisfaction', 'satisfactionscore', 'surveyscore', 'customerrating'],
  topic: ['topic', 'subject', 'topictext', 'title', 'firstmessage', 'summary'],
  channel: ['channel', 'source', 'platform', 'channelgroup'],
};

export const PRESET_CANDIDATES: Record<Preset, Candidates> = {
  intercom: INTERCOM,
  zendesk: ZENDESK,
  ada: ADA,
  gorgias: GORGIAS,
  generic: GENERIC,
};

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

export function str(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return '';
}

const YES = new Set(['yes', 'true', 'y', '1', 't', 'billed', 'resolved', 'x']);
const NO = new Set(['no', 'false', 'n', '0', 'f', 'none']);

/** yes/no-ish cell -> boolean; anything else -> null (unknown). */
export function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isNaN(v) ? null : v !== 0;
  const s = str(v).toLowerCase();
  if (s === '') return null;
  if (YES.has(s)) return true;
  if (NO.has(s)) return false;
  const n = Number(s);
  if (Number.isFinite(n)) return n !== 0;
  return null;
}

/** A yes/no column or a count above zero -> boolean; empty -> null. */
export function toHuman(v: unknown): boolean | null {
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v) > 0;
  return toBool(v);
}

export function toCount(v: unknown): number | null {
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = str(v).toLowerCase();
  if (s === '') return null;
  if (YES.has(s) && s !== '1') return 1;
  if (NO.has(s)) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : null;
}

const WORDS: Record<string, number> = {
  good: 1,
  positive: 1,
  great: 1,
  satisfied: 1,
  bad: 0,
  negative: 0,
  poor: 0,
  unsatisfied: 0,
  dissatisfied: 0,
};

/** Raw CSAT cell -> number. Words like "good"/"bad" map to 1/0 and need no scale. */
export function toRawCsat(v: unknown): { value: number; word: boolean } | null {
  if (typeof v === 'number') return Number.isFinite(v) ? { value: v, word: false } : null;
  const s = str(v).toLowerCase();
  if (s === '') return null;
  if (s in WORDS) return { value: WORDS[s], word: true };
  const n = Number(s.replace('%', ''));
  return Number.isFinite(n) ? { value: n, word: false } : null;
}

export type CsatScale = '1-5' | '1-10' | '0-100' | '0-1';
export const CSAT_SCALES: CsatScale[] = ['1-5', '1-10', '0-100', '0-1'];

export function normalizeCsat(v: number, scale: CsatScale): number {
  let x: number;
  switch (scale) {
    case '1-5':
      x = (v - 1) / 4;
      break;
    case '1-10':
      x = (v - 1) / 9;
      break;
    case '0-100':
      x = v / 100;
      break;
    default:
      x = v;
  }
  return Math.min(1, Math.max(0, x));
}

/**
 * Default scale guess from the largest value seen. It is only a default: the mapper lets the
 * user choose the scale, and the data's own min and max are never used to stretch values.
 * Returns null when the data cannot tell (for example a file with only 1s).
 */
export function guessCsatScale(values: number[]): CsatScale | null {
  if (values.length === 0) return null;
  let max = -Infinity;
  let min = Infinity;
  let fractional = false;
  for (const v of values) {
    if (v > max) max = v;
    if (v < min) min = v;
    if (!Number.isInteger(v)) fractional = true;
  }
  if (max <= 1) return fractional || min === 0 ? '0-1' : null;
  if (max <= 5) return '1-5';
  if (max <= 10) return '1-10';
  if (max <= 100) return '0-100';
  return null;
}

export function parseScale(v: string | null | undefined): CsatScale | null {
  const s = (v ?? '').trim();
  return (CSAT_SCALES as string[]).includes(s) ? (s as CsatScale) : null;
}

// ---------------------------------------------------------------------------
// Intercom resolution states, current and legacy names (vendor-facts.md section 1).
// ---------------------------------------------------------------------------

export function intercomState(raw: unknown): { state: VendorState; billed: boolean } {
  // API names are snake_case; CSV datasets may spell them as display names ("Routed to team").
  switch (str(raw).toLowerCase().replace(/[\s-]+/g, '_')) {
    case 'assumed_resolution':
      return { state: 'assumed', billed: true };
    case 'confirmed_resolution':
      return { state: 'confirmed', billed: true };
    case 'escalated':
    case 'routed_to_team':
      return { state: 'escalated', billed: false };
    case 'negative_feedback':
    case 'abandoned':
      return { state: 'negative_feedback', billed: false };
    case 'procedure_handoff':
      return { state: 'handoff', billed: false };
    default:
      return { state: 'unknown', billed: false };
  }
}

export function zendeskTier(tier: string, type: string, tags: string): { state: VendorState; billed: boolean; ai: boolean } {
  const t = tier.toLowerCase();
  const ty = type.toLowerCase();
  const legacy = tags.toLowerCase().includes('ai_agent_automated_resolution');
  // API values and ticket tags carry option values, not labels: "Verified resolution" = zd_resolution_tier_core_resolution.
  if (/\bverified\b/.test(t) || t.includes('core_resolution')) return { state: 'verified', billed: true, ai: true };
  if (t.includes('non_automated') || t.includes('non-automated')) return { state: 'not_ai', billed: false, ai: false };
  if (t.includes('contained')) return { state: 'contained', billed: false, ai: true };
  if (t.includes('assisted') || t.includes('escalat')) return { state: 'escalated', billed: false, ai: true };
  if (legacy) return { state: 'assumed', billed: true, ai: true };
  if (ty.includes('automated')) return { state: 'billed_unknown', billed: true, ai: true };
  return { state: 'not_ai', billed: false, ai: t !== '' };
}

export function adaState(classification: string): { state: VendorState; billed: boolean } {
  const c = classification.toLowerCase();
  if (/^resolved\b/.test(c)) return { state: 'verified', billed: true };
  return { state: 'unknown', billed: false };
}

// ---------------------------------------------------------------------------
// detectPreset
// ---------------------------------------------------------------------------

const SIGNATURES: Record<Exclude<Preset, 'generic'>, { strong: string[]; weak: string[] }> = {
  intercom: {
    strong: ['aiagentparticipated', 'aiagentresolutionstate', 'statisticscountreopens'],
    weak: ['id', 'createdat', 'conversationratingrating', 'aiagentrating', 'statisticslastadminreplyat'],
  },
  zendesk: {
    strong: ['resolutiontier', 'resolutiontype', 'aiagentautomatedresolution'],
    weak: ['ticketid', 'requesteremail', 'requesterid', 'channelgroup', 'satisfactionscore'],
  },
  ada: {
    strong: ['automatedresolutionclassification', 'isescalated', 'enduserid', 'chatterid'],
    weak: ['datecreated', 'handoffs', 'csat', 'isengaged', 'istestuser'],
  },
  gorgias: {
    strong: ['numberofagentmessages', 'lastusedintegrationname', 'initialchannel', 'surveyscore'],
    weak: ['ticketid', 'customeremail', 'tags', 'creationdate'],
  },
};

export function detectPresetFromHeaders(headers: string[]): { preset: Preset; confidence: number } {
  const set = new Set(headers.map(norm));
  let best: Preset = 'generic';
  let bestScore = 0;
  for (const [preset, sig] of Object.entries(SIGNATURES) as [Exclude<Preset, 'generic'>, (typeof SIGNATURES)[keyof typeof SIGNATURES]][]) {
    let score = 0;
    for (const k of sig.strong) if (set.has(k)) score += 3;
    let weak = 0;
    for (const k of sig.weak) if (set.has(k)) weak += 1;
    score += Math.min(weak, 3);
    if (score > bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  if (bestScore < 3) return { preset: 'generic', confidence: bestScore > 0 ? 0.3 : 0.1 };
  return { preset: best, confidence: Math.min(1, bestScore / 6) };
}
