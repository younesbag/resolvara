// Engine tests added with the fixes for docs/REVIEW.md. The adversarial file next to this one
// covers the Standard's rules; this one covers the parts it leaves open and the review's fixes.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  audit,
  contributionPayload,
  detectPreset,
  disputeSummaryText,
  guessCsatScale,
  parseFile,
  peekFile,
  sampleDataset,
  toDisputeCsv,
  type AuditOptions,
  type Conversation,
} from '@/engine';
import { sha256Hex } from '../hash';
import { parseTimestamp } from '../time';

const DAY = 86_400_000;
const E = new Date('2026-10-31T00:00:00Z');
const at = (d: number) => new Date(E.getTime() - d * DAY);
let seq = 0;
const conv = (p: Partial<Conversation> = {}): Conversation => {
  seq += 1;
  return {
    id: `e${seq}`,
    customerKey: `k${seq}`,
    createdAt: at(20),
    closedAt: null,
    aiInvolved: true,
    vendorState: 'assumed',
    billed: true,
    humanReplied: false,
    reopenCount: 0,
    csat: null,
    channel: null,
    topicText: null,
    ...p,
  };
};
const OPTS: AuditOptions = {
  windowDays: 7,
  pricePerResolution: 1,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
  exportEnd: E,
};
const run = (convs: Conversation[], o: Partial<AuditOptions> = {}) => audit(convs, { ...OPTS, ...o }, 'generic');
const verdict = (convs: Conversation[], id: string) => run(convs).results.find((r) => r.id === id)?.verdict;

describe('engine smoke test (a missing engine can never pass CI again)', () => {
  it('audit([]) returns a complete, finite report', () => {
    const r = run([]);
    expect(r.standardVersion).toBe('0.1');
    expect(r.aiConversations).toBe(0);
    expect(r.sensitivity.map((s) => s.windowDays)).toEqual([1, 3, 7, 14, 30]);
    expect(r.warnings.join(' ')).toMatch(/No AI conversations/);
  });
  it('sampleDataset produces a non-empty export for every preset', async () => {
    for (const p of ['intercom', 'zendesk', 'ada', 'gorgias', 'generic'] as const) {
      const { conversations } = await parseFile(sampleDataset(p), { preset: p });
      expect(conversations.length).toBeGreaterThan(100);
    }
  });
});

describe('sha256 (customer key hashing)', () => {
  it('matches node:crypto across block boundaries and for non-ASCII text', () => {
    const inputs = ['', 'a', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'x'.repeat(65), 'x'.repeat(1000), 'zoë@exämple.com', '日本語'];
    for (const s of inputs) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });
});

