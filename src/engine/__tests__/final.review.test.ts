// Final independent review of the implemented engine (docs/REVIEW-FINAL.md).
// Targets what engine.test.ts and review.adversarial.test.ts leave out: end-to-end runs with an
// independent reference implementation written from docs/SPEC.md, report invariants, the
// same-topic chain, ties, time zones across week and window boundaries, Intercom files whose
// first records are not AI-handled, Intercom display-name states, and customer-key hashing.
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import {
  audit,
  disputeSummaryText,
  parseFile,
  sampleDataset,
  SENSITIVITY_WINDOWS,
  toDisputeCsv,
  type AuditOptions,
  type AuditReport,
  type Conversation,
  type Preset,
  type Reason,
  type Verdict,
} from '@/engine';
import { makeKeyHasher } from '../hash';

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
  pricePerResolution: 0.99,
  sameTopicOnly: false,
  negativeCsatThreshold: 0.4,
};
const run = (convs: Conversation[], o: Partial<AuditOptions> = {}, preset: Preset = 'generic') =>
  audit(convs, { ...OPTS, exportEnd: E, ...o }, preset);
const verdictOf = (r: AuditReport, id: string): Verdict | undefined => r.results.find((x) => x.id === id)?.verdict;

// ---------------------------------------------------------------------------
// Report invariants: every report a customer sees must satisfy these.
// ---------------------------------------------------------------------------

