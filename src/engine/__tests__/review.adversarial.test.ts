// Independent adversarial review tests (docs/REVIEW.md).
// Written against docs/SPEC.md and content/standard.md, not against the implementation.
// A failing test here marks a real defect (or, where noted, a SPEC ambiguity the engine must settle).
import { describe, expect, it } from 'vitest';
import {
  audit,
  contributionPayload,
  detectPreset,
  disputeSummaryText,
  parseFile,
  sampleDataset,
  toDisputeCsv,
  type AuditOptions,
  type AuditReport,
  type Conversation,
  type ConvResult,
} from '@/engine';
import { contributionSchema } from '@/server/contribution';

const DAY = 86_400_000;
const E = new Date('2026-10-31T00:00:00Z'); // fixed export end
const at = (daysBeforeEnd: number) => new Date(E.getTime() - daysBeforeEnd * DAY);

let seq = 0;
function conv(p: Partial<Conversation> = {}): Conversation {
  seq += 1;
  return {
    id: `c${seq}`,
    customerKey: `cust-${seq}`,
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
}

const OPTS: AuditOptions = {
  windowDays: 7,
  pricePerResolution: 0.99,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
  exportEnd: E,
};

const run = (convs: Conversation[], o: Partial<AuditOptions> = {}) =>
  audit(convs, { ...OPTS, ...o }, 'generic');
const byId = (r: AuditReport, id: string): ConvResult => {
  const x = r.results.find((y) => y.id === id);
  if (!x) throw new Error(`no result for ${id}`);
  return x;
};

// ---------------------------------------------------------------------------
// Hand-computed fixture (see docs/REVIEW.md "Hand recomputation")
// ---------------------------------------------------------------------------
function fixture(): Conversation[] {
  return [
    conv({ id: 'f1', customerKey: 'A', createdAt: at(30) }), // strict_pass
    conv({ id: 'f2', customerKey: 'B', createdAt: at(30), vendorState: 'confirmed' }), // confirmed_pass
    conv({ id: 'f3', customerKey: 'C', createdAt: at(29), humanReplied: true }), // phantom human_handoff
    conv({ id: 'f4', customerKey: 'D', createdAt: at(28) }), // phantom repeat_contact (f5, 2.0d)
    conv({ id: 'f5', customerKey: 'D', createdAt: at(26) }), // strict_pass
    conv({ id: 'f6', customerKey: 'E', createdAt: at(25), billed: false, vendorState: 'escalated' }), // fail, unbilled
    conv({ id: 'f7', customerKey: 'F', createdAt: at(20), billed: false }), // strict_pass (unbilled)
    conv({ id: 'f8', customerKey: null, createdAt: at(27), humanReplied: null, reopenCount: null, csat: null }), // unverifiable
    conv({ id: 'f9', customerKey: 'G', createdAt: at(2) }), // pending
    conv({ id: 'f10', customerKey: 'H', createdAt: at(15), csat: 0, reopenCount: 2 }), // phantom csat + reopened
    conv({ id: 'f11', customerKey: 'I', createdAt: at(10), aiInvolved: false }), // out of scope
  ];
}

describe('hand-computed fixture: verdicts and rates', () => {
  it('assigns the hand-computed verdicts', () => {
    const r = run(fixture());
    expect(byId(r, 'f1').verdict).toBe('strict_pass');
    expect(byId(r, 'f2').verdict).toBe('confirmed_pass');
    expect(byId(r, 'f3')).toMatchObject({ verdict: 'phantom', reasons: ['human_handoff'] });
    expect(byId(r, 'f4')).toMatchObject({ verdict: 'phantom', reasons: ['repeat_contact'] });
    expect(byId(r, 'f5').verdict).toBe('strict_pass');
    expect(byId(r, 'f6').verdict).not.toMatch(/pass|phantom/);
    expect(byId(r, 'f6').reasons).toContain('vendor_escalated');
    expect(byId(r, 'f7').verdict).toBe('strict_pass');
    expect(byId(r, 'f8').verdict).toBe('unverifiable');
    expect(byId(r, 'f9').verdict).toBe('pending_window');
    expect(byId(r, 'f10').verdict).toBe('phantom');
    expect([...byId(r, 'f10').reasons].sort()).toEqual(['negative_csat', 'reopened']);
    expect(r.results.find((x) => x.id === 'f11')).toBeUndefined();
  });

  it('computes counts and rates exactly as recomputed by hand', () => {
    const r = run(fixture());
    expect(r.aiConversations).toBe(10);
    expect(r.billed).toBe(8); // everything the vendor billed, f9 (pending) and f8 (unverifiable) included
    // Review fix H3b: billedRate shares the strictRate population (AI minus pending minus unverifiable = 8),
    // of which 6 are billed (f1 f2 f3 f4 f5 f10). It used to be 8/10 over a different population.
    expect(r.judged).toBe(8);
    expect(r.billedJudged).toBe(6);
    expect(r.billedRate).toBeCloseTo(6 / 8, 10);
    expect(r.pending).toBe(1);
    expect(r.unverifiable).toBe(1);
    expect(r.phantom).toBe(3);
    expect(r.strictPass).toBe(3);
    expect(r.confirmedPass).toBe(1);
    expect(r.failUnbilled).toBe(1); // f6
    // Review fix H3c: unverifiable conversations (f8) are unjudged, not failed, so they leave the denominator.
    expect(r.strictRate).toBeCloseTo(4 / 8, 10); // (3+1) / (10 - 1 pending - 1 unverifiable)
    expect(r.phantomShareOfBilled).toBeCloseTo(3 / 6, 10); // 3 / (8 - 1 - 1)
    expect(r.dollarsAtRisk).toBeCloseTo(2.97, 10);
    expect(r.byReason.human_handoff).toBe(1);
    expect(r.byReason.repeat_contact).toBe(1);
    expect(r.byReason.reopened).toBe(1);
    expect(r.byReason.negative_csat).toBe(1);
    expect(r.period.start.getTime()).toBe(at(30).getTime());
    expect(r.period.end.getTime()).toBe(E.getTime());
  });

  it('phantomShareOfBilled subtracts only BILLED pending/unverifiable (SPEC formula is ambiguous)', () => {
    // An unbilled pending conversation must not shrink the billed denominator.
    const convs = [...fixture(), conv({ id: 'u-pend', customerKey: 'Z', createdAt: at(1), billed: false })];
    const r = run(convs);
    expect(r.phantomShareOfBilled).toBeCloseTo(3 / 6, 10); // literal SPEC "billed - pending - unverifiable" gives 3/5
  });

  it('sensitivity recomputes pending and repeat contact per window', () => {
    const r = run(fixture());
    expect(r.sensitivity.map((s) => s.windowDays)).toEqual([1, 3, 7, 14, 30]);
    const w = (d: number) => r.sensitivity.find((s) => s.windowDays === d)!;
    expect(w(7).phantom).toBe(r.phantom);
    expect(w(7).strictRate).toBeCloseTo(r.strictRate, 10);
    // W=1: nothing pending, f4->f5 gap 2d no longer counts, f9 judged as strict; f8 stays unverifiable (H3c)
    expect(w(1).phantom).toBe(2);
    expect(w(1).strictRate).toBeCloseTo(6 / 9, 10);
    // W=30: only f1, f2 (exactly 30d before end) are not pending
    expect(w(30).phantom).toBe(0);
    expect(w(30).strictRate).toBeCloseTo(1, 10);
  });

  it('weekly buckets add up to the totals', () => {
    const r = run(fixture());
    const sum = (k: 'billed' | 'phantom') => r.weekly.reduce((a, x) => a + x[k], 0);
    expect(sum('phantom')).toBe(r.phantom);
    expect(sum('billed')).toBe(r.billed);
    for (const wk of r.weekly) expect(wk.weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
describe('window boundaries', () => {
  it('a conversation exactly W days before exportEnd is NOT pending; 1 ms later is', () => {
    const a = conv({ createdAt: at(7) });
    const b = conv({ createdAt: new Date(at(7).getTime() + 1) });
    const r = run([a, b]);
    expect(byId(r, a.id).verdict).toBe('strict_pass');
    expect(byId(r, b.id).verdict).toBe('pending_window');
  });

  it('pending wins over fail signals (rule 1 first) and pending is excluded from rates', () => {
    const p = conv({ createdAt: at(1), humanReplied: true });
    const ok = conv({ createdAt: at(20) });
    const r = run([p, ok]);
    expect(byId(r, p.id).verdict).toBe('pending_window');
    expect(r.phantom).toBe(0);
    expect(r.strictRate).toBe(1);
  });

  it('exportEnd defaults to the max createdAt in the input', () => {
    const a = conv({ createdAt: at(20) });
    const b = conv({ createdAt: at(10) }); // max -> exportEnd = at(10)
    const r = audit([a, b], { ...OPTS, exportEnd: undefined }, 'generic');
    expect(byId(r, b.id).verdict).toBe('pending_window');
    expect(byId(r, a.id).verdict).toBe('strict_pass'); // at(20) == at(10) - 10d, not pending
    expect(r.period.end.getTime()).toBe(at(10).getTime());
  });

  it('repeat contact interval is (t, t+W]: exactly +W counts, +W+1ms does not, same instant does not', () => {
    const t0 = at(40);
    const mk = (offsetMs: number, k: string) => [
      conv({ id: `${k}-a`, customerKey: k, createdAt: t0 }),
      conv({ id: `${k}-b`, customerKey: k, createdAt: new Date(t0.getTime() + offsetMs) }),
    ];
    const r = run([...mk(7 * DAY, 'exact'), ...mk(7 * DAY + 1, 'over'), ...mk(0, 'same')]);
    expect(byId(r, 'exact-a').verdict).toBe('phantom');
    expect(byId(r, 'over-a').verdict).toBe('strict_pass');
    expect(byId(r, 'same-a').verdict).toBe('strict_pass');
    expect(byId(r, 'same-b').verdict).toBe('strict_pass');
  });
});

// ---------------------------------------------------------------------------
describe('repeat contact chains and evidence', () => {
  it('chain A(t) B(t+3) C(t+6) D(t+20): A and B fail, C and D pass', () => {
    const t = at(40).getTime();
    const cs = [0, 3, 6, 20].map((d, i) =>
      conv({ id: `ch${i}`, customerKey: 'K', createdAt: new Date(t + d * DAY) }),
    );
    const r = run(cs);
    expect(byId(r, 'ch0').verdict).toBe('phantom');
    expect(byId(r, 'ch1').verdict).toBe('phantom');
    expect(byId(r, 'ch2').verdict).toBe('strict_pass');
    expect(byId(r, 'ch3').verdict).toBe('strict_pass');
  });

  it('evidence names the other conversation and the gap to one decimal', () => {
    const a = conv({ id: 'ev-a', customerKey: 'K2', createdAt: at(30) });
    const b = conv({ id: 'ev-b', customerKey: 'K2', createdAt: new Date(at(30).getTime() + 2.3 * DAY) });
    const ev = byId(run([a, b]), 'ev-a').evidence.join(' ');
    expect(ev).toContain('ev-b');
    expect(ev).toContain('2.3');
  });

  it('a later NON-AI or unbilled contact by the same customer still counts', () => {
    const a = conv({ id: 'na-a', customerKey: 'K3', createdAt: at(30) });
    const b = conv({ id: 'na-b', customerKey: 'K3', createdAt: at(29), aiInvolved: false, billed: false });
    expect(byId(run([a, b]), 'na-a').verdict).toBe('phantom');
  });

  it('a later contact that falls in the pending window still counts against an earlier one', () => {
    const a = conv({ id: 'pw-a', customerKey: 'K4', createdAt: at(8) });
    const b = conv({ id: 'pw-b', customerKey: 'K4', createdAt: at(6) });
    const r = run([a, b]);
    expect(byId(r, 'pw-a').verdict).toBe('phantom');
    expect(byId(r, 'pw-b').verdict).toBe('pending_window');
  });

  it('input order does not matter (unsorted conversations)', () => {
    const a = conv({ id: 'o-a', customerKey: 'K5', createdAt: at(30) });
    const b = conv({ id: 'o-b', customerKey: 'K5', createdAt: at(28) });
    expect(byId(run([b, a]), 'o-a').verdict).toBe('phantom');
  });

  it('same-topic filter: unrelated topics do not count, identical topics do (even with corpus-common words)', () => {
    const filler = [
      conv({ customerKey: 'x1', createdAt: at(50), topicText: 'shipping address change for my order' }),
      conv({ customerKey: 'x2', createdAt: at(50), topicText: 'invoice copy for last month please' }),
      conv({ customerKey: 'x3', createdAt: at(50), topicText: 'my order refund was not received' }),
    ];
    const a = conv({ id: 't-a', customerKey: 'T', createdAt: at(30), topicText: 'my order refund was not received' });
    const b = conv({ id: 't-b', customerKey: 'T', createdAt: at(29), topicText: 'my order refund was not received' });
    const c = conv({ id: 't-c', customerKey: 'U', createdAt: at(30), topicText: 'refund for order 123 not received' });
    const d = conv({ id: 't-d', customerKey: 'U', createdAt: at(29), topicText: 'how do I reset my password' });
    const r = run([...filler, a, b, c, d], { sameTopicOnly: true });
    expect(byId(r, 't-a').verdict).toBe('phantom');
    expect(byId(r, 't-c').verdict).toBe('strict_pass');
  });
});

// ---------------------------------------------------------------------------
describe('fail signals and verdict rules', () => {
  it.each(['escalated', 'handoff', 'negative_feedback'] as const)('vendorState %s fires vendor_escalated', (s) => {
    const c = conv({ createdAt: at(20), vendorState: s });
    expect(byId(run([c]), c.id)).toMatchObject({ verdict: 'phantom', reasons: ['vendor_escalated'] });
  });

  it('humanReplied null and reopenCount null do not fire', () => {
    const c = conv({ createdAt: at(20), humanReplied: null, reopenCount: null });
    expect(byId(run([c]), c.id).verdict).toBe('strict_pass');
  });

  it('negative CSAT is strictly below the threshold', () => {
    const lo = conv({ createdAt: at(20), csat: 0.25 });
    const eq = conv({ createdAt: at(20), csat: 0.4 });
    const zero = conv({ createdAt: at(20), csat: 0 });
    const r = run([lo, eq, zero]);
    expect(byId(r, lo.id).reasons).toContain('negative_csat');
    expect(byId(r, eq.id).reasons).not.toContain('negative_csat');
    expect(byId(r, zero.id).reasons).toContain('negative_csat');
  });

  it('confirmed vendor state with a fail signal is phantom, not confirmed_pass', () => {
    const c = conv({ createdAt: at(20), vendorState: 'confirmed', reopenCount: 1 });
    expect(byId(run([c]), c.id).verdict).toBe('phantom');
  });

  it('no customer key but a fail signal present -> phantom, not unverifiable', () => {
    const c = conv({ createdAt: at(20), customerKey: null, humanReplied: true });
    expect(byId(run([c]), c.id).verdict).toBe('phantom');
  });

  it('unbilled failing conversation is never counted as phantom or as dollars at risk', () => {
    const c = conv({ createdAt: at(20), billed: false, humanReplied: true });
    const r = run([c]);
    expect(r.phantom).toBe(0);
    expect(r.dollarsAtRisk).toBe(0);
    expect(r.strictRate).toBe(0);
  });

  it('results contain exactly one verdict per AI conversation', () => {
    const r = run(fixture());
    expect(r.results.length).toBe(r.aiConversations);
    expect(new Set(r.results.map((x) => x.id)).size).toBe(r.results.length);
  });

  it('duplicate conversation objects are deduped by id (defensive, audit level)', () => {
    const a = conv({ id: 'dup', customerKey: 'D1', createdAt: at(20) });
    const r = run([a, { ...a }]);
    expect(r.aiConversations).toBe(1);
    expect(byId(r, 'dup').verdict).toBe('strict_pass'); // must not repeat-contact itself
  });

  it('empty input and all-pending input yield zero rates, never NaN', () => {
    for (const r of [run([]), run([conv({ createdAt: at(1) })])]) {
      for (const k of ['billedRate', 'strictRate', 'phantomShareOfBilled', 'dollarsAtRisk'] as const) {
        expect(Number.isFinite(r[k])).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
const GENERIC_MAP = {
  id: 'id',
  createdAt: 'created',
  customerKey: 'email',
  billed: 'billed',
  billedValue: 'yes,TRUE',
  aiInvolved: null,
  humanReplied: 'human',
  reopenCount: 'reopens',
  csat: 'csat',
  topicText: null,
};

describe('parsing: CSV dialects, time zones, generic mapping', () => {
  it('handles BOM, semicolon delimiter and quoted newlines', async () => {
    const csv =
      '﻿id;created;email;billed;human;reopens;csat\n' +
      '1;2026-10-01T10:00:00Z;a@x.com;yes;0;0;5\n' +
      '2;2026-10-02T10:00:00Z;"b@x.com";"TRUE";0;0;"4"\n' +
      '3;2026-10-03T10:00:00Z;c@x.com;no;"1";0;"3"\n';
    const { conversations, headers } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    expect(headers[0]).toBe('id');
    expect(conversations.map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(conversations.map((c) => c.billed)).toEqual([true, true, false]); // case-insensitive, comma list
    expect(conversations[2].humanReplied).toBe(true);
  });

  it('quoted newlines inside a field do not split rows', async () => {
    const csv = 'id,created,email,billed,human,reopens,csat\n1,2026-10-01T10:00:00Z,a@x.com,yes,0,0,"line1\nline2"\n2,2026-10-02T10:00:00Z,b@x.com,yes,0,0,\n';
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    expect(conversations.length).toBe(2);
  });

  it('ISO with offset is converted; naive timestamps are UTC with a warning; unix seconds work', async () => {
    const csv =
      'id,created,email,billed,human,reopens,csat\n' +
      '1,2026-10-01T23:30:00-05:00,a@x.com,yes,0,0,\n' +
      '2,2026-10-01 12:00:00,b@x.com,yes,0,0,\n' +
      '3,1759312800,c@x.com,yes,0,0,\n';
    const { conversations, warnings } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    const byIdc = Object.fromEntries(conversations.map((c) => [c.id, c]));
    expect(byIdc['1'].createdAt.toISOString()).toBe('2026-10-02T04:30:00.000Z');
    expect(byIdc['2'].createdAt.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(byIdc['3'].createdAt.toISOString()).toBe(new Date(1759312800 * 1000).toISOString());
    expect(warnings.join(' ').toLowerCase()).toMatch(/utc|time ?zone/);
  });

  it('duplicate rows are deduped by id', async () => {
    const csv = 'id,created,email,billed,human,reopens,csat\n1,2026-10-01T10:00:00Z,a@x.com,yes,0,0,\n1,2026-10-01T10:00:00Z,a@x.com,yes,0,0,\n';
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    expect(conversations.length).toBe(1);
  });

  it('missing mapped columns and unparseable dates warn instead of throwing', async () => {
    const csv = 'id,created,email,billed\n1,not a date,a@x.com,yes\n2,2026-10-01T10:00:00Z,b@x.com,yes\n';
    const res = await parseFile(csv, { preset: 'generic', mapping: { ...GENERIC_MAP, reopenCount: 'nope' } });
    expect(res.conversations.map((c) => c.id)).toEqual(['2']);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('empty file does not crash', async () => {
    const res = await parseFile('', { preset: 'generic', mapping: GENERIC_MAP });
    expect(res.conversations).toEqual([]);
  });

  it('customer identifiers are not kept in clear text (privacy page claims per-session salted hashing)', async () => {
    const csv = 'id,created,email,billed,human,reopens,csat\n1,2026-10-01T10:00:00Z,alice@example.com,yes,0,0,\n';
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    expect(conversations[0].customerKey).not.toBeNull();
    expect(conversations[0].customerKey).not.toContain('alice');
  });

  it('CSAT on a 1-5 scale is normalised by the scale, not by the observed min/max', async () => {
    // A file whose ratings are only 4s and 5s must not turn a 4 into 0.
    const csv =
      'id,created,email,billed,human,reopens,csat\n' +
      '1,2026-10-01T10:00:00Z,a@x.com,yes,0,0,4\n' +
      '2,2026-10-01T10:00:00Z,b@x.com,yes,0,0,5\n';
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    const c = Object.fromEntries(conversations.map((x) => [x.id, x.csat]));
    expect(c['1']).toBeCloseTo(0.75, 5);
    expect(c['2']).toBeCloseTo(1, 5);
  });

  it('CSAT 2 on 1-5 becomes 0.25 (Standard section 4) and 0..1 values pass through', async () => {
    const csv =
      'id,created,email,billed,human,reopens,csat\n' +
      '1,2026-10-01T10:00:00Z,a@x.com,yes,0,0,2\n' +
      '2,2026-10-01T10:00:00Z,b@x.com,yes,0,0,1\n' +
      '3,2026-10-01T10:00:00Z,c@x.com,yes,0,0,5\n';
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: GENERIC_MAP });
    const c = Object.fromEntries(conversations.map((x) => [x.id, x.csat]));
    expect(c['1']).toBeCloseTo(0.25, 5);
    expect(c['2']).toBeCloseTo(0, 5);
  });
});

describe('Intercom preset (JSONL, legacy states)', () => {
  const line = (id: string, state: string | null, extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id,
      created_at: 1759312800,
      ai_agent_participated: true,
      ai_agent: { resolution_state: state, rating: null },
      statistics: { count_reopens: 0, last_admin_reply_at: null },
      contacts: { contacts: [{ id: `contact-${id}` }] },
      ...extra,
    });

  it('maps current and legacy resolution_state names', async () => {
    const jsonl = [
      line('1', 'assumed_resolution'),
      line('2', 'confirmed_resolution'),
      line('3', 'escalated'),
      line('4', 'routed_to_team'),
      line('5', 'abandoned'),
      line('6', 'procedure_handoff'),
      line('7', 'negative_feedback'),
      JSON.stringify({ id: '8', created_at: 1759312800, ai_agent_participated: false }),
    ].join('\n');
    const { conversations } = await parseFile(jsonl, { preset: 'intercom' });
    const s = Object.fromEntries(conversations.map((c) => [c.id, c]));
    expect(s['1']).toMatchObject({ vendorState: 'assumed', billed: true, aiInvolved: true });
    expect(s['2']).toMatchObject({ vendorState: 'confirmed', billed: true });
    expect(s['3']).toMatchObject({ vendorState: 'escalated', billed: false });
    expect(s['4']).toMatchObject({ vendorState: 'escalated', billed: false });
    expect(s['5']).toMatchObject({ vendorState: 'negative_feedback', billed: false });
    expect(s['6']).toMatchObject({ vendorState: 'handoff', billed: false });
    expect(s['7']).toMatchObject({ vendorState: 'negative_feedback', billed: false });
    expect(s['8'].aiInvolved).toBe(false);
  });

  it('created_at unix seconds and ISO strings both parse', async () => {
    const jsonl = [line('1', 'assumed_resolution'), line('2', 'assumed_resolution', { created_at: '2025-10-01T10:00:00Z' })].join('\n');
    const { conversations } = await parseFile(jsonl, { preset: 'intercom' });
    const s = Object.fromEntries(conversations.map((c) => [c.id, c.createdAt.toISOString()]));
    expect(s['1']).toBe(new Date(1759312800 * 1000).toISOString());
    expect(s['2']).toBe('2025-10-01T10:00:00.000Z');
  });

  it('conversation_rating 1-5 is normalised (2 -> 0.25)', async () => {
    const jsonl = line('1', 'assumed_resolution', { conversation_rating: { rating: 2 } });
    const { conversations } = await parseFile(jsonl, { preset: 'intercom' });
    expect(conversations[0].csat).toBeCloseTo(0.25, 5);
  });
});

describe('detectPreset', () => {
  it('recognises vendor headers and falls back to generic', () => {
    expect(detectPreset(['id', 'created_at', 'ai_agent_participated', 'ai_agent.resolution_state'], []).preset).toBe('intercom');
    expect(detectPreset(['Ticket ID', 'Resolution type', 'Resolution tier', 'Requester email'], []).preset).toBe('zendesk');
    expect(detectPreset(['_id', 'automated_resolution_classification', 'is_escalated', 'end_user_id', 'date_created'], []).preset).toBe('ada');
    const g = detectPreset(['foo', 'bar', 'baz'], []);
    expect(g.preset).toBe('generic');
    expect(g.confidence).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
describe('outputs: dispute CSV, summary, contribution payload', () => {
  it('dispute CSV has one row per phantom and neutralises spreadsheet formula injection', () => {
    const evil = conv({ id: '=HYPERLINK("http://x","y")', createdAt: at(20), humanReplied: true });
    const convs = [...fixture(), evil];
    const r = run(convs);
    const csv = toDisputeCsv(r, convs);
    const lines = csv.trim().split(/\r?\n/);
    expect(lines.length).toBe(1 + r.phantom);
    for (const l of lines.slice(1)) {
      for (const cell of l.split(',')) expect(cell.replace(/^"/, '')).not.toMatch(/^[=+\-@]/);
    }
  });

  it('summary text cites vendor, window, version and never says fraud', () => {
    const r = run(fixture());
    const t = disputeSummaryText(r, OPTS, 'Intercom');
    expect(t).toContain('Intercom');
    expect(t).toContain('0.2');
    expect(t).toMatch(/(^|\D)7(\D|$)/);
    expect(t.toLowerCase()).not.toContain('fraud');
  });

  it('contribution payload: aggregates only, passes the server schema, leaks no ids/keys/text', () => {
    const convs = fixture().map((c) => ({ ...c, topicText: `secret topic ${c.id}` }));
    const r = run(convs);
    const p = contributionPayload(r, OPTS);
    expect(contributionSchema.safeParse(p).success).toBe(true);
    expect(p.aiConversationsBucket).toBe('<1k');
    expect(p.windowDays).toBe(7);
    const s = JSON.stringify(p);
    for (const c of convs) {
      expect(s).not.toContain(`"${c.id}"`);
      if (c.customerKey) expect(s).not.toContain(`"${c.customerKey}"`);
    }
    expect(s).not.toContain('secret topic');
  });
});

describe('sample datasets', () => {
  it.each(['intercom', 'zendesk', 'generic'] as const)('%s sample is deterministic and audits sensibly', async (preset) => {
    const a = sampleDataset(preset, 42);
    expect(sampleDataset(preset, 42)).toBe(a);
    const { conversations } = await parseFile(a, { preset });
    const r = audit(conversations, { ...OPTS, exportEnd: undefined }, preset);
    expect(r.aiConversations).toBeGreaterThan(0);
    expect(r.billed).toBeGreaterThan(0);
    for (const k of ['billedRate', 'strictRate', 'phantomShareOfBilled'] as const) {
      expect(r[k]).toBeGreaterThanOrEqual(0);
      expect(r[k]).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
describe('performance (SPEC: 500k rows < 10 s)', () => {
  it('audits 500k conversations in under 10 s', () => {
    const N = 500_000;
    const base = at(200).getTime();
    const convs: Conversation[] = new Array(N);
    for (let i = 0; i < N; i++) {
      convs[i] = {
        id: `p${i}`,
        customerKey: `k${i % 120_000}`,
        createdAt: new Date(base + ((i * 7919) % (190 * DAY))),
        closedAt: null,
        aiInvolved: true,
        vendorState: i % 10 === 0 ? 'confirmed' : 'assumed',
        billed: i % 4 !== 0,
        humanReplied: i % 13 === 0,
        reopenCount: i % 17 === 0 ? 1 : 0,
        csat: i % 5 === 0 ? (i % 3) / 2 : null,
        channel: null,
        topicText: null,
      };
    }
    const t = performance.now();
    const r = run(convs);
    const ms = performance.now() - t;
    expect(r.aiConversations).toBe(N);
    expect(ms).toBeLessThan(10_000);
  }, 60_000);

  it('parses a 500k-row generic CSV in under 10 s', async () => {
    const rows = ['id,created,email,billed,human,reopens,csat'];
    const base = Date.parse('2026-01-01T00:00:00Z');
    for (let i = 0; i < 500_000; i++) {
      rows.push(`${i},${new Date(base + i * 30_000).toISOString()},u${i % 90_000}@x.com,yes,0,0,`);
    }
    const t = performance.now();
    const { conversations } = await parseFile(rows.join('\n'), { preset: 'generic', mapping: GENERIC_MAP });
    expect(conversations.length).toBe(500_000);
    expect(performance.now() - t).toBeLessThan(10_000);
  }, 60_000);
});
