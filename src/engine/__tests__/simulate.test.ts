// Tests for the billing simulation (src/engine/simulate.ts). Expected counts are worked out by hand
// from the fixture below and written as literals, as CONTRIBUTING asks for classification rules.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  audit,
  billSplitSentence,
  parseFile,
  sampleDataset,
  simulateBilling,
  type AuditOptions,
  type Conversation,
} from '@/engine';
import { CHECKED_AT, LIST_PRICES } from '../simulate';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const E = new Date('2026-10-31T00:00:00Z');
const at = (d: number) => new Date(E.getTime() - d * DAY);
const conv = (id: string, p: Partial<Conversation> = {}): Conversation => ({
  id,
  customerKey: `k-${id}`,
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
});
const OPTS: AuditOptions = {
  windowDays: 7,
  pricePerResolution: 1,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
  exportEnd: E,
};
const sim = (convs: Conversation[], o: Partial<AuditOptions> = {}) => {
  const report = audit(convs, { ...OPTS, ...o }, 'generic');
  return { report, s: simulateBilling(convs, report) };
};
const count = (s: ReturnType<typeof simulateBilling>, id: string) => s.rows.find((r) => r.id === id)!;

// Hand-built set. Judged = A..H (8). I is pending (2 days old), J has no customer key (unverifiable).
//  A  clean, billed, silent                      -> every rule counts it
//  B  vendor state confirmed, billed             -> every rule counts it
//  C  human replied, billed                      -> HubSpot and Fin count it (a teammate joining does not remove a Fin resolution)
//  D  vendor escalated, billed                   -> no rule counts it
//  E  customer returns 48h later, billed         -> not Zendesk (72h) and not strict; Fin counts it (a new conversation is not a reopen)
//  F  customer returns 12h later, billed         -> not Zendesk, not strict; Fin/Gorgias/Front count it
//  G  reopened once, billed                      -> not Fin, not Zendesk, not strict; Gorgias counts it
//  H  clean, NOT billed                          -> counts everywhere a rule ignores billing
//  U  state unknown, not billed                  -> no rule counts it, the Standard rows included: the AI never claimed it (judged = 9 with U)
const fixture = (): Conversation[] => [
  conv('A'),
  conv('B', { vendorState: 'confirmed' }),
  conv('C', { humanReplied: true }),
  conv('D', { vendorState: 'escalated' }),
  conv('E'),
  conv('E2', { customerKey: 'k-E', aiInvolved: false, billed: false, createdAt: new Date(at(20).getTime() + 48 * HOUR) }),
  conv('F'),
  conv('F2', { customerKey: 'k-F', aiInvolved: false, billed: false, createdAt: new Date(at(20).getTime() + 12 * HOUR) }),
  conv('G', { reopenCount: 1 }),
  conv('H', { billed: false }),
  conv('I', { createdAt: at(2) }),
  conv('J', { customerKey: null }),
  conv('U', { vendorState: 'unknown', billed: false }), // no resolution claimed: every vendor row excludes it
];