function checkInvariants(r: AuditReport, convs: Conversation[], opts: AuditOptions, preset: Preset) {
  const unit = (x: number) => {
    expect(Number.isFinite(x)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
  };
  // Populations add up.
  expect(r.pending + r.unverifiable + r.judged).toBe(r.aiConversations);
  expect(r.strictPass + r.confirmedPass + r.phantom + r.failUnbilled).toBe(r.judged);
  expect(r.verifiable).toBe(r.judged);
  expect(r.phantom).toBeLessThanOrEqual(r.billedJudged);
  expect(r.billedJudged).toBeLessThanOrEqual(r.billed);
  expect(r.billed).toBeLessThanOrEqual(r.aiConversations);
  // Rates share one population.
  for (const x of [r.billedRate, r.strictRate, r.phantomShareOfBilled]) unit(x);
  expect(r.billedRate).toBeCloseTo(r.judged ? r.billedJudged / r.judged : 0, 12);
  expect(r.strictRate).toBeCloseTo(r.judged ? (r.strictPass + r.confirmedPass) / r.judged : 0, 12);
  expect(r.phantomShareOfBilled).toBeCloseTo(r.billedJudged ? r.phantom / r.billedJudged : 0, 12);
  expect(r.dollarsAtRisk).toBeCloseTo(r.phantom * Math.max(0, opts.pricePerResolution), 9);
  // One result per AI conversation, and the verdict counts match the totals.
  expect(r.results.length).toBe(r.aiConversations);
  const count = (v: Verdict) => r.results.filter((x) => x.verdict === v).length;
  expect(count('strict_pass')).toBe(r.strictPass);
  expect(count('confirmed_pass')).toBe(r.confirmedPass);
  expect(count('phantom')).toBe(r.phantom);
  expect(count('fail_unbilled')).toBe(r.failUnbilled);
  expect(count('pending_window')).toBe(r.pending);
  expect(count('unverifiable')).toBe(r.unverifiable);
  expect(new Set(r.results.map((x) => x.id)).size).toBe(r.results.length);
  // Reasons and evidence.
  for (const x of r.results) {
    expect(x.evidence.length).toBe(x.reasons.length);
    if (x.verdict === 'phantom' || x.verdict === 'fail_unbilled') expect(x.reasons.length).toBeGreaterThan(0);
    else expect(x.reasons.length).toBe(0);
  }
  // byReason: phantom conversations only.
  const reasons: Reason[] = ['human_handoff', 'reopened', 'repeat_contact', 'negative_csat', 'vendor_escalated'];
  let sum = 0;
  for (const k of reasons) {
    const n = r.results.filter((x) => x.verdict === 'phantom' && x.reasons.includes(k)).length;
    expect(r.byReason[k]).toBe(n);
    expect(r.byReason[k]).toBeLessThanOrEqual(r.phantom);
    sum += r.byReason[k];
  }
  expect(sum).toBeGreaterThanOrEqual(r.phantom);
  // Weekly buckets: Monday-start UTC weeks, ascending, summing to the totals.
  const wk = r.weekly;
  for (let i = 1; i < wk.length; i++) expect(wk[i - 1].weekStart < wk[i].weekStart).toBe(true);
  for (const w of wk) expect(new Date(`${w.weekStart}T00:00:00Z`).getUTCDay()).toBe(1);
  expect(wk.reduce((a, w) => a + w.billed, 0)).toBe(r.billed);
  expect(wk.reduce((a, w) => a + w.phantom, 0)).toBe(r.phantom);
  expect(wk.reduce((a, w) => a + w.strictPass, 0)).toBe(r.strictPass + r.confirmedPass);
  // Sensitivity rows equal a full audit at that window.
  expect(r.sensitivity.map((s) => s.windowDays)).toEqual([...SENSITIVITY_WINDOWS]);
  for (const s of r.sensitivity) {
    const again = audit(convs, { ...opts, windowDays: s.windowDays }, preset);
    expect(s.phantom).toBe(again.phantom);
    expect(s.strictRate).toBeCloseTo(again.strictRate, 12);
  }
  // Dispute CSV: one line per phantom plus the header.
  const csvLines = toDisputeCsv(r, convs).trim().split('\r\n');
  expect(csvLines.length).toBe(r.phantom + 1);
}

// ---------------------------------------------------------------------------
// Reference implementation, written from docs/SPEC.md only (deliberately naive, O(n^2)).
// ---------------------------------------------------------------------------

interface RefConv {
  id: string;
  t: number;
  ai: boolean;
  billed: boolean;
  state: string;
  key: string | null;
  human: boolean | null;
  reopens: number | null;
  csat: number | null;
  topic: string | null;
}

function referenceVerdicts(rows: RefConv[], w: number): Map<string, { verdict: Verdict; reasons: Set<Reason> }> {
  const end = Math.max(...rows.map((r) => r.t));
  const wMs = w * DAY;
  const out = new Map<string, { verdict: Verdict; reasons: Set<Reason> }>();
  for (const c of rows) {
    if (!c.ai) continue;
    if (c.t > end - wMs) {
      out.set(c.id, { verdict: 'pending_window', reasons: new Set() });
      continue;
    }
    const reasons = new Set<Reason>();
    if (['escalated', 'handoff', 'negative_feedback'].includes(c.state)) reasons.add('vendor_escalated');
    if (c.human === true) reasons.add('human_handoff');
    if (c.reopens !== null && c.reopens > 0) reasons.add('reopened');
    if (c.csat !== null && c.csat < 0.4) reasons.add('negative_csat');
    if (c.key !== null && rows.some((o) => o.key === c.key && o.t > c.t && o.t <= c.t + wMs)) reasons.add('repeat_contact');
    let verdict: Verdict;
    if (reasons.size > 0) verdict = c.billed ? 'phantom' : 'fail_unbilled';
    else if (c.key === null) verdict = 'unverifiable';
    else if (c.state === 'confirmed' || (c.csat !== null && c.csat >= 0.75)) verdict = 'confirmed_pass';
    else verdict = 'strict_pass';
    out.set(c.id, { verdict, reasons });
  }
  return out;
}

function refFromIntercomJsonl(text: string): RefConv[] {
  const STATE: Record<string, [string, boolean]> = {
    assumed_resolution: ['assumed', true],
    confirmed_resolution: ['confirmed', true],
    escalated: ['escalated', false],
    routed_to_team: ['escalated', false],
    negative_feedback: ['negative_feedback', false],
    abandoned: ['negative_feedback', false],
    procedure_handoff: ['handoff', false],
  };
  return text
    .trim()
    .split('\n')
    .map((line) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = JSON.parse(line) as any;
      const ai = o.ai_agent_participated === true;
      const [state, billedState] = STATE[o.ai_agent?.resolution_state ?? ''] ?? ['unknown', false];
      const reply = o.statistics?.last_admin_reply_at ?? null;
      const start = o.ai_agent?.created_at ?? null;
      const rating = o.conversation_rating?.rating ?? o.ai_agent?.rating ?? null;
      return {
        id: String(o.id),
        t: o.created_at * 1000,
        ai,
        billed: ai && billedState,
        state: ai ? state : 'not_ai',
        key: o.contacts?.contacts?.[0]?.id ?? null,
        human: reply === null ? false : start === null ? null : reply > start,
        reopens: o.statistics?.count_reopens ?? null,
        csat: rating === null ? null : Math.min(1, Math.max(0, (rating - 1) / 4)),
        topic: o.source?.subject ?? null,
      };
    });
}

