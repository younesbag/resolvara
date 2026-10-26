// Contract clause generator. Pure TypeScript, no React or Next imports.
// Builds plain-English contract language that defines a billable AI resolution from the
// Strict Resolution Standard. The five Fail Signals and their meanings follow content/standard.md.

export type SilenceRule = "reported" | "never";
export type CreditRule = "next_invoice" | "refund" | "next_invoice_or_refund";

export interface ContractOptions {
  vendorName: string;
  customerName: string;
  /** Judgement window in days (the Standard's W). */
  windowDays: number;
  /** Negative-rating threshold on a 0..1 scale. */
  csatThreshold: number;
  silence: SilenceRule;
  disputeDays: number;
  credit: CreditRule;
  /** A recorded effect of the AI's action (a refund id, an order update) counts as positive evidence. */
  receiptCounts: boolean;
}

export const DEFAULT_OPTIONS: ContractOptions = {
  vendorName: "",
  customerName: "",
  windowDays: 7,
  csatThreshold: 0.4,
  silence: "reported",
  disputeDays: 30,
  credit: "next_invoice",
  receiptCounts: true,
};

export const CREDIT_LABELS: Record<CreditRule, string> = {
  next_invoice: "credited in full on the next invoice",
  refund: "refunded in full",
  next_invoice_or_refund: "credited in full on the next invoice, or refunded if no further invoice is due",
};

export interface ClauseLine {
  /** Reference such as "1.2" or "(a)". */
  ref: string;
  text: string;
  /** Sub-item of the line above. */
  sub?: boolean;
}

export interface Clause {
  number: number;
  heading: string;
  lines: ClauseLine[];
}

export interface ClauseDocument {
  title: string;
  preamble: string;
  clauses: Clause[];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function cleanName(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 120) : "";
}