describe('verdict contract (review H2, M4, M5)', () => {
  it('an unbilled conversation with a fail signal is fail_unbilled: not a pass, not phantom, counted in the strict denominator', () => {
    const bad = conv({ id: 'u1', billed: false, humanReplied: true });
    const ok = conv({ id: 'u2' });
    const r = run([bad, ok]);
    expect(r.results.find((x) => x.id === 'u1')).toMatchObject({ verdict: 'fail_unbilled', reasons: ['human_handoff'] });
    expect(r.failUnbilled).toBe(1);
    expect(r.phantom).toBe(0);
    expect(r.strictRate).toBeCloseTo(0.5, 10);
  });

  it('M5: no customer key and no fail signal is unverifiable even when other fields are present', () => {
    const c = conv({ id: 'n1', customerKey: null, humanReplied: false, reopenCount: 0, csat: 0.9 });
    expect(verdict([c], 'n1')).toBe('unverifiable');
  });

  it('M5: no customer key with a fail signal is still judged', () => {
    expect(verdict([conv({ id: 'n2', customerKey: null, vendorState: 'escalated' })], 'n2')).toBe('phantom');
  });

  it('unverifiable conversations leave every rate, they are not counted as failures (review H3c)', () => {
    const r = run([conv({ id: 'a' }), conv({ id: 'b', customerKey: null })]);
    expect(r.judged).toBe(1);
    expect(r.strictRate).toBe(1);
    expect(r.billedRate).toBe(1);
  });

  it('M4: an explicit positive rating (normalised CSAT >= 0.75) is a confirmed pass, 0.74 is not', () => {
    expect(verdict([conv({ id: 'p1', csat: 0.75 })], 'p1')).toBe('confirmed_pass');
    expect(verdict([conv({ id: 'p2', csat: 0.74 })], 'p2')).toBe('strict_pass');
  });

  it('H3a: phantomShareOfBilled uses billed conversations that were judged', () => {
    const r = run([
      conv({ id: 'x1', humanReplied: true }),
      conv({ id: 'x2' }),
      conv({ id: 'x3', createdAt: at(1) }), // billed, pending
      conv({ id: 'x4', customerKey: null }), // billed, unverifiable
      conv({ id: 'x5', billed: false, createdAt: at(1) }), // unbilled, pending
    ]);
    expect(r.billedJudged).toBe(2);
    expect(r.phantomShareOfBilled).toBeCloseTo(0.5, 10);
  });

  it('M6: byReason counts phantom conversations only; byReasonShare is the share of phantom carrying a reason', () => {
    const cs = [
      conv({ id: 'r1', humanReplied: true, reopenCount: 1 }),
      conv({ id: 'r2', humanReplied: true }),
      conv({ id: 'r3', billed: false, humanReplied: true }), // unbilled: not in byReason
    ];
    const r = run(cs);
    expect(r.byReason).toMatchObject({ human_handoff: 2, reopened: 1, repeat_contact: 0 });
    const p = contributionPayload(r, OPTS);
    expect(p.byReasonShare.human_handoff).toBe(1);
    expect(p.byReasonShare.reopened).toBe(0.5);
  });

  it('M10: a negative price never produces negative dollars at risk', () => {
    const r = run([conv({ humanReplied: true })], { pricePerResolution: -3 });
    expect(r.dollarsAtRisk).toBe(0);
  });
});

describe('contribution payload (review H4)', () => {
  it('vendor comes from a fixed list: the preset by default, an explicit slug when given, other for generic', () => {
    const r = run([conv()]);
    expect(contributionPayload(r, OPTS).vendor).toBe('other');
    expect(contributionPayload({ ...r, preset: 'intercom' }, OPTS).vendor).toBe('intercom');
    expect(contributionPayload(r, OPTS, 'hubspot').vendor).toBe('hubspot');
  });
});

describe('summary and dispute outputs', () => {
  it('summary states the price math and never uses the word fraud', () => {
    const r = run([conv({ humanReplied: true }), conv()]);
    const t = disputeSummaryText(r, OPTS, 'Acme');
    expect(t).toContain('$1.00');
    expect(t).toContain('Acme');
    expect(t.toLowerCase()).not.toContain('fraud');
  });
  it('dispute CSV lists only phantom rows', () => {
    const convs = [conv({ id: 'd1', humanReplied: true }), conv({ id: 'd2', billed: false, humanReplied: true }), conv({ id: 'd3' })];
    const lines = toDisputeCsv(run(convs), convs).trim().split(/\r?\n/);
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('d1');
  });
});