function refFromGenericCsv(text: string): RefConv[] {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true });
  const rows = parsed.data;
  // The engine guesses the scale from the highest score; the sample is 1-5.
  return rows.map((r) => {
    const ai = r.ai_involved === 'yes';
    const billed = ai && r.billed === 'yes';
    return {
      id: r.conversation_id,
      t: Date.parse(r.created_at),
      ai,
      billed,
      state: !ai ? 'not_ai' : billed ? 'assumed' : 'unknown',
      key: r.customer ? r.customer.toLowerCase() : null,
      human: r.human_reply === 'yes',
      reopens: r.reopens === '' ? null : Number(r.reopens),
      csat: r.csat === '' ? null : (Number(r.csat) - 1) / 4,
      topic: r.subject || null,
    };
  });
}

function compareToReference(report: AuditReport, ref: Map<string, { verdict: Verdict; reasons: Set<Reason> }>) {
  expect(report.results.length).toBe(ref.size);
  const mismatches: string[] = [];
  for (const r of report.results) {
    const want = ref.get(r.id);
    if (!want) {
      mismatches.push(`${r.id}: not in reference`);
      continue;
    }
    const got = new Set(r.reasons);
    const same = want.verdict === r.verdict && got.size === want.reasons.size && [...got].every((x) => want.reasons.has(x));
    if (!same) mismatches.push(`${r.id}: engine ${r.verdict} [${[...got]}] vs reference ${want.verdict} [${[...want.reasons]}]`);
  }
  expect(mismatches.slice(0, 10)).toEqual([]);
}

// ---------------------------------------------------------------------------
// End to end: sample -> parseFile -> audit
// ---------------------------------------------------------------------------

