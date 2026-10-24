// parseFile / peekFile: text -> canonical conversations.
import { makeKeyHasher } from './hash';
import {
  GENERIC,
  MAPPING_KEYS,
  PRESET_CANDIDATES,
  adaState,
  detectPresetFromHeaders,
  guessCsatScale,
  intercomState,
  normalizeCsat,
  norm,
  parseScale,
  str,
  toBool,
  toCount,
  toHuman,
  toRawCsat,
  zendeskTier,
  type Candidates,
  type CsatScale,
  type FieldKey,
} from './presets';
import { MAX_TEXT_CHARS, scanCsv, scanJson, sniffFormat, stripBom } from './scan';
import { parseTimestamp } from './time';
import type { ColumnMapping, Conversation, Preset, VendorState } from './types';

type Rec = string[] | Record<string, unknown>;
type Getter = (rec: Rec) => unknown;
type Cols = Partial<Record<FieldKey, Getter>>;
type Obj = Record<string, unknown>;

const TOPIC_MAX = 200;
const SAMPLE_RECORDS = 200;

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Reads `a.b.0.c` from a record. A literal key containing dots wins over traversal. */
function makePathGetter(path: string): Getter {
  const segs = path.split('.');
  return (rec) => {
    const o = rec as Obj;
    if (path in o) return o[path];
    let cur: unknown = o;
    for (const s of segs) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = (cur as Obj)[s];
    }
    return cur;
  };
}

/** Dotted keys of an object, nested objects flattened (arrays are kept as values). */
export function flattenKeys(o: Obj, prefix = '', depth = 0, out: string[] = []): string[] {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) flattenKeys(v as Obj, key, depth + 1, out);
    else out.push(key);
  }
  return out;
}

function flattenRow(o: Obj): Obj {
  const out: Obj = { ...o };
  const walk = (x: Obj, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(x)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && depth < 3) walk(v as Obj, key, depth + 1);
      else if (prefix) out[key] = v;
    }
  };
  walk(o, '', 0);
  return out;
}

// ---------------------------------------------------------------------------
// Column resolution
// ---------------------------------------------------------------------------

interface Source {
  csv: boolean;
  headers: string[];
  sample: Obj[]; // JSON records used to test dotted paths
}

function csvGetter(headers: string[], name: string): Getter | null {
  const i = headers.indexOf(name);
  return i < 0 ? null : (rec) => (rec as string[])[i];
}

/** Finds the header (CSV) or path (JSON) a candidate refers to, or null. */
function resolveCandidate(src: Source, cand: string, fuzzy: boolean, taken: Set<string>): { name: string; get: Getter } | null {
  if (src.csv) {
    const nc = norm(cand);
    const exact = src.headers.find((h) => !taken.has(h) && (h === cand || norm(h) === nc));
    if (exact) return { name: exact, get: csvGetter(src.headers, exact) as Getter };
    if (fuzzy && nc.length >= 4) {
      const hit = src.headers.find((h) => !taken.has(h) && norm(h).includes(nc));
      if (hit) return { name: hit, get: csvGetter(src.headers, hit) as Getter };
    }
    return null;
  }
  // JSON: a dotted path that resolves in the sample, else a flattened header by name.
  if (cand.includes('.') || /^\d+$/.test(cand)) {
    const g = makePathGetter(cand);
    if (src.sample.some((r) => g(r) !== undefined)) return { name: cand, get: g };
  }
  const nc = norm(cand);
  const exact = src.headers.find((h) => !taken.has(h) && (h === cand || norm(h) === nc));
  if (exact) return { name: exact, get: makePathGetter(exact) };
  if (fuzzy && nc.length >= 4) {
    const hit = src.headers.find((h) => !taken.has(h) && norm(h).includes(nc));
    if (hit) return { name: hit, get: makePathGetter(hit) };
  }
  return null;
}

interface Plan {
  cols: Cols;
  warnings: string[];
  billedValues: Set<string> | null;
  aiValues: Set<string> | null;
  billedMapped: boolean;
  aiMapped: boolean;
  scaleChoice: CsatScale | null; // chosen in the mapper
  unseen: Set<FieldKey>; // JSON paths read blind: not present in the sampled records
}

