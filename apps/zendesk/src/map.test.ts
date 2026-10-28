import { describe, expect, it } from 'vitest';
import { audit, parseFile, type AuditOptions, type AuditReport } from '@/engine';
import { makeKeyHasher } from '@/engine/hash';
import { withBilledBasis } from './basis';
import { replyAfterAi, transcriptSpeakers } from './comments';
import { findResolutionFields, toConversations } from './map';
import type { MapInput, ZMetricSet, ZTicket } from './types';
import { parseUsageCsv } from './usage-csv';

const TIER_ID = 18118306299535;
const TYPE_ID = 18118306286095;
const FIELDS = { tier: TIER_ID, type: TYPE_ID };
// Option values and labels as read live from a Zendesk account (docs/P0-SPIKE-REPORT.md).
const TIERS: [string, string][] = [
  ['zd_resolution_tier_core_resolution', 'Verified resolution'],
  ['zd_resolution_tier_contained_resolution', 'Contained resolution'],
  ['zd_resolution_tier_assisted_escalation', 'Assisted escalation'],
  ['zd_resolution_tier_non_automated', 'Non-automated'],
];
const TYPES: Record<string, [string, string]> = {
  zd_resolution_tier_core_resolution: ['zd_automated_resolution', 'Automated'],
  zd_resolution_tier_contained_resolution: ['zd_automated_resolution', 'Automated'],
  zd_resolution_tier_assisted_escalation: ['zd_assisted_resolution', 'Assisted'],
  zd_resolution_tier_non_automated: ['', ''],
};

const START = Date.parse('2026-08-01T00:00:00Z');
const FETCHED = '2026-10-24T12:00:00.000Z';
const DAY = 86_400_000;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Row {
  t: ZTicket;
  m: ZMetricSet;
  tierLabel: string;
  typeLabel: string;
}

function dataset(n: number, seed: number): Row[] {
  const r = rng(seed);
  const span = Date.parse(FETCHED) - START;
  const rows: Row[] = [];
  for (let i = 0; i < n; i++) {
    const id = 1000 + i;
    const created = new Date(START + Math.floor(r() * span));
    const isAi = r() < 0.55;
    const [tierV, tierL] = isAi ? TIERS[Math.floor(r() * 3)] : r() < 0.5 ? TIERS[3] : ['', ''];
    const [typeV, typeL] = tierV ? TYPES[tierV] : ['', ''];
    const solved = r() < 0.85 ? new Date(created.getTime() + Math.floor(r() * 3 * DAY)).toISOString() : null;
    const score = ['good', 'bad', 'offered', 'unoffered', ''][Math.floor(r() * 5)];
    const replies = r() < 0.2 ? null : Math.floor(r() * 3) * (r() < 0.6 ? 0 : 1);
    const reopens = r() < 0.15 ? null : r() < 0.12 ? 1 : 0;
    const tags = r() < 0.05 && isAi ? ['ai_agent_automated_resolution'] : ['x'];
    rows.push({
      t: {
        id,
        created_at: created.toISOString(),
        status: solved ? 'solved' : 'open',
        requester_id: 500 + Math.floor(r() * 300),
        subject: `Order question ${i % 17}`,
        tags,
        via: { channel: r() < 0.7 ? 'web' : 'email' },
        custom_fields: [
          { id: TIER_ID, value: tierV || null },
          { id: TYPE_ID, value: typeV || null },
        ],
        satisfaction_rating: score ? { score } : null,
      },
      m: { ticket_id: id, replies, reopens, solved_at: solved },
      tierLabel: tierL,
      typeLabel: typeL,
    });
  }
  return rows;
}

