// Engine API (docs/SPEC.md "Engine API"). Pure TS: no React/Next imports.
export * from './types';
export { audit, POSITIVE_RATING, SENSITIVITY_WINDOWS } from './audit';
export { detectPreset, parseFile, peekFile, type Peek } from './parse';
export { contributionPayload, disputeSummaryText, toDisputeCsv, vendorForPreset } from './outputs';
export { sampleDataset } from './sample';
export { CSAT_SCALES, guessCsatScale, normalizeCsat, type CsatScale } from './presets';
export {
  simulateBilling,
  billSplitSentence,
  LIST_PRICES,
  type BillingSimulation,
  type BillSplit,
  type SimRow,
  type SimKind,
  type SimRuleId,
} from './simulate';