describe('end to end: sampleDataset -> parseFile -> audit', () => {
  it('Intercom sample: preset is detected, every verdict and reason matches an independent reference, invariants hold', async () => {
    const text = sampleDataset('intercom');
    const parsed = await parseFile(text); // no preset given: detection must pick Intercom
    const opts: AuditOptions = { ...OPTS };
    const report = audit(parsed.conversations, opts, 'intercom');
    expect(report.preset).toBe('intercom');

    const refRows = refFromIntercomJsonl(text);
    expect(parsed.conversations.length).toBe(refRows.length);
    expect(report.aiConversations).toBe(refRows.filter((r) => r.ai).length);
    expect(report.billed).toBe(refRows.filter((r) => r.billed).length);
    compareToReference(report, referenceVerdicts(refRows, 7));
    checkInvariants(report, parsed.conversations, opts, 'intercom');

    // The sample is built to show phantoms of every main kind, and no note about unordered replies.
    expect(report.phantom).toBeGreaterThan(0);
    expect(report.byReason.repeat_contact).toBeGreaterThan(0);
    expect(report.byReason.human_handoff).toBeGreaterThan(0);
    expect(parsed.warnings.join(' ')).not.toMatch(/cannot be shown to come after/);
    // Customer ids never appear in clear text.
    expect(parsed.conversations.some((c) => c.customerKey?.includes('contact_'))).toBe(false);
  });

  it('Intercom sample at every sensitivity window matches the reference', async () => {
    const text = sampleDataset('intercom', 7);
    const parsed = await parseFile(text, { preset: 'intercom' });
    const refRows = refFromIntercomJsonl(text);
    for (const w of SENSITIVITY_WINDOWS) {
      const report = audit(parsed.conversations, { ...OPTS, windowDays: w }, 'intercom');
      compareToReference(report, referenceVerdicts(refRows, w));
    }
  });

  it('generic sample: every verdict matches the reference, invariants hold', async () => {
    const text = sampleDataset('generic', 3);
    const parsed = await parseFile(text, { preset: 'generic' });
    const opts: AuditOptions = { ...OPTS, pricePerResolution: 1.25 };
    const report = audit(parsed.conversations, opts, 'generic');
    compareToReference(report, referenceVerdicts(refFromGenericCsv(text), 7));
    checkInvariants(report, parsed.conversations, opts, 'generic');
  });

  it('every preset sample satisfies the report invariants, with and without the same-topic filter', async () => {
    for (const preset of ['intercom', 'zendesk', 'ada', 'gorgias', 'generic'] as Preset[]) {
      const parsed = await parseFile(sampleDataset(preset, 11), { preset });
      for (const sameTopicOnly of [false, true]) {
        const opts: AuditOptions = { ...OPTS, sameTopicOnly };
        const report = audit(parsed.conversations, opts, preset);
        expect(report.aiConversations).toBeGreaterThan(0);
        checkInvariants(report, parsed.conversations, opts, preset);
      }
    }
  });

  it('the same-topic filter can only remove repeat contacts, never add them', async () => {
    const parsed = await parseFile(sampleDataset('intercom', 5), { preset: 'intercom' });
    const off = audit(parsed.conversations, OPTS, 'intercom');
    const on = audit(parsed.conversations, { ...OPTS, sameTopicOnly: true }, 'intercom');
    expect(on.byReason.repeat_contact).toBeLessThanOrEqual(off.byReason.repeat_contact);
    expect(on.phantom).toBeLessThanOrEqual(off.phantom);
    const offRepeat = new Set(off.results.filter((r) => r.reasons.includes('repeat_contact')).map((r) => r.id));
    for (const r of on.results) if (r.reasons.includes('repeat_contact')) expect(offRepeat.has(r.id)).toBe(true);
  });

  it('the summary text quotes the same numbers as the report', async () => {
    const parsed = await parseFile(sampleDataset('intercom'), { preset: 'intercom' });
    const report = audit(parsed.conversations, OPTS, 'intercom');
    const text = disputeSummaryText(report, OPTS, 'Intercom');
    expect(text).toContain(`Billed as resolved: ${report.billedJudged} of ${report.judged} judged`);
    expect(text).toContain(`Strictly resolved: ${report.strictPass + report.confirmedPass} of ${report.judged} judged`);
    expect(text).toContain(`${report.phantom} x $0.99 = $${report.dollarsAtRisk.toFixed(2)}`);
    expect(text).toContain(`${report.phantom} of ${report.billedJudged} billed resolutions`);
  });
});

// ---------------------------------------------------------------------------
// Repeat-contact chains, ties and the same-topic filter
// ---------------------------------------------------------------------------