function toCsv(rows: Row[]): string {
  const head = [
    'Ticket ID',
    'Ticket created - Timestamp',
    'Ticket solved - Timestamp',
    'Requester ID',
    'Resolution tier',
    'Resolution type',
    'Tags',
    'Agent replies',
    'Reopens',
    'Satisfaction score',
    'Subject',
    'Channel',
  ];
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map(({ t, m, tierLabel, typeLabel }) =>
    [
      t.id,
      t.created_at,
      m.solved_at ?? '',
      t.requester_id,
      tierLabel,
      typeLabel,
      (t.tags ?? []).join(' '),
      m.replies ?? '',
      m.reopens ?? '',
      t.satisfaction_rating?.score === 'good' ? 'Good' : t.satisfaction_rating?.score === 'bad' ? 'Bad' : '',
      t.subject,
      t.via?.channel,
    ]
      .map(q)
      .join(','),
  );
  return [head.map(q).join(','), ...lines].join('\n');
}

function input(rows: Row[], extra: Partial<MapInput> = {}): MapInput {
  const ai = rows.filter((x) => x.tierLabel && x.tierLabel !== 'Non-automated');
  return {
    aiTickets: ai.map((x) => x.t),
    otherTickets: rows.map((x) => x.t), // the unscoped export overlaps the scoped one
    metricSets: rows.map((x) => x.m),
    fields: FIELDS,
    periodStart: new Date(START).toISOString(),
    fetchedAt: FETCHED,
    ...extra,
  };
}

function comparable(r: AuditReport) {
  // warnings, rowsRead and rowsSkipped describe the input format, not the verdicts.
  const rest: Partial<AuditReport> = { ...r };
  delete rest.warnings;
  delete rest.rowsRead;
  delete rest.rowsSkipped;
  return { ...rest, results: [...r.results].sort((a, b) => a.id.localeCompare(b.id)) };
}

describe('API mapping matches the Zendesk CSV preset on the same tickets', () => {
  const rows = dataset(3000, 7);
  const opts: AuditOptions[] = [
    { windowDays: 7, pricePerResolution: 1.5, sameTopicOnly: false, negativeCsatThreshold: 0.4, exportEnd: new Date(FETCHED) },
    { windowDays: 3, pricePerResolution: 1.5, sameTopicOnly: false, negativeCsatThreshold: 0.4, exportEnd: new Date(FETCHED), countAgentReplies: true },
  ];

  it.each(opts)('window %#', async (o) => {
    const hash = makeKeyHasher();
    const api = toConversations(input(rows), hash).conversations;
    const csv = (await parseFile(toCsv(rows), { preset: 'zendesk' })).conversations;
    expect(api.length).toBe(csv.length);
    const a = audit(api, o, 'zendesk');
    const b = audit(csv, o, 'zendesk');
    expect(a.aiConversations).toBeGreaterThan(1000);
    expect(a.phantom).toBeGreaterThan(0);
    expect(comparable(a)).toEqual(comparable(b));
  });
});