describe('simulateBilling on a hand-built set', () => {
  const { report, s } = sim(fixture());

  it('uses the audit population', () => {
    expect(report.judged).toBe(9);
    expect(report.billedJudged).toBe(7);
    expect(s.judged).toBe(9);
  });

  it('counts each rule by hand', () => {
    expect(count(s, 'actual').billable).toBe(7);
    expect(count(s, 'fin').billable).toBe(6); // A B C E F H
    expect(count(s, 'gorgias').billable).toBe(6); // A B E F G H
    expect(count(s, 'front').billable).toBe(6);
    expect(count(s, 'hubspot').billable).toBe(7); // all but D
    expect(count(s, 'zendesk').billable).toBe(3); // A B H
    expect(count(s, 'strict').billable).toBe(3); // A B H (U is a silent pass the AI never claimed)
    expect(count(s, 'confirmed_only').billable).toBe(1); // B
  });

  it('each rule includes something another excludes', () => {
    // C (human reply): Fin and HubSpot, not Gorgias. G (reopen): Gorgias, not Fin. E: Fin, not Zendesk.
    const only = (id: string) => fixture().filter((c) => c.id === id);
    expect(count(sim(only('C')).s, 'fin').billable).toBe(1);
    expect(count(sim(only('C')).s, 'gorgias').billable).toBe(0);
    expect(count(sim(only('G')).s, 'fin').billable).toBe(0);
    expect(count(sim(only('G')).s, 'gorgias').billable).toBe(1);
    expect(count(s, 'hubspot').billable).toBeGreaterThan(count(s, 'gorgias').billable);
    expect(count(s, 'fin').billable).toBeGreaterThan(count(s, 'zendesk').billable);
  });

  it('prices and dollars come from the list prices', () => {
    expect(count(s, 'actual').dollars).toBe(7);
    expect(count(s, 'fin').dollars).toBeCloseTo(6 * 0.99, 10);
    expect(count(s, 'gorgias').dollars).toBe(6);
    expect(count(s, 'front').dollars).toBeCloseTo(6 * 0.89, 10);
    expect(count(s, 'hubspot').dollars).toBe(3.5);
    expect(count(s, 'strict').dollars).toBe(3);
  });

  it('marks kinds and gives Zendesk no price', () => {
    expect(count(s, 'fin').kind).toBe('modelled');
    expect(count(s, 'zendesk').kind).toBe('upper_bound');
    expect(count(s, 'zendesk').listPrice).toBeNull();
    expect(count(s, 'zendesk').dollars).toBeNull();
    expect(count(s, 'actual').kind).toBe('actual');
    expect(count(s, 'strict').kind).toBe('standard');
    for (const r of s.rows) expect(r.caveat.length).toBeGreaterThan(20);
  });

  it('shares divide by judged', () => {
    expect(count(s, 'fin').share).toBeCloseTo(6 / 9, 10);
    expect(count(s, 'actual').share).toBeCloseTo(7 / 9, 10);
  });

  it('splits the bill and the parts sum to billedJudged', () => {
    const b = s.billSplit;
    expect(b.billed).toBe(7);
    expect(b.phantom).toBe(5); // C D E F G
    expect(b.silenceOnly).toBe(1); // A
    expect(b.positive).toBe(1); // B
    expect(b.phantom + b.silenceOnly + b.positive).toBe(report.billedJudged);
    expect(b.silenceOnlyShare).toBeCloseTo(1 / 7, 10);
    expect(billSplitSentence(b)).toContain('14% of what you were billed rests on silence alone');
  });
});

describe('boundaries', () => {
  const pair = (gapMs: number) => [
    conv('P'),
    conv('P2', { customerKey: 'k-P', aiInvolved: false, billed: false, createdAt: new Date(at(20).getTime() + gapMs) }),
  ];

  it('Fin uses no time cutoff: a new conversation is not a return, a reopen at any time is', () => {
    expect(count(sim(pair(HOUR)).s, 'fin').billable).toBe(1);
    expect(count(sim([conv('R1', { reopenCount: 1 })]).s, 'fin').billable).toBe(0);
    expect(count(sim([conv('R2', { reopenCount: 0, reopenedAt: new Date(at(20).getTime() + 20 * DAY) })], { windowDays: 30 }).s, 'fin').billable).toBe(0);
  });
  it('Zendesk bound: exactly 72h counts as repeat, 72h and one minute does not', () => {
    expect(count(sim(pair(72 * HOUR)).s, 'zendesk').billable).toBe(0);
    expect(count(sim(pair(72 * HOUR + 60_000)).s, 'zendesk').billable).toBe(1);
  });
  it('a same-moment conversation is not "later"', () => {
    expect(count(sim(pair(0)).s, 'fin').billable).toBe(1);
  });
  it('a reopen timestamp beyond 3 days does not exclude the Zendesk bound', () => {
    const c = conv('R', { reopenedAt: new Date(at(20).getTime() + 5 * DAY), reopenCount: 1 });
    expect(count(sim([c], { windowDays: 14 }).s, 'zendesk').billable).toBe(1);
  });
});

describe('edge cases', () => {
  it('empty input', () => {
    const { s } = sim([]);
    expect(s.judged).toBe(0);
    for (const r of s.rows) {
      expect(r.billable).toBe(0);
      expect(r.share).toBe(0);
    }
    expect(s.billSplit.billed).toBe(0);
    expect(billSplitSentence(s.billSplit)).toBeNull();
    expect(s.monthlyFactor).toBeNull();
  });

  it('no audit price gives null dollars on the price-less rows only', () => {
    const { s } = sim(fixture(), { pricePerResolution: 0 });
    expect(count(s, 'actual').dollars).toBeNull();
    expect(count(s, 'strict').dollars).toBeNull();
    expect(count(s, 'confirmed_only').dollars).toBeNull();
    expect(count(s, 'fin').dollars).not.toBeNull();
  });

  it('without any resolution-state data, billed or non-escalated AI conversations stand in', () => {
    const noState = [
      conv('N1', { vendorState: 'unknown', billed: false }),
      conv('N2', { vendorState: 'unknown', billed: true }),
      conv('N3', { vendorState: 'unknown', billed: false, humanReplied: true }),
    ];
    const { s } = sim(noState);
    expect(count(s, 'fin').billable).toBe(3); // N1 N2 N3: a human reply does not remove a Fin resolution
    expect(count(s, 'hubspot').billable).toBe(3); // human replies do not exclude HubSpot
    expect(s.notes.join(' ')).toContain('no resolution-state column');
    expect(sim(fixture()).s.notes).toEqual([]);
  });

  it('with state data, an unknown-state unbilled conversation is excluded but a billed one is kept', () => {
    const { s } = sim([conv('S1'), conv('S2', { vendorState: 'unknown', billed: false }), conv('S3', { vendorState: 'unknown', billed: true })]);
    expect(count(s, 'fin').billable).toBe(2); // S1 S3
  });

  it('duplicate ids use the first row, like the audit', () => {
    const dup = [conv('A'), conv('A', { humanReplied: true })];
    const { s } = sim(dup);
    expect(count(s, 'gorgias').billable).toBe(1);
  });
});