describe('repeat contact: ties, chains and the same-topic filter', () => {
  it('two conversations at the same instant do not repeat each other, but both repeat with a later one', () => {
    const a = conv({ id: 'tA', customerKey: 'T', createdAt: at(20) });
    const b = conv({ id: 'tB', customerKey: 'T', createdAt: at(20) });
    const c = conv({ id: 'tC', customerKey: 'T', createdAt: at(19) });
    const solo = run([a, b]);
    expect(verdictOf(solo, 'tA')).toBe('strict_pass');
    expect(verdictOf(solo, 'tB')).toBe('strict_pass');
    const r = run([b, c, a]);
    expect(verdictOf(r, 'tA')).toBe('phantom');
    expect(verdictOf(r, 'tB')).toBe('phantom');
    expect(verdictOf(r, 'tC')).toBe('strict_pass');
    expect(r.results.find((x) => x.id === 'tA')?.evidence[0]).toContain('tC 1.0 days later');
  });

  it('same-topic filter: a different-topic next contact does not hide a same-topic one later in the window', () => {
    const a = conv({ id: 'sA', customerKey: 'S', createdAt: at(20), topicText: 'refund for damaged blender not received' });
    const b = conv({ id: 'sB', customerKey: 'S', createdAt: at(19), topicText: 'change my delivery address please' });
    const c = conv({ id: 'sC', customerKey: 'S', createdAt: at(16), topicText: 'refund for damaged blender still missing' });
    const filler = Array.from({ length: 6 }, (_, i) =>
      conv({ customerKey: `f${i}`, createdAt: at(30), topicText: `unrelated question number ${i} about invoices` }),
    );
    const r = run([a, b, c, ...filler], { sameTopicOnly: true });
    const ra = r.results.find((x) => x.id === 'sA');
    expect(ra?.verdict).toBe('phantom');
    expect(ra?.evidence[0]).toContain('sC 4.0 days later');
    expect(verdictOf(r, 'sB')).toBe('strict_pass'); // sC is a different topic from sB
  });

  it('same-topic filter: a repeat contact without topic text on either side does not count', () => {
    const a = conv({ id: 'nA', customerKey: 'N', createdAt: at(20), topicText: 'order never arrived' });
    const b = conv({ id: 'nB', customerKey: 'N', createdAt: at(18), topicText: null });
    const r = run([a, b], { sameTopicOnly: true });
    expect(verdictOf(r, 'nA')).toBe('strict_pass');
    expect(verdictOf(run([a, b]), 'nA')).toBe('phantom');
  });

  it('a chain of contacts each exactly W days apart fails every link but the last (inclusive boundary)', () => {
    const ids = ['w0', 'w1', 'w2', 'w3'];
    const convs = ids.map((id, i) => conv({ id, customerKey: 'W', createdAt: at(29 - 7 * i) }));
    const r = run(convs);
    expect(ids.map((id) => verdictOf(r, id))).toEqual(['phantom', 'phantom', 'phantom', 'strict_pass']);
  });

  it('exportEnd defaults to the newest conversation of any kind, including non-AI ones', () => {
    const ai = conv({ id: 'eA', customerKey: 'X', createdAt: at(10) });
    const human = conv({ id: 'eH', customerKey: 'Y', createdAt: at(0), aiInvolved: false, billed: false });
    const r = audit([ai, human], OPTS, 'generic');
    expect(r.period.end.getTime()).toBe(E.getTime());
    expect(verdictOf(r, 'eA')).toBe('strict_pass'); // 10 days old against a 7-day window: judged
    const alone = audit([ai], OPTS, 'generic');
    expect(verdictOf(alone, 'eA')).toBe('pending_window'); // its own date is the export end
  });
});

// ---------------------------------------------------------------------------
// Time zones through the parser
// ---------------------------------------------------------------------------

describe('time zones end to end', () => {
  const header = 'id,created_at,customer,ai,billed,human_reply,reopens,csat\n';
  const row = (id: string, created: string, cust: string) => `${id},${created},${cust},yes,yes,no,0,\n`;

  it('an offset timestamp that falls on Sunday in UTC is bucketed in the previous Monday week', async () => {
    const text = header + row('z1', '2026-10-05T00:30:00+02:00', 'a@x.com') + row('z2', '2026-11-30T00:00:00Z', 'b@x.com');
    const { conversations } = await parseFile(text, { preset: 'generic' });
    const r = audit(conversations, OPTS, 'generic');
    expect(conversations.find((c) => c.id === 'z1')?.createdAt.toISOString()).toBe('2026-10-04T22:30:00.000Z');
    expect(r.weekly[0].weekStart).toBe('2026-09-28');
  });

  it('a repeat contact exactly W days later counts when the two timestamps use different offsets', async () => {
    const text =
      header +
      row('o1', '2026-10-01T10:00:00+05:00', 'same@x.com') + // 05:00Z
      row('o2', '2026-10-08T07:00:00+02:00', 'SAME@x.com') + // 05:00Z, exactly 7 days later; email case differs
      row('o3', '2026-10-01T10:00:00+05:00', 'other@x.com') +
      row('o4', '2026-10-08T05:00:00.001Z', 'other@x.com') + // 1 ms past the window
      row('end', '2026-11-30T00:00:00Z', 'z@x.com');
    const { conversations } = await parseFile(text, { preset: 'generic' });
    const r = audit(conversations, OPTS, 'generic');
    expect(verdictOf(r, 'o1')).toBe('phantom');
    expect(verdictOf(r, 'o3')).toBe('strict_pass');
  });
});