describe('toConversations', () => {
  const base = (t: Partial<ZTicket>): ZTicket => ({
    id: 1,
    created_at: '2026-09-01T10:00:00Z',
    requester_id: 9,
    custom_fields: [],
    ...t,
  });
  const run = (tickets: ZTicket[], extra: Partial<MapInput> = {}, scoped = true) =>
    toConversations(
      {
        aiTickets: scoped ? tickets : [],
        otherTickets: scoped ? [] : tickets,
        metricSets: [],
        fields: FIELDS,
        periodStart: '2026-08-01T00:00:00Z',
        fetchedAt: FETCHED,
        ...extra,
      },
      makeKeyHasher(),
    );

  it('drops deleted, undated and pre-period tickets and counts them', () => {
    const { conversations, stats } = run([
      base({ id: 1, status: 'deleted' }),
      base({ id: 2, created_at: 'nope' }),
      base({ id: 3, created_at: '2026-07-31T23:59:59Z' }),
      base({ id: 4 }),
    ]);
    expect(conversations.map((c) => c.id)).toEqual(['4']);
    expect(stats).toMatchObject({ ticketsRead: 4, droppedDeleted: 1, droppedNoDate: 1, droppedBeforePeriod: 1 });
  });

  it('treats an AI-scoped ticket without resolution fields as AI with unknown state, unbilled', () => {
    const [c] = run([base({})]).conversations;
    expect(c).toMatchObject({ aiInvolved: true, vendorState: 'unknown', billed: false });
    const [d] = run([base({})], {}, false).conversations;
    expect(d).toMatchObject({ aiInvolved: false, vendorState: 'not_ai' });
  });

  it('lets the Usage CSV replace the tier proxy and reports unmatched ids', () => {
    const verified = { id: TIER_ID, value: 'zd_resolution_tier_core_resolution' };
    const contained = { id: TIER_ID, value: 'zd_resolution_tier_contained_resolution' };
    const tickets = [base({ id: 1, custom_fields: [verified] }), base({ id: 2, custom_fields: [contained] })];
    const proxy = run(tickets);
    expect(proxy.conversations.map((c) => c.billed)).toEqual([true, false]);
    expect(proxy.stats.billedByTier).toBe(1);
    const exact = run(tickets, { billedIds: [2, 77] });
    expect(exact.conversations.map((c) => c.billed)).toEqual([false, true]);
    expect(exact.stats).toMatchObject({ billedByTier: 1, billedByUsageCsv: 1, usageCsvUnmatched: 1 });
  });

  it('uses a checked reply order as humanReplied and the reply count otherwise', () => {
    const tickets = [base({ id: 1 }), base({ id: 2 })];
    const res = run(tickets, {
      metricSets: [
        { ticket_id: 1, replies: 2 },
        { ticket_id: 2, replies: 1 },
      ],
      replyOrder: { 1: false },
    });
    expect(res.conversations[0]).toMatchObject({ humanReplied: false, agentReplied: undefined });
    expect(res.conversations[1]).toMatchObject({ humanReplied: null, agentReplied: true });
    expect(res.stats.replyOrderChecked).toBe(1);
  });

  it('reads an inlined metric_set and satisfaction words', () => {
    const [c] = run([
      base({ metric_set: { reopens: 2, replies: 0, solved_at: '2026-09-02T00:00:00Z' }, satisfaction_rating: { score: 'bad' } }),
    ]).conversations;
    expect(c).toMatchObject({ reopenCount: 2, agentReplied: false, csat: 0 });
    expect(c.closedAt?.toISOString()).toBe('2026-09-02T00:00:00.000Z');
  });
});

describe('findResolutionFields', () => {
  it('prefers the system key, falls back to the title', () => {
    expect(
      findResolutionFields([
        { id: 1, title: 'Resolution tier' },
        { id: 2, key: 'standard::resolution_tier', title: 'Tier (renamed)' },
        { id: 3, title: ' resolution type ' },
      ]),
    ).toEqual({ tier: 2, type: 3 });
    expect(findResolutionFields([])).toEqual({ tier: null, type: null });
  });
});

