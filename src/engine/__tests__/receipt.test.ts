// Standard 0.2: an action receipt is positive evidence only. Every expected value below was worked
// out by hand from content/standard.md (sections 2, 3 and 5), not copied from the engine's output.
import { describe, expect, it } from 'vitest';
import { audit, disputeSummaryText, parseFile, sampleDataset, toReceipt, type AuditOptions, type Conversation } from '@/engine';

const DAY = 86_400_000;
const E = new Date('2026-10-31T00:00:00Z');
const at = (d: number) => new Date(E.getTime() - d * DAY);
let seq = 0;
const conv = (p: Partial<Conversation> = {}): Conversation => {
  seq += 1;
  return {
    id: `r${seq}`,
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
const run = (convs: Conversation[]) => audit(convs, OPTS, 'generic');
const verdictOf = (convs: Conversation[], id: string) => run(convs).results.find((r) => r.id === id)?.verdict;

describe('toReceipt (the parsing of the receipt cell)', () => {
  it('a non-empty value that is not a falsy token is a receipt', () => {
    for (const v of ['re_3Nx9', 'REFUND-1001', 'order updated', '1', 'yes', 'true', ' 42 ', 7, true]) {
      expect(toReceipt(v)).toBe(true);
    }
  });
  it('empty and falsy tokens are not, in any case and after trimming', () => {
    for (const v of ['', '   ', '0', 'false', 'FALSE', ' False ', 'no', 'No', 'none', 'NONE', 'null', 'Null', 'n/a', 'N/A', ' n/a ']) {
      expect(toReceipt(v)).toBe(false);
    }
    for (const v of [null, undefined, 0, false, NaN]) expect(toReceipt(v)).toBe(false);
  });
  it('JSON values: an empty array or object is not a receipt', () => {
    expect(toReceipt([])).toBe(false);
    expect(toReceipt({})).toBe(false);
    expect(toReceipt(['re_1'])).toBe(true);
    expect(toReceipt({ id: 're_1' })).toBe(true);
  });
});

describe('verdicts with an action receipt (Standard 0.2, section 3)', () => {
  it('receipt alone, with a customer key and no fail signal, is a confirmed pass', () => {
    const r = run([conv({ id: 'a', actionReceipt: true })]);
    expect(r.results[0].verdict).toBe('confirmed_pass');
    expect(r.confirmedPass).toBe(1);
    expect(r.strictPass).toBe(0);
    expect(r.confirmedBy).toEqual({ vendorConfirmed: 0, positiveRating: 0, actionReceipt: 1 });
  });

  it('receipt false, null or absent leaves a strict pass', () => {
    const r = run([conv({ id: 'f', actionReceipt: false }), conv({ id: 'n', actionReceipt: null }), conv({ id: 'u' })]);
    expect(r.results.map((x) => x.verdict)).toEqual(['strict_pass', 'strict_pass', 'strict_pass']);
    expect(r.confirmedBy).toEqual({ vendorConfirmed: 0, positiveRating: 0, actionReceipt: 0 });
  });

  it('receipt plus a fail signal: phantom when billed, fail_unbilled when not (fail signals win)', () => {
    const r = run([
      conv({ id: 'billed', billed: true, actionReceipt: true, reopenCount: 1 }),
      conv({ id: 'unbilled', billed: false, actionReceipt: true, humanReplied: true }),
      conv({ id: 'esc', billed: true, actionReceipt: true, vendorState: 'escalated' }),
      conv({ id: 'csat', billed: true, actionReceipt: true, csat: 0.25 }),
    ]);
    expect(r.results.map((x) => [x.id, x.verdict])).toEqual([
      ['billed', 'phantom'],
      ['unbilled', 'fail_unbilled'],
      ['esc', 'phantom'],
      ['csat', 'phantom'],
    ]);
    // The receipt is not a reason, and a failed conversation adds nothing to the positive counts.
    expect(r.results[0].reasons).toEqual(['reopened']);
    expect(r.confirmedPass).toBe(0);
    expect(r.confirmedBy.actionReceipt).toBe(0);
  });

  it('receipt plus a repeat contact: phantom when billed, fail_unbilled when not', () => {
    // Customer x: b1 at day -20 (billed), b2 at -18 (not billed), b3 at -15 (not billed). All have a receipt.
    // b1 -> b2 is 2 days (inside W = 7): b1 repeat. b2 -> b3 is 3 days: b2 repeat. b3 has no later contact.
    const r = run([
      conv({ id: 'b1', customerKey: 'x', createdAt: at(20), billed: true, actionReceipt: true }),
      conv({ id: 'b2', customerKey: 'x', createdAt: at(18), billed: false, actionReceipt: true }),
      conv({ id: 'b3', customerKey: 'x', createdAt: at(15), billed: false, actionReceipt: true }),
    ]);
    expect(r.results.map((x) => [x.id, x.verdict])).toEqual([
      ['b1', 'phantom'],
      ['b2', 'fail_unbilled'],
      ['b3', 'confirmed_pass'],
    ]);
    expect(r.results[0].reasons).toEqual(['repeat_contact']);
  });

  it('receipt with no customer key and no fail signal stays unverifiable (a receipt does not replace the key)', () => {
    const r = run([conv({ id: 'nk', customerKey: null, actionReceipt: true })]);
    expect(r.results[0].verdict).toBe('unverifiable');
    expect(r.unverifiable).toBe(1);
    expect(r.judged).toBe(0);
    expect(r.confirmedBy.actionReceipt).toBe(0);
  });

  it('receipt with no customer key but another fail signal is judged on the fail signal', () => {
    expect(verdictOf([conv({ id: 'x', customerKey: null, actionReceipt: true, reopenCount: 2 })], 'x')).toBe('phantom');
  });

  it('receipt inside the pending window is pending_window', () => {
    // createdAt = E - 3 days is later than E - 7 days. A second, older conversation sets the export end.
    const pending = conv({ id: 'p', createdAt: at(3), actionReceipt: true });
    const old = conv({ id: 'old', createdAt: at(30) });
    const r = run([pending, old]);
    expect(r.results.find((x) => x.id === 'p')?.verdict).toBe('pending_window');
    expect(r.confirmedBy.actionReceipt).toBe(0);
  });

  it('a receipt on a conversation the vendor already confirmed is still one confirmed pass', () => {
    const r = run([conv({ id: 'v', vendorState: 'confirmed', actionReceipt: true })]);
    expect(r.results[0].verdict).toBe('confirmed_pass');
    expect(r.confirmedPass).toBe(1);
  });
});

describe('confirmedBy breakdown (each source counted, sources can overlap)', () => {
  // Hand-worked mixed set, all with a key, old enough, and no fail signal unless noted:
  //  1 vendor confirmed only                       -> vendorConfirmed
  //  2 rating 0.75 only (boundary, inclusive)      -> positiveRating
  //  3 receipt only                                -> actionReceipt
  //  4 vendor confirmed + rating 1 + receipt       -> all three
  //  5 receipt + rating 0.5 (below 0.75)           -> actionReceipt only
  //  6 nothing                                     -> strict pass
  //  7 receipt, no customer key                    -> unverifiable, counts nothing
  //  8 receipt but reopened                        -> phantom, counts nothing
  // Hand count: confirmedPass = 5 (1,2,3,4,5). vendorConfirmed = 2 (1,4). positiveRating = 2 (2,4).
  // actionReceipt = 3 (3,4,5).
  const convs = () => [
    conv({ id: '1', vendorState: 'confirmed' }),
    conv({ id: '2', csat: 0.75 }),
    conv({ id: '3', actionReceipt: true }),
    conv({ id: '4', vendorState: 'confirmed', csat: 1, actionReceipt: true }),
    conv({ id: '5', csat: 0.5, actionReceipt: true }),
    conv({ id: '6' }),
    conv({ id: '7', customerKey: null, actionReceipt: true }),
    conv({ id: '8', reopenCount: 1, actionReceipt: true }),
  ];
  it('counts a conversation once as confirmed and once per source', () => {
    const r = run(convs());
    expect(r.confirmedPass).toBe(5);
    expect(r.strictPass).toBe(1);
    expect(r.unverifiable).toBe(1);
    expect(r.phantom).toBe(1);
    expect(r.confirmedBy).toEqual({ vendorConfirmed: 2, positiveRating: 2, actionReceipt: 3 });
    // 2 + 2 + 3 = 7 source counts for 5 confirmed passes: conversation 4 carries all three sources.
    expect(r.confirmedBy.vendorConfirmed + r.confirmedBy.positiveRating + r.confirmedBy.actionReceipt).toBeGreaterThan(
      r.confirmedPass,
    );
    // judged = 8 - 1 unverifiable = 7; strict rate = (1 + 5) / 7. The kind of evidence does not change it.
    expect(r.judged).toBe(7);
    expect(r.strictRate).toBeCloseTo(6 / 7, 12);
  });
  it('shows up in the summary text', () => {
    const t = disputeSummaryText(run(convs()), OPTS, 'Acme');
    expect(t).toContain('2 vendor confirmed, 2 explicit positive rating, 3 action receipt');
  });
});

describe('a 0.1-shaped export (no receipt column) is unchanged', () => {
  // Baseline: counts and rates measured with the 0.1 engine (git HEAD before this change) on the
  // same seeded sample exports.
  const BASE: Record<string, { c: number[]; sr: number; br: number; ps: number }> = {
    // [ai, judged, strict, confirmed, phantom, failUnbilled, pending, unverifiable, billedJudged]
    intercom: { c: [774, 704, 342, 117, 99, 146, 70, 0, 451], sr: 0.6519886363636364, br: 0.640625, ps: 0.21951219512195122 },
    zendesk: { c: [774, 704, 420, 60, 84, 140, 70, 0, 451], sr: 0.6818181818181818, br: 0.640625, ps: 0.18625277161862527 },
    ada: { c: [774, 704, 447, 60, 70, 127, 70, 0, 451], sr: 0.7201704545454546, br: 0.640625, ps: 0.15521064301552107 },
    gorgias: { c: [622, 569, 433, 59, 77, 0, 53, 0, 569], sr: 0.8646748681898067, br: 1, ps: 0.13532513181019332 },
    generic: { c: [774, 704, 417, 58, 99, 130, 70, 0, 451], sr: 0.6747159090909091, br: 0.640625, ps: 0.21951219512195122 },
  };
  for (const p of ['intercom', 'zendesk', 'ada', 'gorgias', 'generic'] as const) {
    it(`${p} sample: same verdict counts and rates as under 0.1`, async () => {
      const { conversations } = await parseFile(sampleDataset(p), { preset: p });
      expect(conversations.every((c) => c.actionReceipt === null)).toBe(true);
      const r = audit(conversations, { windowDays: 7, pricePerResolution: 1, sameTopicOnly: false, negativeCsatThreshold: 0.4 }, p);
      const b = BASE[p];
      expect([
        r.aiConversations,
        r.judged,
        r.strictPass,
        r.confirmedPass,
        r.phantom,
        r.failUnbilled,
        r.pending,
        r.unverifiable,
        r.billedJudged,
      ]).toEqual(b.c);
      expect(r.strictRate).toBeCloseTo(b.sr, 12);
      expect(r.billedRate).toBeCloseTo(b.br, 12);
      expect(r.phantomShareOfBilled).toBeCloseTo(b.ps, 12);
      expect(r.confirmedBy.actionReceipt).toBe(0);
    });
  }
});

describe('parsing a mapped receipt column', () => {
  const csv =
    'id,created,customer,billed,receipt\n' +
    [
      '1,2026-09-01T10:00:00Z,a@x.com,yes,re_100',
      '2,2026-09-01T10:00:00Z,b@x.com,yes,',
      '3,2026-09-01T10:00:00Z,c@x.com,yes,N/A',
      '4,2026-09-01T10:00:00Z,d@x.com,yes,0',
      '5,2026-09-01T10:00:00Z,e@x.com,yes, BK-77 ',
    ].join('\n') +
    '\n';
  const mapping = { id: 'id', createdAt: 'created', customerKey: 'customer', billed: 'billed', billedValue: 'yes', actionReceipt: 'receipt' };
  it('turns the cells into booleans', async () => {
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping });
    expect(conversations.map((c) => c.actionReceipt)).toEqual([true, false, false, false, true]);
  });
  it('is null for every row when no receipt column is mapped', async () => {
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping: { ...mapping, actionReceipt: null } });
    expect(conversations.every((c) => c.actionReceipt === null)).toBe(true);
  });
  it('auto-detects only the exact header, never a column that merely contains the word', async () => {
    const auto =
      'id,created,customer,billed,action_receipt_error\n' +
      '1,2026-09-01T10:00:00Z,a@x.com,yes,timeout\n';
    const { id, createdAt, customerKey, billed, billedValue } = mapping;
    const { conversations } = await parseFile(auto, { preset: 'generic', mapping: { id, createdAt, customerKey, billed, billedValue } });
    expect(conversations[0].actionReceipt).toBeNull();
    const exact = auto.replace('action_receipt_error', 'Action Receipt');
    const { conversations: c2 } = await parseFile(exact, { preset: 'generic', mapping: { id, createdAt, customerKey, billed, billedValue } });
    expect(c2[0].actionReceipt).toBe(true);
  });
  it('works as an override on a vendor preset', async () => {
    const { conversations } = await parseFile(csv, { preset: 'gorgias', mapping });
    expect(conversations.map((c) => c.actionReceipt)).toEqual([true, false, false, false, true]);
  });
  it('end to end: the two rows with a receipt are confirmed, the rest strict', async () => {
    const { conversations } = await parseFile(csv, { preset: 'generic', mapping });
    const r = audit(conversations, OPTS, 'generic');
    expect(r.confirmedPass).toBe(2);
    expect(r.strictPass).toBe(3);
    expect(r.confirmedBy.actionReceipt).toBe(2);
  });
});

it('the report states Standard 0.2', () => {
  expect(run([]).standardVersion).toBe('0.2');
});
