import type { ContributionVendor, Preset, Reason, Verdict } from "@/engine";

export const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "intercom", label: "Intercom Fin" },
  { value: "zendesk", label: "Zendesk AI agents" },
  { value: "ada", label: "Ada" },
  { value: "gorgias", label: "Gorgias AI Agent" },
  { value: "generic", label: "Other (map columns)" },
];

export const PRESET_VENDOR_NAME: Record<Preset, string> = {
  intercom: "Intercom",
  zendesk: "Zendesk",
  ada: "Ada",
  gorgias: "Gorgias",
  generic: "the vendor",
};

// Default price per resolution in USD. Only values confirmed in
// docs/research/vendor-facts.md (Intercom, Gorgias monthly); the rest are left
// for the user to enter. Source links and check dates are on the vendor pages.
export const DEFAULT_PRICE: Record<Preset, number> = {
  intercom: 0.99,
  gorgias: 1.0,
  zendesk: 0,
  ada: 0,
  generic: 0,
};

export const PRESET_VENDOR_SLUG: Partial<Record<Preset, string>> = {
  intercom: "intercom",
  zendesk: "zendesk",
  ada: "ada",
  gorgias: "gorgias",
};

export const REASON_LABEL: Record<Reason, string> = {
  human_handoff: "A human replied after the AI",
  reopened: "Reopened",
  repeat_contact: "Same customer came back",
  negative_csat: "Negative CSAT",
  vendor_escalated: "Vendor marked it escalated",
};

export const REASON_SHORT: Record<Reason, string> = {
  human_handoff: "Human reply",
  reopened: "Reopened",
  repeat_contact: "Repeat contact",
  negative_csat: "Negative CSAT",
  vendor_escalated: "Escalated",
};

export const REASON_ORDER: Reason[] = [
  "repeat_contact",
  "human_handoff",
  "reopened",
  "negative_csat",
  "vendor_escalated",
];

export const VERDICT_LABEL: Record<Verdict, string> = {
  strict_pass: "Strict",
  confirmed_pass: "Confirmed",
  phantom: "Phantom",
  fail_unbilled: "Not strict, not billed",
  pending_window: "Pending",
  unverifiable: "Unverifiable",
};

// Canonical field keys sent to the engine in ColumnMapping. They mirror the
// Conversation interface; "<field>Value" keys carry the cell value that means "yes".
export interface MapperField {
  key: string;
  label: string;
  help: string;
  required?: boolean;
  valueKey?: string; // second input: the value in the column that means yes
  valueLabel?: string;
  scaleKey?: string; // second input: the rating scale
}

// Rating scales the mapper offers (engine CsatScale). Empty = let the engine guess from the highest score.
export const CSAT_SCALE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Guess from the highest score" },
  { value: "1-5", label: "1 to 5" },
  { value: "1-10", label: "1 to 10" },
  { value: "0-100", label: "0 to 100" },
  { value: "0-1", label: "0 to 1" },
];

// Labels for the vendor list a contribution can be filed under (slugs from content/vendors.json).
export const CONTRIBUTION_VENDOR_LABEL: Record<ContributionVendor, string> = {
  intercom: "Intercom Fin",
  zendesk: "Zendesk AI agents",
  ada: "Ada",
  gorgias: "Gorgias AI Agent",
  hubspot: "HubSpot Customer Agent",
  front: "Front Autopilot",
  "help-scout": "Help Scout AI Answers",
  "salesforce-agentforce": "Salesforce Agentforce",
  freshworks: "Freshworks Freddy AI Agent",
  tidio: "Tidio Lyro",
  decagon: "Decagon",
  sierra: "Sierra",
  kustomer: "Kustomer",
  other: "Other or not listed",
};

export const MAPPER_FIELDS: MapperField[] = [
  { key: "id", label: "Conversation or ticket ID", help: "A unique ID per row.", required: true },
  {
    key: "createdAt",
    label: "Created at",
    help: "ISO date, or Unix seconds. Dates without a timezone are read as UTC. Dates like 05/10/2026 are read day/month or month/day depending on the values in the file.",
    required: true,
  },
  {
    key: "billed",
    label: "Billed as an AI resolution",
    help: "The column that marks what the vendor counted as a resolution.",
    required: true,
    valueKey: "billedValue",
    valueLabel: "Value that means billed",
  },
  {
    key: "customerKey",
    label: "Customer (email or ID)",
    help: "Needed to detect repeat contacts. Used in memory only, never stored.",
  },
  {
    key: "aiInvolved",
    label: "Handled by the AI agent",
    help: "Leave empty if the file only contains AI conversations.",
    valueKey: "aiInvolvedValue",
    valueLabel: "Value that means AI-handled",
  },
  {
    key: "humanReplied",
    label: "Human reply after the AI",
    help: "A yes/no column, or a count above zero.",
  },
  {
    key: "reopenedAt",
    label: "Reopened at",
    help: "Optional. When it is given, a reopen counts only if it happened within the window. Without it, any reopen count above zero counts.",
  },
  { key: "reopenCount", label: "Reopen count", help: "Number of times the conversation was reopened." },
  {
    key: "csat",
    label: "CSAT or rating",
    help: "Choose the scale below. It is turned into 0 to 1 using the scale, never the lowest and highest score in your file.",
    scaleKey: "csatScale",
  },
  { key: "closedAt", label: "Closed at", help: "Optional." },
  { key: "channel", label: "Channel", help: "Optional." },
  {
    key: "topicText",
    label: "Subject or first message",
    help: "Optional. Used only for the same-topic filter, in this tab.",
  },
];
