// Contract between the Zendesk fetcher (main frame), the mapper (worker) and the UI.
// Shapes are the subset of Zendesk API objects the audit reads. Everything stays in memory.

/** A ticket from GET /api/v2/incremental/tickets/cursor (one row of `tickets`). */
export interface ZTicket {
  id: number;
  created_at: string;
  updated_at?: string;
  status?: string; // "new" | "open" | "pending" | "hold" | "solved" | "closed" | "deleted"
  requester_id?: number | null;
  subject?: string | null;
  tags?: string[];
  via?: { channel?: string | null; source?: { rel?: string | null } | null } | null;
  custom_fields?: { id: number; value: unknown }[];
  satisfaction_rating?: { score?: string | null } | null;
  /** Present when the export ran with include=metric_sets and the API inlines it. */
  metric_set?: ZMetricSet | null;
  /** "ai_agent" while the conversation is AI-only; "agent" once escalated or for ordinary tickets (observed 2026-10-25). */
  support_type?: string | null;
}

/** Sideloaded `metric_sets` row (include=metric_sets), or the inlined `metric_set`. */
export interface ZMetricSet {
  ticket_id?: number;
  reopens?: number | null;
  replies?: number | null;
  solved_at?: string | null;
}

/** GET /api/v2/tickets/{id}/comments.json?include=users, reduced. */
export interface ZComment {
  id: number;
  author_id: number;
  public: boolean;
  created_at: string;
  plain_body?: string;
  body?: string;
  via?: { channel?: string | null; source?: { rel?: string | null } | null } | null;
}
export interface ZUser {
  id: number;
  role: string; // "end-user" | "agent" | "admin"
  name?: string;
}

/** Ids of the system resolution fields, found by key in /api/v2/ticket_fields.json. */
export interface ResolutionFieldIds {
  tier: number | null; // standard::resolution_tier
  type: number | null; // standard::resolution_type
}

/** Everything the mapper needs, posted from the main frame to the worker. */
export interface MapInput {
  /** Tickets from the AI-agent scoped export (support_type_scope=ai_agent). */
  aiTickets: ZTicket[];
  /** Tickets from the unscoped export, for repeat-contact. May overlap aiTickets. */
  otherTickets: ZTicket[];
  metricSets: ZMetricSet[];
  fields: ResolutionFieldIds;
  /** Inclusive start of the audited period (ISO). Tickets created before it are dropped. */
  periodStart: string;
  /** Fetch time (ISO). The audit's export end: the window is judged against it. */
  fetchedAt: string;
  /** Per ticket id: result of the comment-order check, when it ran. */
  replyOrder?: Record<number, boolean>;
  /** Ticket ids from the emailed Usage > Resolutions CSV. When present it replaces the tier proxy. */
  billedIds?: number[] | null;
  /** Tickets the fetcher already dropped because they were created before the period. */
  preDropped?: number;
}

export interface MapStats {
  ticketsRead: number;
  droppedBeforePeriod: number;
  droppedDeleted: number;
  droppedNoDate: number;
  aiConversations: number;
  billedByTier: number;
  billedByUsageCsv: number | null;
  usageCsvUnmatched: number | null; // billed ids in the CSV with no AI ticket in the period
  aiNotInUsageCsv: number | null; // tickets the tier marks Verified that the CSV does not list (often a date-range mismatch)
  /** Neither Resolution tier nor Resolution type was found in the account's ticket fields. */
  fieldsMissing: boolean;
  replyOrderChecked: number;
}
