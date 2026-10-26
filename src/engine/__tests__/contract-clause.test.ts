import { describe, expect, it } from 'vitest';
import { buildClauses, normalizeOptions, toMarkdown, toPlainText } from '../contract-clause';

const text = (o = {}) => toPlainText(buildClauses(o));
const clause = (o: object, n: number) => buildClauses(o).clauses.find((c) => c.number === n)!;

describe('contract clause defaults', () => {
  it('lists exactly the five fail signals with the Standard wording', () => {
    const def = clause({}, 1).lines.filter((l) => l.sub).slice(0, 5).map((l) => l.text);
    expect(def).toHaveLength(5);
    expect(def[0]).toMatch(/^Vendor escalation: .*escalated, handoff or negative feedback\./);
    expect(def[1]).toMatch(/^Human reply: .*after the AI agent took part, including a courtesy reply\./);
    expect(def[2]).toMatch(/^Reopened: the conversation was reopened within the Judgement Window\./);
    // Same rule as the engine: a timestamped reopen outside the window does not count; a bare count does.
    expect(def[2]).toContain('Where the export gives no time for a reopen, a reopen count above zero counts');
    expect(def[3]).toMatch(/^Repeat contact: .*same end user opened another conversation/);
    expect(def[4]).toMatch(/^Negative rating: .*below 0\.4 on a scale of 0 to 1 \(a rating of 1 or 2 on a scale of 1 to 5\)/);
  });

  it('uses the Standard defaults: 7 days, 0.4, 30 dispute days, receipt on, silence reported', () => {
    const o = normalizeOptions({});
    expect(o).toMatchObject({ windowDays: 7, csatThreshold: 0.4, disputeDays: 30, receiptCounts: true, silence: 'reported' });
    const t = text();
    expect(t).toContain('period of 7 days');
    expect(t).toContain('Within 30 days of receiving an export');
    expect(t).toContain('credited in full on the next invoice');
  });

  it('is numbered 1 to 6 and ends with the attribution line', () => {
    const doc = buildClauses();
    expect(doc.clauses.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(toPlainText(doc)).toContain('Definitions adapted from The Strict Resolution Standard (CC BY 4.0), resolvara.com/standard.');
  });

  it('keeps the human-reply fail signal fixed, with no courtesy exemption', () => {
    expect(text({ silence: 'never', receiptCounts: false })).toContain('including a courtesy reply');
  });
});

describe('options change the text', () => {
  it('silence toggle changes clause 2', () => {
    const a = clause({ silence: 'reported' }, 2).lines.map((l) => l.text).join(' ');
    const b = clause({ silence: 'never' }, 2).lines.map((l) => l.text).join(' ');
    expect(a).toContain('even if the end user gave no confirmation');
    expect(a).toContain('report separately');
    expect(b).toContain('only if it also has Positive Evidence');
    expect(b).toContain('is never billable');
    expect(b).not.toContain('even if the end user gave no confirmation');
  });

  it('numbers appear correctly', () => {
    const t = text({ windowDays: 14, csatThreshold: 0.5, disputeDays: 45 });
    expect(t).toContain('period of 14 days');
    // (r - 1) / 4 < 0.5 holds for 1 and 2; a 3 normalises to exactly 0.5 and passes.
    expect(t).toContain('below 0.5 on a scale of 0 to 1 (a rating of 1 or 2 on a scale of 1 to 5)');
    expect(text({ csatThreshold: 0.6 })).toContain('(a rating of 1, 2 or 3 on a scale of 1 to 5)');
    expect(text({ csatThreshold: 0.1 })).toContain('(a rating of 1 on a scale of 1 to 5)');
    expect(t).toContain('Within 45 days of receiving an export');
    expect(t).toContain('Judgement Window of 14 days and a rating threshold of 0.5');
  });

  it('uses singular for one day', () => {
    expect(text({ windowDays: 1 })).toContain('period of 1 day after');
  });

  it('receipt toggle adds or removes its sentence and definition', () => {
    const on = text({ receiptCounts: true });
    const off = text({ receiptCounts: false });
    expect(on).toContain('"System Receipt" means a record created by an action the AI agent took');
    expect(on).toContain('refund identifier or an order update');
    expect(on).toContain('the reference of any System Receipt.');
    expect(off).not.toContain('System Receipt');
    expect(off).toContain('the satisfaction score, with the scale it was given on.');
  });

  it('puts party names in the preamble only when given', () => {
    expect(text()).toContain('between the Customer and the Vendor.');
    const t = text({ vendorName: 'Acme AI', customerName: 'Northwind' });
    expect(t).toContain('Northwind (the "Customer") and Acme AI (the "Vendor")');
  });

  it('credit option changes clause 4', () => {
    expect(text({ credit: 'refund' })).toContain('shall be refunded in full.');
  });

  it('states the standard version passed in', () => {
    expect(toPlainText(buildClauses({}, '0.2'))).toContain('Strict Resolution Standard version 0.2');
  });
});

describe('robustness and style', () => {
  it('clamps bad numbers to defaults and ranges', () => {
    const o = normalizeOptions({ windowDays: NaN, csatThreshold: 9, disputeDays: -4 });
    expect(o.windowDays).toBe(7);
    expect(o.csatThreshold).toBe(1);
    expect(o.disputeDays).toBe(1);
  });

  it('contains no em-dash or en-dash in any configuration', () => {
    for (const silence of ['reported', 'never'] as const)
      for (const receiptCounts of [true, false])
        for (const credit of ['next_invoice', 'refund', 'next_invoice_or_refund'] as const) {
          const doc = buildClauses({ silence, receiptCounts, credit, vendorName: 'A', customerName: 'B' });
          for (const out of [toPlainText(doc), toMarkdown(doc)]) {
            expect(out).not.toMatch(/[–—]/);
          }
        }
  });

  it('avoids accusatory words', () => {
    expect(text().toLowerCase()).not.toMatch(/fraud|scam|overcharg/);
  });

  it('markdown has headings and plain text does not', () => {
    const doc = buildClauses();
    expect(toMarkdown(doc)).toContain('## 1. Definitions');
    expect(toPlainText(doc)).not.toContain('##');
  });
});
