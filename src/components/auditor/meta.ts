import type { Preset, Reason, Verdict } from "@/engine";

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
}

export const MAPPER_FIELDS: MapperField[] = [
  { key: "id", label: "Conversation or ticket ID", help: "A unique ID per row.", required: true },
  {
    key: "createdAt",
    label: "Created at",
    help: "ISO date, or Unix seconds. Dates without a timezone are read as UTC.",
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
  { key: "reopenCount", label: "Reopen count", help: "Number of times the conversation was reopened." },
  { key: "csat", label: "CSAT or rating", help: "Any scale. It is normalised to 0..1." },
  { key: "closedAt", label: "Closed at", help: "Optional." },
  { key: "channel", label: "Channel", help: "Optional." },
  {
    key: "topicText",
    label: "Subject or first message",
    help: "Optional. Used only for the same-topic filter, in this tab.",
  },
];