describe('replyAfterAi', () => {
  const users = [
    { id: 1, role: 'end-user' }, // requester
    { id: 2, role: 'end-user' }, // AI agent system user (its comments carry the marker)
    { id: 3, role: 'agent' },
    { id: 5, role: 'end-user' }, // a CC on the ticket
  ];
  const c = (id: number, author: number, at: string, pub = true, rel?: string) => ({
    id,
    author_id: author,
    public: pub,
    created_at: at,
    via: rel ? { channel: 'native_messaging', source: { rel } } : null,
  });

  it('true when a staff public reply follows the first marked AI comment', () => {
    expect(replyAfterAi([c(1, 1, '2026-09-01T10:00:00Z'), c(2, 2, '2026-09-01T10:01:00Z', true, 'ai_agent'), c(3, 3, '2026-09-01T11:00:00Z')], users)).toBe(true);
  });
  it('false when there is no staff public reply (private notes do not count)', () => {
    expect(replyAfterAi([c(1, 1, '2026-09-01T10:00:00Z'), c(2, 3, '2026-09-01T11:00:00Z', false)], users)).toBe(false);
  });
  it('false when the staff reply came before the AI', () => {
    expect(replyAfterAi([c(1, 3, '2026-09-01T09:00:00Z'), c(2, 2, '2026-09-01T10:00:00Z', true, 'ai_agent')], users)).toBe(false);
  });
  it('detects AI comments by via.source.rel even from a staff-role author', () => {
    const u = [{ id: 1, role: 'end-user' }, { id: 4, role: 'agent' }, { id: 3, role: 'agent' }];
    expect(replyAfterAi([c(1, 4, '2026-09-01T10:00:00Z', true, 'ai_agent'), c(2, 3, '2026-09-01T10:05:00Z')], u)).toBe(true);
  });
  it('null when no AI comment is marked (order unknown)', () => {
    expect(replyAfterAi([c(1, 1, '2026-09-01T10:00:00Z'), c(2, 3, '2026-09-01T11:00:00Z')], users)).toBeNull();
  });
  it('real AI-agent tickets: no AI comment, but the ticket start marks the AI (observed 2026-10-25)', () => {
    const placeholder = c(1, 1, '2026-09-01T10:00:00Z', false); // private "Conversation with Web User ..."
    const staffReply = c(2, 3, '2026-09-01T10:05:00Z');
    expect(replyAfterAi([placeholder, staffReply], users, '2026-09-01T10:00:00Z')).toBe(true);
    expect(replyAfterAi([placeholder], users, '2026-09-01T10:00:00Z')).toBe(false);
    expect(replyAfterAi([placeholder, staffReply], users)).toBeNull();
  });
  it('messaging: a teammate named in the chat transcript replied after the AI (observed 2026-10-28)', () => {
    const placeholder = c(1, 1, '2026-10-28T08:14:08Z', false);
    const transcript = (body: string) => ({
      id: 2,
      author_id: -1, // system user, not in the users list
      public: true,
      created_at: '2026-10-28T08:23:13Z',
      plain_body: body,
      via: { channel: 'chat_transcript', source: { rel: null } },
    });
    const withTeammate = transcript(
      '(16:12:54) AI agent: Hey there, how can I help you today?\n\n' +
        '(16:13:31) Web User 6ae1: Hi, what are your opening hours?\n\n' +
        '(16:14:07) AI agent: No problem, please leave your details.\n\n' +
        '(16:22:11) BAGHDADI YOUNES: Hi, this is a person from the team.',
    );
    const aiOnly = transcript(
      '(16:17:50) AI agent: Hey there.\n\n(16:18:02) Web User 77ab: Thanks!\n\n(16:18:05) AI agent: You are welcome!',
    );
    const staff = new Set(['BAGHDADI YOUNES']);
    const start = '2026-10-28T08:13:32Z';
    expect(replyAfterAi([placeholder, withTeammate], users, start, staff)).toBe(true);
    expect(replyAfterAi([placeholder, aiOnly], users, start, staff)).toBe(false);
    // Without the staff list the transcript proves nothing either way.
    expect(replyAfterAi([placeholder, withTeammate], users, start)).toBe(false);
    expect(transcriptSpeakers(withTeammate.plain_body)).toEqual(['AI agent', 'Web User 6ae1', 'AI agent', 'BAGHDADI YOUNES']);
  });
  it('a later end-user CC is not taken for the AI (review finding 6)', () => {
    expect(
      replyAfterAi([c(1, 1, '2026-09-01T10:00:00Z'), c(2, 3, '2026-09-01T11:00:00Z'), c(3, 5, '2026-09-01T12:00:00Z')], users),
    ).toBeNull();
  });
});

describe('parseUsageCsv', () => {
  it('finds the ticket id column and dedupes', () => {
    const r = parseUsageCsv('﻿Date,Ticket ID,Type\n2026-09-01,#101,Verified\n2026-09-02,102,Verified\n2026-09-03,101,Verified\n');
    expect(r).toEqual({ ids: [101, 102], column: 'Ticket ID', rows: 3 });
  });
  it('reports no column when none matches', () => {
    expect(parseUsageCsv('a,b\n1,2\n')).toEqual({ ids: [], column: null, rows: 1 });
  });
});

