// Synthetic sample exports for "Try sample data". Deterministic for a given seed; contains no
// real data. The shapes follow the column names the presets read, not any vendor's real export.
import type { Preset } from './types';

const DAY = 86_400_000;
const END = Date.UTC(2026, 8, 30, 23, 0, 0); // fixed anchor, so the sample never depends on today's date
const SPAN_DAYS = 84;
const BASE_CONVERSATIONS = 900;
const CUSTOMERS = 2600;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type State = 'assumed' | 'confirmed' | 'escalated' | 'negative_feedback' | 'handoff' | null;

interface Row {
  n: number;
  t: number;
  customer: number;
  ai: boolean;
  state: State;
  adminReplyAt: number | null;
  reopens: number;
  csat: number | null; // 1..5
  topic: string;
  channel: string;
}

const TOPICS = [
  'Where is my order, the tracking page has not updated',
  'I need to change the shipping address on my order',
  'Refund for a damaged item has not arrived',
  'How do I reset my password, the email link expired',
  'Invoice copy for last month, please resend',
  'Cancel my subscription before the next renewal',
  'The app crashes when I upload a photo',
  'Can I upgrade my plan and keep my data',
  'Discount code is not applied at checkout',
  'Update the billing card on my account',
];
const CHANNELS = ['chat', 'email', 'chat', 'chat', 'messenger'];

function generate(seed: number): Row[] {
  const rnd = mulberry32(seed);
  const rows: Row[] = [];
  let n = 0;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];

  const makeCsat = (state: State): number | null => {
    if (rnd() > 0.16) return null;
    if (state === 'confirmed') return rnd() < 0.85 ? 5 : 4;
    const u = rnd();
    return u < 0.35 ? 5 : u < 0.6 ? 4 : u < 0.72 ? 3 : u < 0.86 ? 2 : 1;
  };

  const add = (t: number, customer: number, topic: string, forceAi?: boolean) => {
    const ai = forceAi ?? rnd() < 0.82;
    let state: State = null;
    if (ai) {
      const u = rnd();
      state = u < 0.12 ? 'confirmed' : u < 0.62 ? 'assumed' : u < 0.74 ? 'escalated' : u < 0.78 ? 'negative_feedback' : u < 0.82 ? 'handoff' : null;
    }
    const humanAfter = ai && (state === 'escalated' || state === 'handoff' || rnd() < 0.05);
    rows.push({
      n: ++n,
      t,
      customer,
      ai,
      state,
      adminReplyAt: humanAfter ? t + 5_000 + Math.floor((0.05 + rnd() * 1.8) * DAY) : null,
      reopens: ai && rnd() < 0.03 ? 1 : 0,
      csat: ai ? makeCsat(state) : null,
      topic,
      channel: pick(CHANNELS),
    });
    return state;
  };

  for (let i = 0; i < BASE_CONVERSATIONS; i++) {
    const t = END - Math.floor(rnd() * SPAN_DAYS * DAY);
    const customer = Math.floor(rnd() * CUSTOMERS);
    const topic = pick(TOPICS);
    const state = add(t, customer, topic);
    // Some customers write again soon after an AI "resolution".
    if ((state === 'assumed' || state === 'confirmed') && rnd() < 0.09) {
      const later = t + Math.floor((0.15 + rnd() * 6.5) * DAY);
      if (later <= END) add(later, customer, rnd() < 0.7 ? topic : pick(TOPICS), rnd() < 0.6);
    }
  }
  rows.sort((a, b) => a.t - b.t || a.n - b.n);
  rows.forEach((r, i) => (r.n = i + 1));
  return rows;
}

const iso = (ms: number) => new Date(ms).toISOString();
const secs = (ms: number) => Math.floor(ms / 1000);
const email = (c: number) => `customer${String(c).padStart(4, '0')}@example.com`;

