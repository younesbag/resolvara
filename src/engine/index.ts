// Engine API contract (docs/SPEC.md "Engine API"). Pure TS: no React/Next imports.

export type Preset = 'intercom' | 'zendesk' | 'ada' | 'gorgias' | 'generic';
export type VendorState =
  | 'assumed'
  | 'confirmed'
  | 'escalated'
  | 'negative_feedback'
  | 'handoff'
  | 'verified'
  | 'contained'
  | 'billed_unknown'
  | 'not_ai'
  | 'unknown';

export interface Conversation {
  id: string;
  customerKey: string | null;
  createdAt: Date;
  closedAt: Date | null;
  aiInvolved: boolean;
  vendorState: VendorState;
  billed: boolean; // billed = vendor counts it as a billable resolution
  humanReplied: boolean | null;
  reopenCount: number | null;
  csat: number | null; // csat normalised 0..1 (null if absent)
  channel: string | null;
  topicText: string | null; // topicText only kept in memory, optional
}

export interface ColumnMapping {
  [canonicalField: string]: string | null;
} // for 'generic' and overrides

export interface AuditOptions {
  windowDays: number; // default 7
  pricePerResolution: number; // default from preset (Intercom 0.99, Gorgias 1.00, ...) user-editable
  sameTopicOnly: boolean; // default false; when true repeat contact needs topic similarity >= 0.35 (local TF-IDF cosine)
  negativeCsatThreshold: number; // default 0.4 on the 0..1 scale
  exportEnd?: Date; // default = max createdAt in file
}

export type Verdict =
  | 'strict_pass'
  | 'confirmed_pass'
  | 'phantom'
  | 'pending_window'
  | 'unverifiable';
export type Reason =
  | 'human_handoff'
  | 'reopened'
  | 'repeat_contact'
  | 'negative_csat'
  | 'vendor_escalated';

export interface ConvResult {
  id: string;
  verdict: Verdict;
  reasons: Reason[];
  evidence: string[];
}

export interface AuditReport {
  standardVersion: '0.1';
  preset: Preset;
  rowsRead: number;
  rowsSkipped: number;
  warnings: string[];
  period: { start: Date; end: Date };
  aiConversations: number;
  billed: number;
  billedRate: number; // billed / aiConversations
  verifiable: number;
  strictPass: number;
  confirmedPass: number;
  phantom: number;
  pending: number;
  unverifiable: number;
  strictRate: number; // (strictPass+confirmedPass) / aiConversations, excluding pending from denominator
  phantomShareOfBilled: number; // phantom / (billed - pending - unverifiable)
  dollarsAtRisk: number; // phantom * pricePerResolution
  byReason: Record<Reason, number>;
  weekly: { weekStart: string; billed: number; phantom: number; strictPass: number }[];
  sensitivity: { windowDays: number; phantom: number; strictRate: number }[]; // for 1,3,7,14,30
  results: ConvResult[];
}

// Aggregates only, no ids/text. Shape per SPEC "Contribution API".
export interface Contribution {
  standardVersion: '0.1';
  preset: Preset;
  vendor: string;
  periodDays: number;
  aiConversationsBucket: '<1k' | '1k-10k' | '10k-100k' | '>100k';
  billedRate: number;
  strictRate: number;
  phantomShareOfBilled: number;
  windowDays: number;
  byReasonShare: Record<Reason, number>;
}

const NOT_IMPLEMENTED = 'not implemented';

export function detectPreset(
  headers: string[],
  sample: Record<string, unknown>[],
): { preset: Preset; confidence: number } {
  void headers;
  void sample;
  throw new Error(NOT_IMPLEMENTED);
}

export async function parseFile(
  file: File | string,
  opts?: { preset?: Preset; mapping?: ColumnMapping; onProgress?: (p: number) => void },
): Promise<{ conversations: Conversation[]; headers: string[]; warnings: string[] }> {
  void file;
  void opts;
  throw new Error(NOT_IMPLEMENTED);
}

export function audit(convs: Conversation[], opts: AuditOptions, preset: Preset): AuditReport {
  void convs;
  void opts;
  void preset;
  throw new Error(NOT_IMPLEMENTED);
}

export function toDisputeCsv(report: AuditReport, convs: Conversation[]): string {
  void report;
  void convs;
  throw new Error(NOT_IMPLEMENTED);
}

// plain text + email template
export function disputeSummaryText(
  report: AuditReport,
  opts: AuditOptions,
  vendorName: string,
): string {
  void report;
  void opts;
  void vendorName;
  throw new Error(NOT_IMPLEMENTED);
}

// aggregates only, no ids/text
export function contributionPayload(report: AuditReport, opts: AuditOptions): Contribution {
  void report;
  void opts;
  throw new Error(NOT_IMPLEMENTED);
}

// realistic synthetic CSV/JSONL for "Try sample data"
export function sampleDataset(preset: Preset, seed?: number): string {
  void preset;
  void seed;
  throw new Error(NOT_IMPLEMENTED);
}