const valueSet = (raw: string | null | undefined): Set<string> | null => {
  const items = (raw ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return items.length ? new Set(items) : null;
};

function buildPlan(preset: Preset, mapping: ColumnMapping | undefined, src: Source): Plan {
  const warnings: string[] = [];
  const cols: Cols = {};
  const taken = new Set<string>();
  const own = PRESET_CANDIDATES[preset];
  const fuzzyOwn = preset === 'generic';

  // 1. Explicit mapping from the column mapper wins.
  const explicit = new Set<FieldKey>();
  if (mapping) {
    for (const [mk, field] of Object.entries(MAPPING_KEYS)) {
      if (!(mk in mapping)) continue;
      explicit.add(field); // null = "not in this file": do not auto-map it
      const name = mapping[mk];
      if (!name) continue;
      const r = resolveCandidate(src, name, false, new Set());
      if (r) {
        cols[field] = r.get;
        taken.add(r.name);
      } else {
        warnings.push(`The column "${name}" (${mk}) was not found in the file, so that field is treated as missing.`);
      }
    }
  }

  // 2. Preset candidates (exact names first, then fuzzy for generic), then generic synonyms for
  //    the fields a Gorgias export does not name.
  const unseen = new Set<FieldKey>();
  const resolveField = (field: FieldKey, list: Candidates, fuzzy: boolean) => {
    if (cols[field] || explicit.has(field)) return;
    const cands = list[field] ?? [];
    if (!src.csv && resolveJsonField(src, field, cands, taken, cols, unseen)) return;
    for (const pass of fuzzy ? [false, true] : [false]) {
      for (const cand of cands) {
        const r = resolveCandidate(src, cand, pass, taken);
        if (r) {
          cols[field] = r.get;
          taken.add(r.name);
          return;
        }
      }
    }
  };
  for (const f of Object.keys(own) as FieldKey[]) resolveField(f, own, fuzzyOwn);
  if (preset === 'gorgias') {
    for (const f of ['billed', 'ai', 'human', 'reopens'] as FieldKey[]) resolveField(f, GENERIC, true);
  }

  const billedMapped = Boolean(mapping?.billed) && explicit.has('billed') && Boolean(cols.billed);
  const aiMapped = Boolean(mapping?.aiInvolved) && explicit.has('ai') && Boolean(cols.ai);
  return {
    cols,
    warnings,
    billedValues: valueSet(mapping?.billedValue),
    aiValues: valueSet(mapping?.aiInvolvedValue),
    billedMapped,
    aiMapped,
    scaleChoice: parseScale(mapping?.csatScale),
    unseen,
  };
}

const isPath = (cand: string) => cand.includes('.') || /^\d+$/.test(cand);
const usable = (v: unknown) => v !== undefined && v !== null && typeof v !== 'object';

/**
 * JSON only. The sample is just the first records of the file, so a field can be missing from
 * all of them (an export that starts with conversations Fin never touched has no `ai_agent`
 * object in its first rows). Order: a dotted path seen in the sample, or a key that holds a
 * plain value in the sample; else the preset's own dotted path, read blind (a missing path
 * reads as missing); else the caller's usual matching.
 */
function resolveJsonField(
  src: Source,
  field: FieldKey,
  cands: string[],
  taken: Set<string>,
  cols: Cols,
  unseen: Set<FieldKey>,
): boolean {
  for (const cand of cands) {
    const r = resolveCandidate(src, cand, false, taken);
    if (r && (isPath(cand) || src.sample.some((rec) => usable(r.get(rec))))) {
      cols[field] = r.get;
      taken.add(r.name);
      return true;
    }
  }
  const blind = cands.find((c) => isPath(c) && !taken.has(c));
  if (blind) {
    cols[field] = makePathGetter(blind);
    taken.add(blind);
    unseen.add(field);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Row -> draft
// ---------------------------------------------------------------------------

interface Draft {
  ai: boolean;
  billed: boolean;
  state: VendorState;
  human: boolean | null;
  reopens: number | null;
  csat: number | null;
  csatNeedsScale: boolean; // `csat` is still the raw value
  humanUnordered?: boolean; // a reply exists but cannot be placed after the AI
  closed: unknown;
  topic: string | null;
  channel: string | null;
  skip?: 'test';
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function topicOf(v: unknown): string | null {
  const s = stripTags(str(v));
  return s ? cap(s, TOPIC_MAX) : null;
}

function csatDraft(raw: unknown, fixed: CsatScale | null): { csat: number | null; needsScale: boolean } {
  const r = toRawCsat(raw);
  if (!r) return { csat: null, needsScale: false };
  if (r.word) return { csat: r.value, needsScale: false };
  if (fixed) return { csat: normalizeCsat(r.value, fixed), needsScale: false };
  return { csat: r.value, needsScale: true };
}

function matches(raw: unknown, set: Set<string> | null): boolean {
  if (set) return set.has(str(raw).toLowerCase());
  return toBool(raw) === true;
}

function genericDraft(g: (f: FieldKey) => unknown, plan: Plan, heuristicAgentMsgs: boolean): Draft {
  const agentMsgs = heuristicAgentMsgs ? toCount(g('agentMsgs')) : null;
  let ai: boolean;
  if (plan.cols.ai) ai = matches(g('ai'), plan.aiValues);
  else if (heuristicAgentMsgs && agentMsgs !== null) ai = agentMsgs === 0;
  else ai = true;
  let billed: boolean;
  if (plan.cols.billed) billed = matches(g('billed'), plan.billedValues);
  else if (heuristicAgentMsgs && agentMsgs !== null) billed = agentMsgs === 0;
  else billed = false;
  billed = billed && ai;
  const human = plan.cols.human ? toHuman(g('human')) : agentMsgs !== null ? agentMsgs > 0 : null;
  const c = csatDraft(g('csat'), null);
  return {
    ai,
    billed,
    state: !ai ? 'not_ai' : billed ? 'assumed' : 'unknown',
    human,
    reopens: toCount(g('reopens')),
    csat: c.csat,
    csatNeedsScale: c.needsScale,
    closed: g('closed'),
    topic: topicOf(g('topic')),
    channel: str(g('channel')) || null,
  };
}

function intercomDraft(g: (f: FieldKey) => unknown, plan: Plan): Draft {
  const rawState = g('state');
  const st = intercomState(rawState);
  const participated = plan.cols.ai ? toBool(g('ai')) : null;
  const stateSeen = Boolean(plan.cols.state) && !plan.unseen.has('state');
  let ai = participated !== null ? participated : stateSeen ? str(rawState) !== '' : true;
  let billed = st.billed;
  if (plan.aiMapped) ai = matches(g('ai'), plan.aiValues);
  if (plan.billedMapped) billed = matches(g('billed'), plan.billedValues);
  billed = billed && ai;

  // A human reply only counts when it came after the AI took part (Standard section 4).
  let human: boolean | null = null;
  let unordered = false;
  if (plan.cols.human) {
    human = toHuman(g('human'));
  } else if (plan.cols.adminReplyAt) {
    const replyRaw = g('adminReplyAt');
    const reply = parseTimestamp(replyRaw).date;
    if (reply === null) {
      human = replyRaw === null || replyRaw === undefined || str(replyRaw) === '' ? false : null;
    } else {
      const started = plan.cols.aiStartedAt ? parseTimestamp(g('aiStartedAt')).date : null;
      if (started) human = reply.getTime() > started.getTime();
      else unordered = true;
    }
  }
  const primary = toRawCsat(g('csat'));
  const c = csatDraft(primary ? g('csat') : g('csat2'), '1-5');
  return {
    ai,
    billed,
    state: ai ? st.state : 'not_ai',
    human,
    humanUnordered: unordered && ai, // only AI conversations use the signal
    reopens: toCount(g('reopens')),
    csat: c.csat,
    csatNeedsScale: false,
    closed: g('closed'),
    topic: topicOf(g('topic')),
    channel: str(g('channel')) || null,
  };
}

function zendeskDraft(g: (f: FieldKey) => unknown, plan: Plan): Draft {
  const z = zendeskTier(str(g('tier')), str(g('type')), str(g('tags')));
  let ai = z.ai;
  let billed = z.billed;
  if (plan.aiMapped) ai = matches(g('ai'), plan.aiValues);
  if (plan.billedMapped) billed = matches(g('billed'), plan.billedValues);
  billed = billed && ai;
  const c = csatDraft(g('csat'), null);
  return {
    ai,
    billed,
    state: ai ? z.state : 'not_ai',
    human: plan.cols.human ? toHuman(g('human')) : null,
    reopens: toCount(g('reopens')),
    csat: c.csat,
    csatNeedsScale: c.needsScale,
    closed: g('closed'),
    topic: topicOf(g('topic')),
    channel: str(g('channel')) || null,
  };
}

function adaDraft(g: (f: FieldKey) => unknown, plan: Plan): Draft {
  const a = adaState(str(g('classification')));
  const escalated = toBool(g('escalated')) === true;
  const handoffs = g('handoffs');
  const hasHandoff = Array.isArray(handoffs) ? handoffs.length > 0 : str(handoffs) !== '' && str(handoffs) !== '[]';
  let state = a.state;
  let billed = a.billed && !escalated;
  if (escalated) state = 'escalated';
  else if (hasHandoff && !a.billed) state = 'handoff';
  if (plan.billedMapped) billed = matches(g('billed'), plan.billedValues);
  const handleMs = Number(str(g('handleTime')));
  let human: boolean | null = null;
  if (plan.cols.human) human = toHuman(g('human'));
  else if (plan.cols.handoffs || plan.cols.agentId || plan.cols.handleTime) {
    human = hasHandoff || str(g('agentId')) !== '' || (Number.isFinite(handleMs) && handleMs > 0);
  }
  const c = csatDraft(g('csat'), null);
  return {
    ai: plan.aiMapped ? matches(g('ai'), plan.aiValues) : true,
    billed,
    state,
    human,
    reopens: toCount(g('reopens')),
    csat: c.csat,
    csatNeedsScale: c.needsScale,
    closed: g('closed'),
    topic: topicOf(g('topic')),
    channel: str(g('channel')) || null,
    skip: toBool(g('isTest')) === true ? 'test' : undefined,
  };
}

// ---------------------------------------------------------------------------
// The collector
// ---------------------------------------------------------------------------

interface Collected {
  conversations: Conversation[];
  warnings: string[];
}

class Collector {
  conversations: Conversation[] = [];
  private ids = new Set<string>();
  private hash = makeKeyHasher();
  private pendingCsat: Conversation[] = [];
  private noId = 0;
  private badDate = 0;
  private dup = 0;
  private naive = 0;
  private tests = 0;
  private badJson = 0;
  private unordered = 0;

  constructor(
    private preset: Preset,
    private plan: Plan,
  ) {}

  add(rec: Rec): void {
    const cols = this.plan.cols;
    const g = (f: FieldKey): unknown => {
      const get = cols[f];
      return get ? get(rec) : undefined;
    };
    const id = str(g('id'));
    if (!id) {
      this.noId += 1;
      return;
    }
    if (this.ids.has(id)) {
      this.dup += 1;
      return;
    }
    const created = parseTimestamp(g('created'));
    if (!created.date) {
      this.badDate += 1;
      return;
    }
    let d: Draft;
    switch (this.preset) {
      case 'intercom':
        d = intercomDraft(g, this.plan);
        break;
      case 'zendesk':
        d = zendeskDraft(g, this.plan);
        break;
      case 'ada':
        d = adaDraft(g, this.plan);
        break;
      case 'gorgias':
        d = genericDraft(g, this.plan, true);
        break;
      default:
        d = genericDraft(g, this.plan, false);
    }
    if (d.skip === 'test') {
      this.tests += 1;
      return;
    }
    this.ids.add(id);
    if (created.naive) this.naive += 1;
    if (d.humanUnordered) this.unordered += 1;
    const closed = d.closed === undefined || d.closed === null || str(d.closed) === '' ? null : parseTimestamp(d.closed).date;
    const conv: Conversation = {
      id,
      customerKey: this.hash(g('customer')),
      createdAt: created.date,
      closedAt: closed,
      aiInvolved: d.ai,
      vendorState: d.state,
      billed: d.billed,
      humanReplied: d.human,
      reopenCount: d.reopens,
      csat: d.csat,
      channel: d.channel,
      topicText: d.topic,
    };
    if (d.csatNeedsScale) this.pendingCsat.push(conv);
    this.conversations.push(conv);
  }

  addBadJson(n: number) {
    this.badJson += n;
  }

  finish(headerWarnings: string[]): Collected {
    const warnings = [...headerWarnings];
    // Settle CSAT values whose scale the export does not state.
    if (this.pendingCsat.length > 0) {
      const raws = this.pendingCsat.map((c) => c.csat as number);
      const scale = this.plan.scaleChoice ?? guessCsatScale(raws);
      if (scale) {
        for (const c of this.pendingCsat) c.csat = normalizeCsat(c.csat as number, scale);
        warnings.push(
          this.plan.scaleChoice
            ? `Satisfaction scores are read on a ${scale} scale, as you chose.`
            : `Satisfaction scale guessed as ${scale} from the highest score in the file. Set it in Map columns if that is wrong.`,
        );
      } else {
        for (const c of this.pendingCsat) c.csat = null;
        warnings.push(
          'Satisfaction scores were found but their scale could not be told from the data. They were ignored. Choose the scale in Map columns to use them.',
        );
      }
    }
    if (this.noId > 0) warnings.push(`${this.noId} rows had no id and were skipped.`);
    if (this.badDate > 0) warnings.push(`${this.badDate} rows had no readable creation date and were skipped.`);
    if (this.dup > 0) warnings.push(`${this.dup} duplicate rows (same id) were ignored.`);
    if (this.naive > 0) {
      warnings.push(`${this.naive} timestamps had no timezone and were read as UTC.`);
    }
    if (this.tests > 0) warnings.push(`${this.tests} test conversations were ignored.`);
    if (this.badJson > 0) warnings.push(`${this.badJson} JSON records could not be read and were skipped.`);
    if (this.unordered > 0) {
      warnings.push(
        `${this.unordered} conversations have an admin reply but no AI start time (ai_agent.created_at), so the reply cannot be shown to come after the AI. Their human-reply signal is off.`,
      );
    }
    return { conversations: this.conversations, warnings };
  }
}

// ---------------------------------------------------------------------------
// Public: peek and parse
// ---------------------------------------------------------------------------

async function readText(file: File | string, maxChars: number | null): Promise<{ text: string; truncated: boolean }> {
  if (typeof file === 'string') {
    if (maxChars !== null && file.length > maxChars) return { text: file.slice(0, maxChars), truncated: true };
    return { text: file, truncated: false };
  }
  if (maxChars !== null) {
    return { text: await file.slice(0, maxChars).text(), truncated: file.size > maxChars };
  }
  if (file.size > MAX_TEXT_CHARS) {
    throw new Error(
      `This file is ${(file.size / 1048576).toFixed(0)} MB. Resolvara reads files up to ${MAX_TEXT_CHARS / 1048576} MB in the browser. Split the export by date and audit the parts, or run a narrower export.`,
    );
  }
  return { text: await file.text(), truncated: false };
}

export interface Peek {
  headers: string[];
  rows: Obj[]; // CSV rows as objects; JSON records with their flattened dotted keys added
  format: 'csv' | 'json';
}

/** Reads the start of a file: headers and a few rows, for preset detection and the mapper. */
export async function peekFile(file: File | string, maxRows = 40, headBytes = 768 * 1024): Promise<Peek> {
  const { text, truncated } = await readText(file, headBytes);
  const format = sniffFormat(text);
  if (format === 'empty') throw new Error('The file is empty.');
  if (format === 'csv') {
    const rows: string[][] = [];
    scanCsv(text, (cells) => {
      rows.push(cells);
      return rows.length <= maxRows + 1;
    });
    if (truncated && rows.length > 1) rows.pop(); // the last line may be cut mid-row
    const header = (rows[0] ?? []).map((h) => stripBom(h).trim());
    const headers = header.filter((h) => h !== '');
    if (headers.length === 0) throw new Error('Could not find a header row in this file.');
    const out = rows.slice(1, maxRows + 1).map((r) => {
      const o: Obj = {};
      header.forEach((h, i) => {
        if (h) o[h] = r[i];
      });
      return o;
    });
    return { headers, rows: out, format };
  }
  const objs: Obj[] = [];
  scanJson(text, (o) => {
    objs.push(o);
    return objs.length < maxRows;
  });
  if (objs.length === 0) throw new Error('Could not read any JSON records from this file.');
  const headers = Array.from(new Set(objs.flatMap((o) => flattenKeys(o))));
  return { headers, rows: objs.map(flattenRow), format };
}

export function detectPreset(headers: string[], sample: Record<string, unknown>[]): { preset: Preset; confidence: number } {
  void sample;
  return detectPresetFromHeaders(headers);
}

export async function parseFile(
  file: File | string,
  opts?: { preset?: Preset; mapping?: ColumnMapping; onProgress?: (p: number) => void },
): Promise<{ conversations: Conversation[]; headers: string[]; warnings: string[] }> {
  const { text } = await readText(file, null);
  const format = sniffFormat(text);
  if (format === 'empty') {
    return { conversations: [], headers: [], warnings: ['The file is empty.'] };
  }
  const progress = opts?.onProgress;
  progress?.(0);

  let preset: Preset | undefined = opts?.preset;
  let headers: string[] = [];
  let collector: Collector | null = null;
  let headerWarnings: string[] = [];

  const start = (src: Source, firstRecords: Rec[]): void => {
    if (!preset) preset = detectPresetFromHeaders(src.headers).preset;
    const plan = buildPlan(preset, opts?.mapping, src);
    headerWarnings = [...plan.warnings];
    if (!plan.cols.id) headerWarnings.push('No id column was found; every row will be skipped.');
    if (!plan.cols.created) headerWarnings.push('No creation-date column was found; every row will be skipped.');
    if (preset === 'intercom' && !plan.cols.ai && (!plan.cols.state || plan.unseen.has('state'))) {
      headerWarnings.push('No AI-participation or resolution-state field was found; every conversation is treated as AI-handled.');
    }
    if (preset === 'ada') {
      headerWarnings.push(
        'Ada: conversations whose classification starts with "resolved" are treated as billed. The exact values are not documented, so check the result.',
      );
    }
    if (preset === 'gorgias' && !plan.cols.billed && !plan.cols.ai) {
      headerWarnings.push(
        'Gorgias exports have no AI column. Tickets with no agent messages are treated as AI-handled and billed. Confirm this in Map columns.',
      );
    }
    collector = new Collector(preset, plan);
    for (const r of firstRecords) collector.add(r);
  };

  if (format === 'csv') {
    let header: string[] | null = null;
    scanCsv(
      text,
      (cells) => {
        if (header === null) {
          header = cells.map((h) => stripBom(h).trim());
          headers = header.filter((h) => h !== '');
          start({ csv: true, headers: header, sample: [] }, []);
          return;
        }
        collector?.add(cells);
      },
      progress ? (p) => progress(p * 0.9) : undefined,
    );
  } else {
    const buffer: Obj[] = [];
    let started = false;
    const beginJson = () => {
      started = true;
      headers = Array.from(new Set(buffer.flatMap((o) => flattenKeys(o))));
      start({ csv: false, headers, sample: buffer }, buffer);
    };
    const stats = scanJson(
      text,
      (o) => {
        if (!started) {
          buffer.push(o);
          if (buffer.length >= SAMPLE_RECORDS) beginJson();
          return;
        }
        collector?.add(o);
      },
      progress ? (p) => progress(p * 0.9) : undefined,
    );
    if (!started && buffer.length > 0) beginJson();
    if (buffer.length === 0) {
      return { conversations: [], headers: [], warnings: ['Could not read any JSON records from this file.'] };
    }
    (collector as Collector | null)?.addBadJson(stats.bad);
  }

  progress?.(0.95);
  const done = (collector as Collector | null)?.finish(headerWarnings) ?? { conversations: [], warnings: headerWarnings };
  progress?.(1);
  return { conversations: done.conversations, headers, warnings: done.warnings };
}
