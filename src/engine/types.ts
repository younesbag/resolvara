// Engine types (docs/SPEC.md "Engine API"). Pure TS: no React/Next imports.

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
  customerKey: string | null; // salted hash, never the raw id or email
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
  | 'fail_unbilled' // a fail signal fired but the vendor did not bill it: not strictly resolved, not phantom
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
  rowsRead: number; // conversations handed to the audit
  rowsSkipped: number; // duplicate ids and rows without a usable date
  warnings: string[];
  period: { start: Date; end: Date };
  aiConversations: number;
  billed: number; // all billed AI conversations, pending and unverifiable included (what the invoice counts)
  /**
   * judged = aiConversations - pending - unverifiable. Every rate below shares this population,
   * so billedRate and strictRate can be compared directly.
   */
  judged: number;
  billedJudged: number; // billed conversations inside `judged`: phantom + billed passes
  billedRate: number; // billedJudged / judged
  verifiable: number; // same as `judged`, kept for older callers
  strictPass: number;
  confirmedPass: number;
  phantom: number;
  failUnbilled: number; // fail signal, not billed
  pending: number;
  unverifiable: number;
  strictRate: number; // (strictPass+confirmedPass) / judged
  phantomShareOfBilled: number; // phantom / billedJudged
  dollarsAtRisk: number; // phantom * pricePerResolution
  /** Reason counts over phantom conversations only. A conversation can carry several reasons. */
  byReason: Record<Reason, number>;
  weekly: { weekStart: string; billed: number; phantom: number; strictPass: number }[];
  sensitivity: { windowDays: number; phantom: number; strictRate: number }[]; // for 1,3,7,14,30
  results: ConvResult[];
}

/** Vendors a contribution can be filed under: the slugs in content/vendors.json, plus `other`. */
export const CONTRIBUTION_VENDORS = [
  'intercom',
  'zendesk',
  'ada',
  'gorgias',
  'hubspot',
  'front',
  'help-scout',
  'salesforce-agentforce',
  'freshworks',
  'tidio',
  'decagon',
  'sierra',
  'kustomer',
  'other',
] as const;
export type ContributionVendor = (typeof CONTRIBUTION_VENDORS)[number];

// Aggregates only, no ids/text. Shape per SPEC "Contribution API".
export interface Contribution {
  standardVersion: '0.1';
  preset: Preset;
  vendor: ContributionVendor;
  periodDays: number;
  aiConversationsBucket: '<1k' | '1k-10k' | '10k-100k' | '>100k';
  billedRate: number;
  strictRate: number;
  phantomShareOfBilled: number;
  windowDays: number;
  /** Share of phantom conversations carrying each reason (shares can add up to more than 1). */
  byReasonShare: Record<Reason, number>;
}