// ---------------------------------------------------------------------------
// Intercom: files whose first records are not AI-handled
// ---------------------------------------------------------------------------

describe('Intercom JSONL whose first records have no ai_agent object', () => {
  const T0 = Date.UTC(2026, 8, 1) / 1000;
  const lines: string[] = [];
  // 250 human-only conversations first (for example an export that starts before Fin was on).
  for (let i = 0; i < 250; i++) {
    lines.push(
      JSON.stringify({
        id: `h${i}`,
        created_at: T0 + i * 60,
        ai_agent_participated: false,
        contacts: { contacts: [{ id: `hc${i}` }] },
        statistics: { count_reopens: 0, last_admin_reply_at: T0 + i * 60 + 30 },
        conversation_rating: null,
      }),
    );
  }
  // Then 20 Fin conversations, 30 days later, all billed as assumed resolutions.
  for (let i = 0; i < 20; i++) {
    const t = T0 + 30 * 86400 + i * 3600;
    lines.push(
      JSON.stringify({
        id: `ai${i}`,
        created_at: t,
        ai_agent_participated: true,
        ai_agent: { resolution_state: 'assumed_resolution', created_at: t + 5, rating: null },
        contacts: { contacts: [{ id: `ac${i}` }] },
        statistics: { count_reopens: 0, last_admin_reply_at: i < 5 ? t + 600 : null },
        conversation_rating: i === 7 ? { rating: 1 } : null,
      }),
    );
  }
  // A late, unrelated conversation sets the export end so the Fin ones can be judged.
  lines.push(JSON.stringify({ id: 'late', created_at: T0 + 60 * 86400, ai_agent_participated: false, statistics: {} }));
  const text = lines.join('\n') + '\n';

  it('still reads the resolution state, the AI start time and the rating of later records', async () => {
    const parsed = await parseFile(text, { preset: 'intercom' });
    const ai = parsed.conversations.filter((c) => c.aiInvolved);
    expect(ai.length).toBe(20);
    expect(ai.every((c) => c.billed && c.vendorState === 'assumed')).toBe(true);
    expect(ai.filter((c) => c.humanReplied === true).map((c) => c.id)).toEqual(['ai0', 'ai1', 'ai2', 'ai3', 'ai4']);
    expect(ai.find((c) => c.id === 'ai7')?.csat).toBe(0);
    expect(parsed.warnings.join(' ')).not.toMatch(/cannot be shown to come after/);

    const r = audit(parsed.conversations, OPTS, 'intercom');
    expect(r.billed).toBe(20);
    expect(r.phantom).toBe(6); // five human replies after the AI, one rating of 1
    expect(r.dollarsAtRisk).toBeCloseTo(6 * 0.99, 9);
  });
});

