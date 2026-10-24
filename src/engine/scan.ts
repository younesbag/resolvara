// Readers that turn the text of an export into rows. Pure and synchronous over a string.
// CSV goes through Papaparse in chunk mode (BOM, delimiter detection, quoted newlines).
// JSON arrays, wrapped lists and JSONL are scanned element by element, so a large array is
// never parsed as one value.
import Papa from 'papaparse';

export const MAX_TEXT_CHARS = 400 * 1024 * 1024; // keeps the file well inside V8's string limit

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export type Format = 'csv' | 'json' | 'empty';

export function sniffFormat(text: string): Format {
  const s = stripBom(text);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    return c === 91 /* [ */ || c === 123 /* { */ ? 'json' : 'csv';
  }
  return 'empty';
}

/** Feeds each CSV row (as string cells) to `onRow`. Return false from it to stop early. */
export function scanCsv(
  text: string,
  onRow: (cells: string[]) => boolean | void,
  onProgress?: (p: number) => void,
): void {
  const input = stripBom(text);
  const total = Math.max(1, input.length);
  let stop = false;
  Papa.parse<string[]>(input, {
    header: false,
    skipEmptyLines: 'greedy',
    chunkSize: 4 * 1024 * 1024,
    complete: () => undefined,
    chunk: (res: Papa.ParseResult<string[]>, parser: Papa.Parser) => {
      for (const row of res.data) {
        if (onRow(row) === false) {
          stop = true;
          break;
        }
      }
      if (stop) parser.abort();
      else if (onProgress) onProgress(Math.min(1, res.meta.cursor / total));
    },
  });
}

const WRAP_KEYS = ['conversations', 'tickets', 'data', 'results', 'items', 'records', 'rows'];

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** `{"conversations":[...]}`-style records yield their elements; anything else yields itself. */
function unwrap(o: Obj, emit: (o: Obj) => boolean): boolean {
  if (!('id' in o)) {
    for (const k of WRAP_KEYS) {
      const v = o[k];
      if (Array.isArray(v) && v.length > 0 && v.every(isObj)) {
        for (const e of v as Obj[]) if (!emit(e)) return false;
        return true;
      }
    }
  }
  return emit(o);
}

function isJsonl(s: string): boolean {
  const nl = s.indexOf('\n');
  const first = (nl < 0 ? s : s.slice(0, nl)).trim().replace(/,$/, '');
  if (!first.startsWith('{') || !first.endsWith('}')) return false;
  try {
    JSON.parse(first);
    return true;
  } catch {
    return false;
  }
}

export interface JsonStats {
  bad: number; // lines/elements that were not valid JSON
}

/**
 * Feeds each JSON record to `onRecord`. Return false from it to stop early.
 * `truncated` tells the scanner the text is only the start of a file, so the cut-off last element is ignored.
 */
export function scanJson(
  text: string,
  onRecord: (o: Obj) => boolean | void,
  onProgress?: (p: number) => void,
): JsonStats {
  const s = stripBom(text);
  const stats: JsonStats = { bad: 0 };
  const total = Math.max(1, s.length);
  let live = true;
  const emit = (o: Obj): boolean => {
    if (onRecord(o) === false) live = false;
    return live;
  };

  let first = 0;
  while (first < s.length && /\s/.test(s[first])) first++;

  if (s[first] === '{' && isJsonl(s.slice(first))) {
    let pos = first;
    let lastReport = 0;
    while (live && pos < s.length) {
      let nl = s.indexOf('\n', pos);
      if (nl < 0) nl = s.length;
      const line = s.slice(pos, nl).trim().replace(/,$/, '');
      pos = nl + 1;
      if (!line) continue;
      try {
        const o: unknown = JSON.parse(line);
        if (isObj(o)) unwrap(o, emit);
      } catch {
        stats.bad += 1;
      }
      if (onProgress && pos - lastReport > 1 << 20) {
        lastReport = pos;
        onProgress(Math.min(1, pos / total));
      }
    }
    return stats;
  }

  // Array, or an object that wraps one. Elements are cut out by tracking bracket depth.
  let depth = 0;
  let recDepth = -1; // depth at which the records live
  let inStr = false;
  let esc = false;
  let start = -1;
  let emitted = 0;
  let lastReport = 0;
  for (let i = first; i < s.length && live; i++) {
    const c = s.charCodeAt(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 92) esc = true;
      else if (c === 34) inStr = false;
      continue;
    }
    if (c === 34) {
      inStr = true;
    } else if (c === 123 /* { */) {
      if (start < 0 && depth === recDepth) start = i;
      depth += 1;
    } else if (c === 91 /* [ */) {
      if (recDepth < 0 && depth <= 1) recDepth = depth + 1;
      depth += 1;
    } else if (c === 125 /* } */) {
      depth -= 1;
      if (start >= 0 && depth === recDepth) {
        try {
          const o: unknown = JSON.parse(s.slice(start, i + 1));
          if (isObj(o)) {
            emitted += 1;
            emit(o);
          }
        } catch {
          stats.bad += 1;
        }
        start = -1;
        if (onProgress && i - lastReport > 1 << 20) {
          lastReport = i;
          onProgress(Math.min(1, i / total));
        }
      }
    } else if (c === 93 /* ] */) {
      depth -= 1;
      if (recDepth >= 0 && depth < recDepth) {
        if (emitted > 0) break; // the record array is closed
        recDepth = -1; // an empty or non-record array (for example "errors": []): keep looking
      }
    }
  }
  return stats;
}