describe('timestamps', () => {
  it('handles ISO with offsets, naive values, unix seconds and milliseconds, and rejects junk', () => {
    expect(parseTimestamp('2026-10-01T10:00:00+08:00').date?.toISOString()).toBe('2026-10-01T02:00:00.000Z');
    expect(parseTimestamp('2026-10-01T10:00:00Z')).toMatchObject({ naive: false });
    expect(parseTimestamp('2026-10-01 10:00')).toMatchObject({ naive: true });
    expect(parseTimestamp('2026-10-01').date?.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(parseTimestamp(1759312800).date?.toISOString()).toBe('2025-10-01T10:00:00.000Z');
    expect(parseTimestamp('1759312800000').date?.toISOString()).toBe('2025-10-01T10:00:00.000Z');
    expect(parseTimestamp('2026-02-31').date).toBeNull();
    expect(parseTimestamp('not a date').date).toBeNull();
    expect(parseTimestamp('').date).toBeNull();
  });
});

describe('CSAT scale (review M2)', () => {
  const csv = (vals: string[]) =>
    'id,created,customer,billed,csat\n' + vals.map((v, i) => `${i + 1},2026-10-01T10:00:00Z,u${i}@x.com,yes,${v}`).join('\n') + '\n';
  const map = (extra: Record<string, string | null> = {}) => ({
    id: 'id',
    createdAt: 'created',
    customerKey: 'customer',
    billed: 'billed',
    billedValue: 'yes',
    csat: 'csat',
    ...extra,
  });

  it('the scale chosen in the mapper wins over the guess', async () => {
    const { conversations } = await parseFile(csv(['10', '5', '1']), { preset: 'generic', mapping: map({ csatScale: '1-10' }) });
    const c = Object.fromEntries(conversations.map((x) => [x.id, x.csat]));
    expect(c['1']).toBeCloseTo(1, 10);
    expect(c['2']).toBeCloseTo(4 / 9, 10);
    expect(c['3']).toBeCloseTo(0, 10);
  });

  it('0-100 and 0-1 scales', async () => {
    const a = await parseFile(csv(['80', '20']), { preset: 'generic', mapping: map({ csatScale: '0-100' }) });
    expect(a.conversations.map((c) => c.csat)).toEqual([0.8, 0.2]);
    const b = await parseFile(csv(['0.9', '0.1']), { preset: 'generic', mapping: map() });
    expect(b.conversations.map((c) => c.csat)).toEqual([0.9, 0.1]);
  });

  it('a file whose scores cannot reveal the scale ignores them with a warning instead of guessing', async () => {
    const { conversations, warnings } = await parseFile(csv(['1', '1']), { preset: 'generic', mapping: map() });
    expect(conversations.map((c) => c.csat)).toEqual([null, null]);
    expect(warnings.join(' ')).toMatch(/scale/i);
  });

  it('the default guess uses the highest score only', () => {
    expect(guessCsatScale([4, 5])).toBe('1-5');
    expect(guessCsatScale([7, 9, 10])).toBe('1-10');
    expect(guessCsatScale([85, 40])).toBe('0-100');
    expect(guessCsatScale([0, 1])).toBe('0-1');
    expect(guessCsatScale([1, 1])).toBeNull();
  });

  it('words such as good and bad need no scale', async () => {
    const { conversations } = await parseFile(csv(['Good', 'Bad']), { preset: 'generic', mapping: map() });
    expect(conversations.map((c) => c.csat)).toEqual([1, 0]);
  });
});

describe('Intercom human reply is after the AI (review M3)', () => {
  const rec = (id: string, extra: Record<string, unknown>) => ({
    id,
    created_at: 1759312800,
    ai_agent_participated: true,
    ai_agent: { resolution_state: 'assumed_resolution', created_at: 1759312860 },
    statistics: { count_reopens: 0, last_admin_reply_at: null },
    contacts: { contacts: [{ id: `c-${id}` }] },
    ...extra,
  });
  it('fires only when the admin reply is later than the AI start', async () => {
    const jsonl = [
      rec('before', { statistics: { count_reopens: 0, last_admin_reply_at: 1759312830 } }),
      rec('after', { statistics: { count_reopens: 0, last_admin_reply_at: 1759312900 } }),
      rec('none', {}),
    ]
      .map((o) => JSON.stringify(o))
      .join('\n');
    const { conversations } = await parseFile(jsonl, { preset: 'intercom' });
    const h = Object.fromEntries(conversations.map((c) => [c.id, c.humanReplied]));
    expect(h).toEqual({ before: false, after: true, none: false });
  });
  it('without the AI start time the order is unknown: the signal is off and a note says so', async () => {
    const o = rec('x', { statistics: { count_reopens: 0, last_admin_reply_at: 1759312900 } });
    (o.ai_agent as Record<string, unknown>).created_at = undefined;
    const { conversations, warnings } = await parseFile(JSON.stringify(o), { preset: 'intercom' });
    expect(conversations[0].humanReplied).toBeNull();
    expect(warnings.join(' ')).toMatch(/AI start time/);
  });
});

describe('JSON shapes (review M7) and peeking', () => {
  const rec = (i: number) => ({
    id: `j${i}`,
    created_at: 1759312800 + i * 60,
    ai_agent_participated: true,
    ai_agent: { resolution_state: 'assumed_resolution', created_at: 1759312860 + i * 60 },
    statistics: { count_reopens: 0, last_admin_reply_at: null },
    contacts: { contacts: [{ id: `c${i % 7}` }] },
  });
  const many = (n: number) => Array.from({ length: n }, (_, i) => rec(i));

  it('reads a pretty-printed JSON array', async () => {
    const { conversations } = await parseFile(JSON.stringify(many(5), null, 2), { preset: 'intercom' });
    expect(conversations.length).toBe(5);
  });

  it('reads an Intercom-style wrapped list, pretty-printed and on one line', async () => {
    const wrapped = { type: 'conversation.list', pages: { next: null, total_pages: 1 }, errors: [], conversations: many(4) };
    expect((await parseFile(JSON.stringify(wrapped, null, 2), { preset: 'intercom' })).conversations.length).toBe(4);
    expect((await parseFile(JSON.stringify(wrapped), { preset: 'intercom' })).conversations.length).toBe(4);
  });

  it('streams a large array without parsing it as one value', async () => {
    const text = JSON.stringify(many(30_000), null, 1);
    const { conversations } = await parseFile(text, { preset: 'intercom' });
    expect(conversations.length).toBe(30_000);
  });

  it('strings that contain brackets and braces do not confuse the scanner', async () => {
    const o = { ...rec(1), source: { subject: 'weird } ] [ { "quoted" \\ text' } };
    const { conversations } = await parseFile(`[${JSON.stringify(o)},${JSON.stringify(rec(2))}]`, { preset: 'intercom' });
    expect(conversations.length).toBe(2);
  });

  it('skips a corrupt JSONL line and says so', async () => {
    const text = [JSON.stringify(rec(1)), '{ not json }', JSON.stringify(rec(2))].join('\n');
    const { conversations, warnings } = await parseFile(text, { preset: 'intercom' });
    expect(conversations.length).toBe(2);
    expect(warnings.join(' ')).toMatch(/could not be read/);
  });

  it('peekFile gives headers and rows for CSV and nested JSON, and detectPreset recognises them', async () => {
    const csvPeek = await peekFile(sampleDataset('zendesk'));
    expect(csvPeek.format).toBe('csv');
    expect(csvPeek.headers).toContain('Resolution tier');
    expect(detectPreset(csvPeek.headers, csvPeek.rows).preset).toBe('zendesk');
    const jsonPeek = await peekFile(sampleDataset('intercom'));
    expect(jsonPeek.headers).toContain('ai_agent.resolution_state');
    expect(detectPreset(jsonPeek.headers, jsonPeek.rows).preset).toBe('intercom');
    const adaPeek = await peekFile(sampleDataset('ada'));
    expect(detectPreset(adaPeek.headers, adaPeek.rows).preset).toBe('ada');
  });

  it('peekFile on a big pretty-printed array reads only the head', async () => {
    const text = JSON.stringify(many(50_000), null, 2);
    const t = performance.now();
    const peek = await peekFile(text, 40, 256 * 1024);
    expect(peek.rows.length).toBe(40);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('vendor presets', () => {
  it('Zendesk: tier decides billing; unbilled tiers are never billed', async () => {
    const csv =
      'Ticket ID,Created at,Requester email,Resolution type,Resolution tier,Satisfaction score\n' +
      '1,2026-10-01T10:00:00Z,a@x.com,Automated,Verified,Good\n' +
      '2,2026-10-01T10:00:00Z,b@x.com,Automated,Contained,\n' +
      '3,2026-10-01T10:00:00Z,c@x.com,Automated,Assisted escalation,Bad\n' +
      '4,2026-10-01T10:00:00Z,d@x.com,,,\n';
    const { conversations } = await parseFile(csv, { preset: 'zendesk' });
    const c = Object.fromEntries(conversations.map((x) => [x.id, x]));
    expect(c['1']).toMatchObject({ aiInvolved: true, billed: true, vendorState: 'verified', csat: 1 });
    expect(c['2']).toMatchObject({ aiInvolved: true, billed: false, vendorState: 'contained' });
    expect(c['3']).toMatchObject({ aiInvolved: true, billed: false, vendorState: 'escalated', csat: 0 });
    expect(c['4'].aiInvolved).toBe(false);
  });

  it('Ada: classification, escalation, handoffs and test users', async () => {
    const jsonl = [
      { _id: 'a1', end_user_id: 'u1', date_created: '2026-10-01T10:00:00Z', automated_resolution_classification: 'Resolved', is_escalated: false, handoffs: [], csat: 5 },
      { _id: 'a2', end_user_id: 'u2', date_created: '2026-10-01T10:00:00Z', automated_resolution_classification: 'Not Resolved', is_escalated: true, handoffs: [{ outcome_status: 'x' }] },
      { _id: 'a3', end_user_id: 'u3', date_created: '2026-10-01T10:00:00Z', automated_resolution_classification: 'Resolved', is_test_user: true },
    ]
      .map((o) => JSON.stringify(o))
      .join('\n');
    const { conversations } = await parseFile(jsonl, { preset: 'ada' });
    expect(conversations.map((c) => c.id)).toEqual(['a1', 'a2']);
    expect(conversations[0]).toMatchObject({ billed: true, humanReplied: false });
    expect(conversations[1]).toMatchObject({ billed: false, vendorState: 'escalated', humanReplied: true });
  });

  it('Gorgias: with no AI column, tickets without agent messages are the AI-handled ones, and a warning says so', async () => {
    const csv =
      'Ticket ID,Creation date,Customer email,Number of agent messages,Survey score\n' +
      '1,2026-10-01T10:00:00Z,a@x.com,0,5\n' +
      '2,2026-10-01T10:00:00Z,b@x.com,2,\n';
    const { conversations, warnings } = await parseFile(csv, { preset: 'gorgias' });
    expect(conversations[0]).toMatchObject({ aiInvolved: true, billed: true, humanReplied: false });
    expect(conversations[1]).toMatchObject({ aiInvolved: false, billed: false, humanReplied: true });
    expect(warnings.join(' ')).toMatch(/no AI column/i);
  });

  it('generic files without a mapping are mapped by header names', async () => {
    const csv = 'conversation_id,created_at,customer,billed,human_reply,reopens\nc1,2026-10-01T10:00:00Z,a@x.com,yes,no,0\n';
    const { conversations } = await parseFile(csv, { preset: 'generic' });
    expect(conversations[0]).toMatchObject({ id: 'c1', billed: true, humanReplied: false, reopenCount: 0 });
  });

  it('a mapper selection of "not in this file" is respected', async () => {
    const csv = 'id,created,billed,human\n1,2026-10-01T10:00:00Z,yes,yes\n';
    const { conversations } = await parseFile(csv, {
      preset: 'generic',
      mapping: { id: 'id', createdAt: 'created', billed: 'billed', billedValue: 'yes', humanReplied: null },
    });
    expect(conversations[0].humanReplied).toBeNull();
  });
});

describe('same-topic filter', () => {
  it('warns when no conversation has topic text', () => {
    const r = run([conv({ customerKey: 'z' }), conv({ customerKey: 'z', createdAt: at(19) })], { sameTopicOnly: true });
    expect(r.warnings.join(' ')).toMatch(/same-topic filter/);
    expect(r.phantom).toBe(0);
  });
});