describe('Intercom resolution states written as display names (CSV dataset exports)', () => {
  it('reads "Assumed resolution", "Routed to team" and the like like their API names', async () => {
    const text =
      'Conversation ID,Created at,Contact ID,AI agent participated,AI agent resolution state\n' +
      'd1,2026-09-01T10:00:00Z,c1,true,Assumed resolution\n' +
      'd2,2026-09-01T11:00:00Z,c2,true,Confirmed resolution\n' +
      'd3,2026-09-01T12:00:00Z,c3,true,Routed to team\n' +
      'd4,2026-09-01T13:00:00Z,c4,true,Procedure handoff\n' +
      'd5,2026-09-01T14:00:00Z,c5,true,negative-feedback\n' +
      'end,2026-10-30T00:00:00Z,c9,false,\n';
    const { conversations } = await parseFile(text, { preset: 'intercom' });
    const by = (id: string) => conversations.find((c) => c.id === id);
    expect([by('d1')?.vendorState, by('d1')?.billed]).toEqual(['assumed', true]);
    expect([by('d2')?.vendorState, by('d2')?.billed]).toEqual(['confirmed', true]);
    expect([by('d3')?.vendorState, by('d3')?.billed]).toEqual(['escalated', false]);
    expect([by('d4')?.vendorState, by('d4')?.billed]).toEqual(['handoff', false]);
    expect([by('d5')?.vendorState, by('d5')?.billed]).toEqual(['negative_feedback', false]);
    const r = audit(conversations, OPTS, 'intercom');
    expect(r.billed).toBe(2);
    expect(r.confirmedPass).toBe(1);
    expect(r.failUnbilled).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Privacy: customer keys
// ---------------------------------------------------------------------------

describe('customer keys', () => {
  it('are salted digests of 16 hex characters, stable within a session, case- and space-insensitive', () => {
    const h = makeKeyHasher();
    const a = h('  Jane@Example.com ');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(h('jane@example.com')).toBe(a);
    expect(makeKeyHasher()('jane@example.com')).toBe(a); // same session salt across parses
    expect(h(12345)).toBe(h('12345'));
    expect(h('')).toBeNull();
    expect(h('N/A')).toBeNull();
  });

  it('two different object-valued ids never collapse into one customer', () => {
    const h = makeKeyHasher();
    const a = h({ id: 'a' });
    const b = h({ id: 'b' });
    expect(a === null || a !== b).toBe(true);
  });

  it('no raw id or email survives parsing, for CSV and JSON inputs', async () => {
    const csv = 'id,created_at,customer_email,billed\nq1,2026-09-01T00:00:00Z,secret.person@corp.example,yes\n';
    const json = JSON.stringify([{ id: 'q2', created_at: '2026-09-01T00:00:00Z', customer_id: 'CUST-SECRET-77', billed: true }]);
    for (const text of [csv, json]) {
      const { conversations } = await parseFile(text, { preset: 'generic' });
      const dump = JSON.stringify(conversations);
      expect(dump).not.toMatch(/secret|CUST-SECRET/i);
      expect(conversations[0].customerKey).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

describe('Intercom JSON without an ai_agent_participated field', () => {
  const T0 = Date.UTC(2026, 8, 1) / 1000;
  const rec = (i: number, aiAgent: unknown) =>
    JSON.stringify({ id: `p${i}`, created_at: T0 + i * 3600, contacts: { contacts: [{ id: `pc${i}` }] }, statistics: { count_reopens: 0 }, ...(aiAgent ? { ai_agent: aiAgent } : {}) });

  it('when the state is in the sampled records, only conversations with a state are AI-handled', async () => {
    const text = [rec(1, { resolution_state: 'assumed_resolution', created_at: T0 }), rec(2, null), rec(3, null)].join('\n');
    const { conversations } = await parseFile(text, { preset: 'intercom' });
    expect(conversations.map((c) => c.aiInvolved)).toEqual([true, false, false]);
  });

  it('when no sampled record has a state, every conversation is treated as AI-handled, later states still bill, and a note says so', async () => {
    const lines = Array.from({ length: 210 }, (_, i) => rec(i, null));
    lines.push(rec(300, { resolution_state: 'confirmed_resolution', created_at: T0 + 300 * 3600 }));
    const { conversations, warnings } = await parseFile(lines.join('\n'), { preset: 'intercom' });
    expect(conversations.every((c) => c.aiInvolved)).toBe(true);
    expect(conversations.filter((c) => c.billed).map((c) => c.id)).toEqual(['p300']);
    expect(warnings.join(' ')).toMatch(/treated as AI-handled/);
  });

  it('the "reply cannot be shown to come after the AI" note counts AI conversations only', async () => {
    const text = [
      JSON.stringify({ id: 'u1', created_at: T0, ai_agent_participated: false, statistics: { last_admin_reply_at: T0 + 9 } }),
      JSON.stringify({ id: 'u2', created_at: T0, ai_agent_participated: true, ai_agent: { resolution_state: 'assumed_resolution' }, statistics: { last_admin_reply_at: T0 + 9 } }),
    ].join('\n');
    const { conversations, warnings } = await parseFile(text, { preset: 'intercom' });
    expect(conversations.find((c) => c.id === 'u2')?.humanReplied).toBeNull();
    expect(warnings.some((w) => w.startsWith('1 conversations have an admin reply'))).toBe(true);
  });
});