/** Fills defaults and clamps every value to a sensible range, so the output is always well formed. */
export function normalizeOptions(input: Partial<ContractOptions> = {}): ContractOptions {
  const d = DEFAULT_OPTIONS;
  const t = typeof input.csatThreshold === "number" ? input.csatThreshold : Number(input.csatThreshold);
  return {
    vendorName: cleanName(input.vendorName),
    customerName: cleanName(input.customerName),
    windowDays: clampInt(input.windowDays, 1, 90, d.windowDays),
    csatThreshold: Number.isFinite(t) ? Math.min(1, Math.max(0.05, Math.round(t * 100) / 100)) : d.csatThreshold,
    silence: input.silence === "never" ? "never" : "reported",
    disputeDays: clampInt(input.disputeDays, 1, 365, d.disputeDays),
    credit: input.credit && input.credit in CREDIT_LABELS ? input.credit : d.credit,
    receiptCounts: typeof input.receiptCounts === "boolean" ? input.receiptCounts : d.receiptCounts,
  };
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/**
 * The whole 1-to-5 ratings that fall below the threshold. The engine normalises a 1-to-5 score
 * as (score - 1) / 4 (presets.ts normalizeCsat), so 0.4 catches 1 and 2, and a 3 (0.5) passes.
 */
export function csatOnFiveScale(threshold: number): string {
  const below = [1, 2, 3, 4, 5].filter((r) => (r - 1) / 4 < threshold);
  if (below.length === 0) return "no rating";
  if (below.length === 1) return "a rating of 1";
  return `a rating of ${below.slice(0, -1).join(", ")} or ${below[below.length - 1]}`;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function buildClauses(partial: Partial<ContractOptions> = {}, standardVersion = "0.1"): ClauseDocument {
  const o = normalizeOptions(partial);
  const W = plural(o.windowDays, "day");
  const D = plural(o.disputeDays, "day");
  const T = trim(o.csatThreshold);
  const T5 = csatOnFiveScale(o.csatThreshold);

  const parties =
    o.customerName || o.vendorName
      ? `This clause applies between ${o.customerName ? `${o.customerName} (the "Customer")` : "the Customer"} and ${
          o.vendorName ? `${o.vendorName} (the "Vendor")` : "the Vendor"
        }.`
      : `This clause applies between the Customer and the Vendor.`;
  const preamble = `${parties} It defines which AI conversations the Vendor may charge for as resolutions, and what data the Customer receives to check that.`;

  // 1. Definitions
  const positive: ClauseLine[] = [
    { ref: "(a)", text: `the Vendor's own recorded state for the conversation is "confirmed";`, sub: true },
    {
      ref: "(b)",
      text: `the end user gave an explicit positive rating, meaning a satisfaction score of 0.75 or more on a scale of 0 to 1 (4 or 5 on a scale of 1 to 5)${
        o.receiptCounts ? ";" : "."
      }`,
      sub: true,
    },
    ...(o.receiptCounts ? [{ ref: "(c)", text: `a System Receipt exists for the conversation.`, sub: true }] : []),
  ];
  const definitions: ClauseLine[] = [
    {
      ref: "1.1",
      text: `"AI Conversation" means a conversation between an end user and the Customer's support channel in which an AI agent provided by the Vendor took part.`,
    },
    {
      ref: "1.2",
      text: `"Judgement Window" means the period of ${W} after the time at which an AI Conversation was created.`,
    },
    { ref: "1.3", text: `"Fail Signal" means any one of the following:` },
    {
      ref: "(a)",
      text: `Vendor escalation: the Vendor's own recorded state for the conversation is escalated, handoff or negative feedback.`,
      sub: true,
    },
    {
      ref: "(b)",
      text: `Human reply: a human agent or administrator replied in the conversation after the AI agent took part, including a courtesy reply.`,
      sub: true,
    },
    {
      ref: "(c)",
      text: `Reopened: the conversation has a reopen count above zero, or was reopened within the Judgement Window.`,
      sub: true,
    },
    {
      ref: "(d)",
      text: `Repeat contact: the same end user opened another conversation after this one was created and no later than the end of the Judgement Window.`,
      sub: true,
    },
    {
      ref: "(e)",
      text: `Negative rating: the end user gave a satisfaction score below ${T} on a scale of 0 to 1 (${T5} on a scale of 1 to 5), after converting the score to the scale of 0 to 1 by the scale of the rating.`,
      sub: true,
    },
    { ref: "1.4", text: `"Positive Evidence" means any one of the following:` },
    ...positive,
  ];
  let n = 5;
  if (o.receiptCounts) {
    definitions.push({
      ref: `1.${n++}`,
      text: `"System Receipt" means a record created by an action the AI agent took in that conversation, such as a refund identifier or an order update. A System Receipt counts as confirmation that the conversation had an effect, and is Positive Evidence.`,
    });
  }
  definitions.push({
    ref: `1.${n}`,
    text: `"Billable Resolution" means an AI Conversation that meets every condition in clause 2.`,
  });

  // 2. When a resolution becomes billable
  const silenceLine: ClauseLine =
    o.silence === "reported"
      ? {
          ref: "2.4",
          text: `An AI Conversation with no Fail Signal is a Billable Resolution even if the end user gave no confirmation. The Vendor shall report separately the number of Billable Resolutions that have Positive Evidence and the number that have none.`,
        }
      : {
          ref: "2.4",
          text: `An AI Conversation is a Billable Resolution only if it also has Positive Evidence. Silence, meaning an end user who stops replying without confirmation, is never billable.`,
        };
  const billable: ClauseLine[] = [
    { ref: "2.1", text: `The Vendor may charge a fee for an AI Conversation only if it is a Billable Resolution.` },
    {
      ref: "2.2",
      text: `An AI Conversation becomes billable only after its Judgement Window has ended. The Vendor shall not include it in an invoice before then. A fee for a conversation still inside its Judgement Window is invoiced in a later period, once the window has ended and clause 2 is met.`,
    },
    {
      ref: "2.3",
      text: `An AI Conversation that shows any Fail Signal is not a Billable Resolution, whatever the Vendor's own classification of it.`,
    },
    silenceLine,
    {
      ref: "2.5",
      text: `If the Vendor does not supply the customer identifier for a conversation, the repeat contact test cannot be applied to it and it is not a Billable Resolution.`,
    },
  ];

  // 3. Reporting
  const fields = [
    `conversation identifier;`,
    `customer identifier, hashed with the same key throughout, so that repeat contact can be tested without sharing personal data;`,
    `time the conversation was created, with its time zone;`,
    `whether an AI agent took part;`,
    `the Vendor's recorded resolution state;`,
    `whether the conversation was billed, and the fee charged;`,
    `the time of the last AI message and the time of any human reply after it;`,
    `the reopen count and the time of any reopen;`,
    `the satisfaction score, with the scale it was given on${o.receiptCounts ? ";" : "."}`,
    ...(o.receiptCounts ? [`the reference of any System Receipt.`] : []),
  ];
  const reporting: ClauseLine[] = [
    {
      ref: "3.1",
      text: `With each invoice, and in any case monthly, the Vendor shall give the Customer an export, in CSV or JSON, with one row for every conversation in the period. The export includes conversations that were not billed, and conversations in which no AI agent took part, marked as such.`,
    },
    { ref: "3.2", text: `Each row shall contain at least:` },
    ...fields.map((text, i) => ({ ref: `(${String.fromCharCode(97 + i)})`, text, sub: true as const })),
    {
      ref: "3.3",
      text: `The Vendor shall not remove or alter rows after delivery, except to correct an error, and shall tell the Customer of each correction.`,
    },
  ];

  // 4. Audit and reconciliation
  const audit: ClauseLine[] = [
    {
      ref: "4.1",
      text: `The Customer may check the export against this clause, by hand or with any tool, including by applying the Strict Resolution Standard version ${standardVersion} with a Judgement Window of ${W} and a rating threshold of ${T}. The Customer is not required to send the export to any third party.`,
    },
    {
      ref: "4.2",
      text: `Within ${D} of receiving an export, the Customer may tell the Vendor in writing which conversations it believes are not Billable Resolutions, giving the conversation identifier and the Fail Signal for each.`,
    },
    {
      ref: "4.3",
      text: `The Vendor shall review each disputed conversation against this clause and answer in writing, before the next invoice is issued.`,
    },
    {
      ref: "4.4",
      text: `Each disputed conversation that shows a Fail Signal, or that is not a Billable Resolution for another reason under clause 2, shall be ${CREDIT_LABELS[o.credit]}.`,
    },
  ];

  // 5. Changes to the definition
  const changes: ClauseLine[] = [
    {
      ref: "5.1",
      text: `During the term, the Vendor shall not change the definition of a Billable Resolution, the Fail Signals, the Judgement Window or the fields in clause 3 without the Customer's written consent and at least 60 days' written notice.`,
    },
  ];

  // 6. Attribution
  const attribution: ClauseLine[] = [
    {
      ref: "6.1",
      text: `Definitions adapted from The Strict Resolution Standard (CC BY 4.0), resolvara.com/standard.`,
    },
  ];

  return {
    title: "Definition of a Billable Resolution",
    preamble,
    clauses: [
      { number: 1, heading: "Definitions", lines: definitions },
      { number: 2, heading: "When a resolution becomes billable", lines: billable },
      { number: 3, heading: "Reporting", lines: reporting },
      { number: 4, heading: "Audit and reconciliation", lines: audit },
      { number: 5, heading: "Changes to the definition", lines: changes },
      { number: 6, heading: "Attribution", lines: attribution },
    ],
  };
}

export function toPlainText(doc: ClauseDocument): string {
  const out: string[] = [doc.title.toUpperCase(), "", doc.preamble, ""];
  for (const c of doc.clauses) {
    out.push(`${c.number}. ${c.heading}`, "");
    for (const l of c.lines) out.push(`${l.sub ? "    " : ""}${l.ref} ${l.text}`);
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

export function toMarkdown(doc: ClauseDocument): string {
  const out: string[] = [`# ${doc.title}`, "", doc.preamble, ""];
  for (const c of doc.clauses) {
    out.push(`## ${c.number}. ${c.heading}`, "");
    for (const l of c.lines) out.push(`${l.sub ? "- " : ""}**${l.ref}** ${l.text}`, "");
  }
  return out.join("\n").trimEnd() + "\n";
}
