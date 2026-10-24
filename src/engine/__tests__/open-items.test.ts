// Tests for the open items of docs/REVIEW-FINAL.md: Zendesk agent replies, Intercom customer key,
// effective options in outputs, price rounding, slash dates, reopen timestamps, JSON wrappers.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  audit,
  contributionPayload,
  disputeSummaryText,
  parseFile,
  peekFile,
  sampleDataset,
  toDisputeCsv,
  type AuditOptions,
  type Conversation,
} from '@/engine';
import { parseTimestamp } from '../time';

const DAY = 86_400_000;
const E = new Date('2026-10-31T00:00:00Z');
const at = (d: number) => new Date(E.getTime() - d * DAY);
let seq = 0;
const conv = (p: Partial<Conversation> = {}): Conversation => {
  seq += 1;
  return {
    id: `o${seq}`,
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
const verdict = (convs: Conversation[], id: string, o: Partial<AuditOptions> = {}) =>
  run(convs, o).results.find((r) => r.id === id);

// ---------------------------------------------------------------------------
// MEDIUM: Zendesk "Agent replies" cannot show the reply came after the AI
// ---------------------------------------------------------------------------

describe('Zendesk agent replies (human_handoff is off by default)', () => {
  const zendeskCsv = (rows: string[]) =>
    [
      'Ticket ID,Created at,Requester email,Resolution type,Resolution tier,Agent replies,Reopens',
      ...rows,
    ].join('\n');
  const rowsCsv = zendeskCsv([
    '1,2026-09-01T10:00:00Z,a@x.example,Automated,Verified,2,0',
    '2,2026-09-01T11:00:00Z,b@x.example,Automated,Verified,0,0',
    '3,2026-09-01T12:00:00Z,c@x.example,Automated,Verified,1,0',
    '4,2026-10-30T12:00:00Z,d@x.example,Automated,Verified,0,0',
  ]);

  it('the parser keeps the count apart: humanReplied stays null, agentReplied carries it', async () => {
    const { conversations } = await parseFile(rowsCsv, { preset: 'zendesk' });
    expect(conversations.map((c) => c.humanReplied)).toEqual([null, null, null, null]);
    expect(conversations.map((c) => c.agentReplied)).toEqual([true, false, true, false]);
  });

  it('by default the signal is off, no human_handoff reason appears, and the report explains why', async () => {
    const { conversations } = await parseFile(rowsCsv, { preset: 'zendesk' });
    const r = audit(conversations, { ...OPTS, exportEnd: new Date('2026-10-31T00:00:00Z') }, 'zendesk');
    expect(r.params.countAgentReplies).toBe(false);
    expect(r.byReason.human_handoff).toBe(0);
    expect(r.results.every((x) => !x.reasons.includes('human_handoff'))).toBe(true);
    const w = r.warnings.join(' ');
    expect(w).toMatch(/cannot show that the reply came after the AI/);
    expect(w).toMatch(/Count agent replies as human handoff \(cannot confirm order\)/);
    expect(w).not.toMatch(/No human-reply data/);
  });

  it('turning the option on counts every agent reply, says the order is unconfirmed, and is stored in the report', async () => {
    const { conversations } = await parseFile(rowsCsv, { preset: 'zendesk' });
    const off = audit(conversations, OPTS, 'zendesk');
    const on = audit(conversations, { ...OPTS, countAgentReplies: true }, 'zendesk');
    expect(on.params.countAgentReplies).toBe(true);
    expect(on.byReason.human_handoff).toBe(2);
    expect(on.phantom).toBe(off.phantom + 2);
    const ev = on.results.find((x) => x.reasons.includes('human_handoff'))?.evidence.join(' ') ?? '';
    expect(ev).toMatch(/cannot show whether it came after the AI/);
    expect(on.warnings.join(' ')).toMatch(/counted as human_handoff for 2 AI conversations/);
    expect(disputeSummaryText(on, undefined, 'Zendesk')).toMatch(/agent replies counted as human handoff on \(order after the AI not confirmed\)/);
    expect(disputeSummaryText(off, undefined, 'Zendesk')).toMatch(/agent replies counted as human handoff off/);
  });

  it('a column the user maps by hand as "Human reply after the AI" counts without the option', async () => {
    const { conversations } = await parseFile(rowsCsv, {
      preset: 'zendesk',
      mapping: { humanReplied: 'Agent replies' },
    });
    expect(conversations.map((c) => c.humanReplied)).toEqual([true, false, true, false]);
    const r = audit(conversations, OPTS, 'zendesk');
    expect(r.byReason.human_handoff).toBe(2);
  });

  it('the Zendesk sample shows no human_handoff by default and some with the option', async () => {
    const { conversations } = await parseFile(sampleDataset('zendesk'), { preset: 'zendesk' });
    const off = audit(conversations, OPTS, 'zendesk');
    const on = audit(conversations, { ...OPTS, countAgentReplies: true }, 'zendesk');
    expect(off.byReason.human_handoff).toBe(0);
    expect(on.sensitivity.length).toBe(5);
    expect(on.warnings.join(' ')).toMatch(/Agent replies are counted as human_handoff/);
  });

  it('other presets are not affected by the option', async () => {
    const c = conv({ id: 'x1', humanReplied: true });
    expect(verdict([c], 'x1')?.reasons).toContain('human_handoff');
    expect(verdict([c], 'x1', { countAgentReplies: false })?.reasons).toContain('human_handoff');
  });

  it('Standard section 4 and the Zendesk guide state the behaviour', () => {
    const root = join(__dirname, '..', '..', '..', 'content');
    const standard = readFileSync(join(root, 'standard.md'), 'utf8');
    const guide = readFileSync(join(root, 'vendor-guides', 'zendesk.md'), 'utf8');
    for (const text of [standard, guide]) {
      expect(text).toMatch(/Agent replies/);
      expect(text).toMatch(/Count agent replies as human handoff \(cannot confirm order\)/);
      expect(text).toMatch(/off by default/i);
    }
  });
});

// ---------------------------------------------------------------------------
// LOW: Intercom customer key on outbound conversations
// ---------------------------------------------------------------------------

describe('Intercom customer key', () => {
  const T0 = Date.UTC(2026, 8, 1) / 1000;
  const rec = (i: number, extra: Record<string, unknown>) =>
    JSON.stringify({
      id: `ic${i}`,
      created_at: T0 + i * 3600,
      ai_agent_participated: true,
      ai_agent: { resolution_state: 'assumed_resolution', created_at: T0 + i * 3600 },
      statistics: { count_reopens: 0 },
      ...extra,
    });

  it('an outbound conversation authored by a teammate gets no customer key (no false repeat contacts)', async () => {
    const lines = [1, 2, 3].map((i) => rec(i, { source: { type: 'email', author: { type: 'admin', id: '9', email: 'teammate@corp.example' } } }));
    const { conversations } = await parseFile(lines.join('\n'), { preset: 'intercom' });
    expect(conversations.map((c) => c.customerKey)).toEqual([null, null, null]);
    const r = audit(conversations, { ...OPTS, exportEnd: new Date((T0 + 90 * 86400) * 1000) }, 'intercom');
    expect(r.byReason.repeat_contact).toBe(0);
    expect(r.results.every((x) => !x.reasons.includes('repeat_contact'))).toBe(true);
    expect(r.unverifiable).toBe(3);
  });

  it('a customer author is used when there is no contact, and contacts win when both exist', async () => {
    const lines = [
      rec(1, { source: { author: { type: 'user', email: 'cust@x.example' } } }),
      rec(2, { source: { author: { type: 'user', email: 'cust@x.example' } } }),
      rec(3, { contacts: { contacts: [{ id: 'real-contact' }] }, source: { author: { type: 'admin', email: 'teammate@corp.example' } } }),
    ];
    const { conversations } = await parseFile(lines.join('\n'), { preset: 'intercom' });
    expect(conversations[0].customerKey).not.toBeNull();
    expect(conversations[0].customerKey).toBe(conversations[1].customerKey);
    expect(conversations[2].customerKey).not.toBeNull();
    expect(conversations[2].customerKey).not.toBe(conversations[0].customerKey);
    expect(JSON.stringify(conversations)).not.toMatch(/cust@x|teammate@/);
  });

  it('a mixed file: teammate-authored conversations stay unkeyed while customer ones are keyed', async () => {
    const lines = [
      rec(1, { source: { author: { type: 'admin', email: 'teammate@corp.example' } } }),
      rec(2, { source: { author: { type: 'lead', id: 'lead-5' } } }),
      rec(3, { source: { author: { type: 'admin', email: 'teammate@corp.example' } } }),
    ];
    const { conversations } = await parseFile(lines.join('\n'), { preset: 'intercom' });
    expect(conversations.map((c) => c.customerKey === null)).toEqual([true, false, true]);
  });
});

// ---------------------------------------------------------------------------
// LOW: summary and contribution use the options the audit used
// ---------------------------------------------------------------------------

describe('effective options are stored in the report and used by the outputs', () => {
  const bad = (n: number) => Array.from({ length: n }, () => conv({ humanReplied: true }));

  it('an invalid window or threshold is replaced, recorded in params, and printed as replaced', () => {
    const convs = [...bad(2), conv()];
    const r = run(convs, { windowDays: 0, negativeCsatThreshold: NaN, pricePerResolution: -3 });
    expect(r.params).toEqual({
      windowDays: 7,
      pricePerResolution: 0,
      negativeCsatThreshold: 0.4,
      sameTopicOnly: false,
      countAgentReplies: false,
    });
    const text = disputeSummaryText(r, { ...OPTS, windowDays: 0, negativeCsatThreshold: NaN }, 'Vendor');
    expect(text).toContain('7-day window');
    expect(text).toContain('below 0.40');
    expect(text).not.toMatch(/NaN|0-day/);
  });

  it('the contribution carries the window the audit used', () => {
    const r = run([...bad(2), conv()], { windowDays: 0 });
    expect(contributionPayload(r, { ...OPTS, windowDays: 0 }).windowDays).toBe(7);
    const r14 = run([...bad(2), conv()], { windowDays: 14 });
    expect(contributionPayload(r14, { ...OPTS, windowDays: 3 }).windowDays).toBe(14);
  });

  it('a fractional window is rejected by the contribution instead of being filed as another window', () => {
    const r = run([...bad(2), conv()], { windowDays: 7.4 });
    expect(r.params.windowDays).toBe(7.4);
    expect(() => contributionPayload(r)).toThrow(RangeError);
    // The summary still prints the real window.
    expect(disputeSummaryText(r, undefined, 'Vendor')).toContain('7.4-day window');
  });
});

// ---------------------------------------------------------------------------
// LOW: price rounding consistent with the total
// ---------------------------------------------------------------------------

describe('summary price is not rounded differently from the total', () => {
  it('a price of 0.995 shows the exact price and the exact total', () => {
    const convs = Array.from({ length: 3 }, () => conv({ humanReplied: true }));
    const r = run(convs, { pricePerResolution: 0.995 });
    expect(r.phantom).toBe(3);
    const text = disputeSummaryText(r, undefined, 'V');
    expect(text).toContain('3 x $0.995 = $2.985');
    expect(text).toContain('that is $2.985.');
  });

  it('ordinary prices keep two decimals, and the printed price times the count equals the printed total', () => {
    const r = run(Array.from({ length: 4 }, () => conv({ humanReplied: true })), { pricePerResolution: 0.99 });
    const text = disputeSummaryText(r, undefined, 'V');
    expect(text).toContain('4 x $0.99 = $3.96');
    const r1 = run(Array.from({ length: 2 }, () => conv({ humanReplied: true })), { pricePerResolution: 1 });
    expect(disputeSummaryText(r1, undefined, 'V')).toContain('2 x $1.00 = $2.00');
  });
});

// ---------------------------------------------------------------------------
// LOW: slash dates
// ---------------------------------------------------------------------------

describe('slash dates', () => {
  const csv = (rows: string[]) => ['id,created_at,customer_email,billed', ...rows.map((r) => r)].join('\n');

  it('ambiguous dates are read month/day (the old behaviour) and a warning names that interpretation', async () => {
    const { conversations, warnings } = await parseFile(
      csv(['a,05/10/2026,x@y.example,yes', 'b,06/10/2026,z@y.example,yes']),
      { preset: 'generic' },
    );
    expect(conversations[0].createdAt.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    const w = warnings.join(' ');
    expect(w).toMatch(/ambiguous/);
    expect(w).toMatch(/month\/day\/year/);
    expect(w).toContain('"05/10/2026" is 2026-05-10');
  });

  it('a value with a first number above 12 shows the file is day/month, and every date is read that way', async () => {
    const { conversations, warnings } = await parseFile(
      csv(['a,05/10/2026,x@y.example,yes', 'b,23/04/2026,z@y.example,yes']),
      { preset: 'generic' },
    );
    expect(conversations[0].createdAt.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(conversations[1].createdAt.toISOString()).toBe('2026-04-23T00:00:00.000Z');
    expect(warnings.join(' ')).toMatch(/read as day\/month\/year/);
    expect(warnings.join(' ')).not.toMatch(/ambiguous/);
  });

  it('a value with a second number above 12 shows the file is month/day', async () => {
    const { conversations, warnings } = await parseFile(
      csv(['a,05/10/2026,x@y.example,yes', 'b,04/23/2026 14:30,z@y.example,yes']),
      { preset: 'generic' },
    );
    expect(conversations[0].createdAt.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(conversations[1].createdAt.toISOString()).toBe('2026-04-23T14:30:00.000Z');
    expect(warnings.join(' ')).toMatch(/read as month\/day\/year/);
  });

  it('a file that mixes both orders says so', async () => {
    const { warnings } = await parseFile(
      csv(['a,23/04/2026,x@y.example,yes', 'b,04/23/2026,z@y.example,yes', 'c,04/23/2026,w@y.example,yes']),
      { preset: 'generic' },
    );
    expect(warnings.join(' ')).toMatch(/mix both orders/);
  });

  it('an impossible date is skipped in either order', async () => {
    const { conversations, warnings } = await parseFile(
      csv(['a,31/02/2026,x@y.example,yes', 'b,13/13/2026,z@y.example,yes', 'c,01/02/2026,w@y.example,yes']),
      { preset: 'generic' },
    );
    expect(conversations.map((c) => c.id)).toEqual(['c']);
    expect(warnings.join(' ')).toMatch(/2 rows had no readable creation date/);
  });

  it('ISO dates produce no slash note, and parseTimestamp honours the order it is given', () => {
    expect(parseTimestamp('05/10/2026', 'dmy').date?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(parseTimestamp('05/10/2026', 'mdy').date?.toISOString()).toBe('2026-05-10T00:00:00.000Z');
    expect(parseTimestamp('13/05/2026', 'mdy').date?.toISOString()).toBe('2026-05-13T00:00:00.000Z');
    expect(parseTimestamp('5/10/26 2:30 PM', 'dmy').date?.toISOString()).toBe('2026-10-05T14:30:00.000Z');
    expect(parseTimestamp('05/10/2026 14:30 +0200').naive).toBe(false);
  });

  it('the chosen order also applies to closed dates', async () => {
    const text = ['id,created_at,closed_at,customer_email,billed', 'a,23/04/2026,05/05/2026,x@y.example,yes'].join('\n');
    const { conversations } = await parseFile(text, { preset: 'generic' });
    expect(conversations[0].closedAt?.toISOString()).toBe('2026-05-05T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// LOW: reopen timestamps against the window
// ---------------------------------------------------------------------------

describe('reopen signal', () => {
  it('with a reopen timestamp, only a reopen inside the window counts', () => {
    const inside = conv({ id: 'in', reopenCount: 1, reopenedAt: new Date(at(20).getTime() + 3 * DAY) });
    const outside = conv({ id: 'out', reopenCount: 1, reopenedAt: new Date(at(20).getTime() + 12 * DAY) });
    const convs = [inside, outside];
    expect(verdict(convs, 'in')?.reasons).toEqual(['reopened']);
    expect(verdict(convs, 'in')?.evidence.join(' ')).toMatch(/Reopened 3.0 days after it started/);
    expect(verdict(convs, 'out')?.reasons).toEqual([]);
    // A wider window brings the late reopen back in.
    expect(verdict(convs, 'out', { windowDays: 14 })?.reasons).toEqual(['reopened']);
    // The window boundary is inclusive, like repeat contact.
    const edge = conv({ id: 'edge', reopenedAt: new Date(at(20).getTime() + 7 * DAY) });
    expect(verdict([edge], 'edge')?.reasons).toEqual(['reopened']);
  });

  it('a late reopen is also counted in the sensitivity table at the right windows', () => {
    const late = conv({ id: 'late', createdAt: at(40), reopenCount: 1, reopenedAt: new Date(at(40).getTime() + 10 * DAY) });
    const r = run([late]);
    const phantomAt = Object.fromEntries(r.sensitivity.map((s) => [s.windowDays, s.phantom]));
    expect(phantomAt).toEqual({ 1: 0, 3: 0, 7: 0, 14: 1, 30: 1 });
  });

  it('without a reopen timestamp the count still decides (any reopen at any time)', () => {
    const c = conv({ id: 'cnt', reopenCount: 2, reopenedAt: null });
    expect(verdict([c], 'cnt')?.reasons).toEqual(['reopened']);
    expect(verdict([c], 'cnt')?.evidence.join(' ')).toMatch(/Reopened 2 times/);
  });

  it('a "Reopened at" column is read as the timestamp, not as the count', async () => {
    const text = [
      'id,created_at,customer_email,billed,reopened_at,reopen_count',
      'a,2026-09-01T00:00:00Z,x@y.example,yes,2026-09-03T00:00:00Z,1',
      'b,2026-09-01T00:00:00Z,z@y.example,yes,2026-09-20T00:00:00Z,1',
      'c,2026-09-01T00:00:00Z,w@y.example,yes,,0',
      'd,2026-10-30T00:00:00Z,v@y.example,yes,,0',
    ].join('\n');
    const { conversations } = await parseFile(text, { preset: 'generic' });
    expect(conversations[0].reopenedAt?.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(conversations[0].reopenCount).toBe(1);
    expect(conversations[2].reopenedAt).toBeNull();
    const r = audit(conversations, { ...OPTS, exportEnd: new Date('2026-10-31T00:00:00Z') }, 'generic');
    expect(r.results.find((x) => x.id === 'a')?.reasons).toEqual(['reopened']);
    expect(r.results.find((x) => x.id === 'b')?.reasons).toEqual([]);
  });

  it('Standard section 4 documents both cases', () => {
    const standard = readFileSync(join(__dirname, '..', '..', '..', 'content', 'standard.md'), 'utf8');
    expect(standard).toMatch(/reopen timestamp/i);
    expect(standard).toMatch(/any time/i);
  });
});

// ---------------------------------------------------------------------------
// LOW: JSON wrapper with several arrays
// ---------------------------------------------------------------------------

describe('JSON wrapper objects', () => {
  const T0 = Date.UTC(2026, 8, 1) / 1000;
  const conversations = Array.from({ length: 6 }, (_, i) => ({
    id: `w${i}`,
    created_at: T0 + i * 3600,
    ai_agent_participated: true,
    contacts: { contacts: [{ id: `c${i}` }] },
    ai_agent: { resolution_state: 'assumed_resolution', created_at: T0 + i * 3600 },
    statistics: { count_reopens: 0 },
  }));

  it('picks the array that looks like conversations, not the first array of objects', async () => {
    const text = JSON.stringify({
      links: [{ rel: 'next', href: 'https://example.invalid/next' }, { rel: 'self', href: 'https://example.invalid/self' }],
      conversations,
    });
    const res = await parseFile(text, { preset: 'intercom' });
    expect(res.conversations.map((c) => c.id)).toEqual(conversations.map((c) => c.id));
    const peek = await peekFile(text);
    expect(peek.rows.map((r) => r.id)).toEqual(conversations.map((c) => c.id));
  });

  it('picks by content even when the conversations array has an unusual name', async () => {
    const text = JSON.stringify({
      pages: [{ page: 1, per_page: 20, total_pages: 1 }],
      errors: [],
      payload: conversations,
      tags: [{ name: 'a' }, { name: 'b' }, { name: 'c' }],
    }, null, 2);
    const res = await parseFile(text, { preset: 'intercom' });
    expect(res.conversations).toHaveLength(6);
    expect(res.conversations[0].id).toBe('w0');
  });

  it('still reads a plain array, JSONL and a single wrapper key', async () => {
    const a = await parseFile(JSON.stringify(conversations), { preset: 'intercom' });
    const b = await parseFile(conversations.map((c) => JSON.stringify(c)).join('\n'), { preset: 'intercom' });
    const c = await parseFile(JSON.stringify({ data: conversations }), { preset: 'intercom' });
    expect([a, b, c].map((x) => x.conversations.length)).toEqual([6, 6, 6]);
  });

  it('a wrapper whose conversations come first still works, with a trailing array after them', async () => {
    const text = JSON.stringify({ conversations, links: [{ rel: 'next', href: 'x' }] });
    const res = await parseFile(text, { preset: 'intercom' });
    expect(res.conversations).toHaveLength(6);
  });

  it('a dispute CSV from such a file has no rows for the link objects', async () => {
    const text = JSON.stringify({ links: [{ rel: 'next', href: 'x' }], conversations });
    const res = await parseFile(text, { preset: 'intercom' });
    const r = audit(res.conversations, { ...OPTS, exportEnd: new Date('2026-12-31T00:00:00Z') }, 'intercom');
    expect(toDisputeCsv(r, res.conversations).split('\r\n').filter(Boolean)).toHaveLength(1 + r.phantom);
  });
});