describe('built-in sample data', () => {
  it('keeps the rules in a sane order', async () => {
    const { conversations } = await parseFile(sampleDataset('intercom'), { preset: 'intercom' });
    const report = audit(conversations, { ...OPTS, exportEnd: undefined, pricePerResolution: 0.99 }, 'intercom');
    const s = simulateBilling(conversations, report);
    const n = (id: string) => count(s, id).billable;
    expect(s.judged).toBe(report.judged);
    expect(n('actual')).toBe(report.billedJudged);
    // The Standard rows cover only conversations the AI marked resolved, like the vendor rules.
    expect(n('strict')).toBeLessThanOrEqual(report.strictPass + report.confirmedPass);
    expect(n('confirmed_only')).toBeLessThanOrEqual(report.confirmedPass);
    expect(n('confirmed_only')).toBeLessThanOrEqual(n('strict'));
    expect(n('strict')).toBeLessThanOrEqual(n('fin'));
    expect(n('strict')).toBeLessThanOrEqual(n('actual'));
    expect(n('hubspot')).toBeGreaterThanOrEqual(n('gorgias'));
    expect(n('gorgias')).toBe(n('front'));
    const claimed = conversations.filter((c) => c.billed || ['assumed', 'confirmed', 'verified', 'contained', 'billed_unknown'].includes(c.vendorState));
    const claimedIds = new Set(claimed.map((c) => c.id));
    const claimedJudged = report.results.filter((r) => r.verdict !== 'pending_window' && r.verdict !== 'unverifiable' && claimedIds.has(r.id)).length;
    for (const id of ['fin', 'gorgias', 'front', 'hubspot', 'zendesk']) expect(n(id)).toBeLessThanOrEqual(claimedJudged);
    const b = s.billSplit;
    expect(b.phantom + b.silenceOnly + b.positive).toBe(report.billedJudged);
    expect(b.phantom).toBe(report.phantom);
    expect(s.monthlyFactor).not.toBeNull();
    expect(s.monthlyFactor as number).toBeGreaterThan(0);
  });
});

describe('prices stay in step with content/vendors.json', () => {
  const vendors = JSON.parse(readFileSync(join(process.cwd(), 'content/vendors.json'), 'utf8')) as {
    slug: string;
    price: string | null;
    checkedAt: string;
  }[];
  const get = (slug: string) => vendors.find((v) => v.slug === slug)!;

  it('LIST_PRICES match the vendor price text', () => {
    expect(get('intercom').price).toContain(`$${LIST_PRICES.fin.toFixed(2)}`);
    expect(get('gorgias').price).toContain(`$${LIST_PRICES.gorgias.toFixed(2)} on monthly`);
    expect(get('front').price).toContain(`Resolution $${LIST_PRICES.front.toFixed(2)}`);
    expect(get('hubspot').price).toContain(`$${LIST_PRICES.hubspot.toFixed(2)}`);
    expect(get('zendesk').price).toBeNull();
  });

  it('CHECKED_AT matches the vendor facts the caveats cite', () => {
    for (const slug of ['intercom', 'gorgias', 'front', 'hubspot', 'zendesk']) {
      expect(get(slug).checkedAt).toBe(CHECKED_AT);
    }
  });
});

describe('dispute summary', () => {
  it('adds one neutral paragraph only when a simulation is passed', async () => {
    const { disputeSummaryText } = await import('@/engine');
    const { report, s } = sim(fixture());
    const without = disputeSummaryText(report, undefined, 'Acme');
    const withSim = disputeSummaryText(report, undefined, 'Acme', s);
    expect(without).not.toContain('different bills');
    expect(withSim).toContain('Same conversations, different bills');
    expect(withSim).toContain('Intercom Fin rule would count 6, $5.94');
    expect(withSim).toContain('Zendesk Verified: up to 3');
    expect(withSim).not.toMatch(/fraud|scam|overcharg/i);
  });
});