describe('review fixes in the mapper', () => {
  const verified = { id: TIER_ID, value: 'zd_resolution_tier_core_resolution' };
  const mk = (updated: string, fields: { id: number; value: unknown }[]): ZTicket => ({
    id: 1,
    created_at: '2026-09-01T10:00:00Z',
    updated_at: updated,
    requester_id: 9,
    custom_fields: fields,
  });
  const base: MapInput = {
    aiTickets: [],
    otherTickets: [],
    metricSets: [],
    fields: FIELDS,
    periodStart: '2026-08-01T00:00:00Z',
    fetchedAt: FETCHED,
  };

  it('takes the newer copy of a ticket in both exports and keeps it AI-scoped (finding 10)', () => {
    const stale = mk('2026-09-01T10:05:00Z', []);
    const fresh = mk('2026-09-02T00:00:00Z', [verified]);
    const [c] = toConversations({ ...base, aiTickets: [stale], otherTickets: [fresh] }, makeKeyHasher()).conversations;
    expect(c).toMatchObject({ aiInvolved: true, vendorState: 'verified', billed: true });
    const [d] = toConversations({ ...base, aiTickets: [fresh], otherTickets: [stale] }, makeKeyHasher()).conversations;
    expect(d).toMatchObject({ vendorState: 'verified', billed: true });
  });

  it('adds fetcher-side drops to the counts, flags missing fields and Verified tickets absent from the CSV', () => {
    const t = mk('2026-09-02T00:00:00Z', [verified]);
    const res = toConversations({ ...base, aiTickets: [t], preDropped: 5, billedIds: [42] }, makeKeyHasher());
    expect(res.stats).toMatchObject({ ticketsRead: 6, droppedBeforePeriod: 5, aiNotInUsageCsv: 1, fieldsMissing: false });
    const none = toConversations({ ...base, aiTickets: [t], fields: { tier: null, type: null } }, makeKeyHasher());
    expect(none.stats.fieldsMissing).toBe(true);
  });
});

describe('withBilledBasis (finding 7)', () => {
  const text = 'Billed as resolved: 3 of 4 judged (75%)\nReally resolved, of those billed: 2 of 3\n\nWe have attached the list of conversations.';
  const inp = (billedIds: number[] | null): MapInput => ({
    aiTickets: [],
    otherTickets: [],
    metricSets: [],
    fields: FIELDS,
    periodStart: '2026-08-01T00:00:00Z',
    fetchedAt: FETCHED,
    billedIds,
  });
  it('labels the tier proxy in the summary and the email', () => {
    const out = withBilledBasis(text, inp(null));
    expect(out).toMatch(/Billed basis: tickets whose Resolution tier is "Verified resolution"\. This is an estimate/);
    expect(out.indexOf('Billed basis')).toBeLessThan(out.indexOf('Really resolved'));
    expect(out).toMatch(/Resolution tier field on each ticket[^\n]*\n\nWe have attached/);
  });
  it('names the Usage CSV when it is the basis', () => {
    expect(withBilledBasis(text, inp([1, 2]))).toMatch(/the 2 ticket ids in the Zendesk Usage > Resolutions export/);
  });
});

describe('support_type marks AI-agent tickets (observed 2026-10-25)', () => {
  it('treats support_type ai_agent as AI-scoped even from the unscoped export', () => {
    const t: ZTicket = { id: 9, created_at: '2026-09-01T10:00:00Z', requester_id: 1, support_type: 'ai_agent', custom_fields: [] };
    const res = toConversations(
      { aiTickets: [], otherTickets: [t], metricSets: [], fields: FIELDS, periodStart: '2026-08-01T00:00:00Z', fetchedAt: FETCHED },
      makeKeyHasher(),
    );
    expect(res.conversations[0]).toMatchObject({ aiInvolved: true, vendorState: 'unknown', billed: false });
  });
});