function csvCell(v: string | number | boolean | null): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (header: string[], rows: (string | number | boolean | null)[][]) =>
  [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';

const INTERCOM_STATE: Record<Exclude<State, null>, string> = {
  assumed: 'assumed_resolution',
  confirmed: 'confirmed_resolution',
  escalated: 'escalated',
  negative_feedback: 'negative_feedback',
  handoff: 'procedure_handoff',
};

function intercom(rows: Row[]): string {
  return (
    rows
      .map((r) => {
        const o: Record<string, unknown> = {
          id: `ic_${100000 + r.n}`,
          created_at: secs(r.t),
          ai_agent_participated: r.ai,
          contacts: { contacts: [{ id: `contact_${r.customer}` }] },
          source: { type: r.channel, subject: r.topic },
          statistics: {
            count_reopens: r.reopens,
            last_admin_reply_at: r.adminReplyAt === null ? null : secs(r.adminReplyAt),
          },
          conversation_rating: { rating: r.ai && r.csat !== null ? r.csat : null },
        };
        if (r.ai) {
          o.ai_agent = {
            resolution_state: r.state ? INTERCOM_STATE[r.state] : null,
            created_at: secs(r.t + 5_000),
            rating: null,
          };
        }
        return JSON.stringify(o);
      })
      .join('\n') + '\n'
  );
}

function zendesk(rows: Row[]): string {
  const tier = (r: Row) =>
    !r.ai ? '' : r.state === 'assumed' || r.state === 'confirmed' ? 'Verified' : r.state === null ? 'Contained' : 'Assisted escalation';
  return csv(
    ['Ticket ID', 'Created at', 'Requester email', 'Subject', 'Channel group', 'Resolution type', 'Resolution tier', 'Agent replies', 'Reopens', 'Satisfaction score'],
    rows.map((r) => [
      40000 + r.n,
      iso(r.t),
      email(r.customer),
      r.topic,
      'Digital',
      r.ai ? 'Automated' : '',
      tier(r),
      r.adminReplyAt === null ? 0 : 1,
      r.reopens,
      r.csat === null ? '' : r.csat >= 4 ? 'Good' : r.csat <= 2 ? 'Bad' : '',
    ]),
  );
}

function ada(rows: Row[]): string {
  return (
    rows
      .filter((r) => r.ai)
      .map((r) =>
        JSON.stringify({
          _id: `ada_${r.n}`,
          end_user_id: `eu_${r.customer}`,
          date_created: iso(r.t),
          automated_resolution_classification: r.state === 'assumed' || r.state === 'confirmed' ? 'Resolved' : 'Not Resolved',
          is_escalated: r.state === 'escalated' || r.state === 'handoff',
          handoffs: r.adminReplyAt === null ? [] : [{ outcome_status: 'completed' }],
          csat: r.csat,
          inquiry_summary: r.topic,
          platform: r.channel,
          is_test_user: false,
        }),
      )
      .join('\n') + '\n'
  );
}

function gorgias(rows: Row[]): string {
  return csv(
    ['Ticket ID', 'Creation date', 'Customer email', 'Number of agent messages', 'Survey score', 'Subject', 'Initial channel'],
    rows.map((r) => [
      70000 + r.n,
      iso(r.t),
      email(r.customer),
      r.ai && r.adminReplyAt === null && r.state !== 'escalated' && r.state !== 'handoff' ? 0 : 1 + (r.n % 3),
      r.csat,
      r.topic,
      r.channel,
    ]),
  );
}

function generic(rows: Row[]): string {
  const yn = (b: boolean) => (b ? 'yes' : 'no');
  return csv(
    ['conversation_id', 'created_at', 'customer', 'ai_involved', 'billed', 'human_reply', 'reopens', 'csat', 'subject', 'channel'],
    rows.map((r) => [
      `c_${r.n}`,
      iso(r.t),
      email(r.customer),
      yn(r.ai),
      yn(r.ai && (r.state === 'assumed' || r.state === 'confirmed')),
      yn(r.adminReplyAt !== null),
      r.reopens,
      r.csat,
      r.topic,
      r.channel,
    ]),
  );
}

export function sampleDataset(preset: Preset, seed = 1): string {
  const rows = generate(seed);
  switch (preset) {
    case 'intercom':
      return intercom(rows);
    case 'zendesk':
      return zendesk(rows);
    case 'ada':
      return ada(rows);
    case 'gorgias':
      return gorgias(rows);
    default:
      return generic(rows);
  }
}
