// Ticket ids from the emailed Admin Center Usage > Resolutions CSV: the exact billed list.
// The column name is not documented, so it is matched loosely and reported back to the user.
import Papa from 'papaparse';

const PATTERNS = [/^ticket\s*_?id$/i, /ticket\s*_?id/i, /^ticket$/i, /^id$/i];

export function parseUsageCsv(text: string): { ids: number[]; column: string | null; rows: number } {
  const res = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: true,
  });
  const headers = res.meta.fields ?? [];
  let column: string | null = null;
  for (const p of PATTERNS) {
    column = headers.find((h) => p.test(h.trim())) ?? null;
    if (column) break;
  }
  const rows = res.data.length;
  if (!column) return { ids: [], column: null, rows };
  const ids = new Set<number>();
  for (const row of res.data) {
    const n = Number(String(row[column] ?? '').trim().replace(/^#/, ''));
    if (Number.isInteger(n) && n > 0) ids.add(n);
  }
  return { ids: [...ids], column, rows };
}
