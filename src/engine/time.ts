// Timestamp parsing. Offsets are honoured; timestamps without one are read as UTC and flagged.

export interface ParsedTime {
  date: Date | null;
  naive: boolean; // true when no timezone was present and UTC was assumed
}

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/i;
const NUMERIC = /^\d{9,13}(?:\.\d+)?$/;
const HAS_TZ = /(?:\bz|gmt|utc|[+-]\d{2}:?\d{2})\s*$/i;

function fromEpoch(n: number): Date | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  // Seconds up to year 5138, milliseconds beyond that.
  const ms = n < 1e11 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseTimestamp(value: unknown): ParsedTime {
  if (value instanceof Date) {
    return { date: Number.isNaN(value.getTime()) ? null : value, naive: false };
  }
  if (typeof value === 'number') return { date: fromEpoch(value), naive: false };
  if (typeof value !== 'string') return { date: null, naive: false };
  const s = value.trim();
  if (!s) return { date: null, naive: false };

  if (NUMERIC.test(s)) return { date: fromEpoch(Number(s)), naive: false };

  const m = ISO.exec(s);
  if (m) {
    const [, y, mo, d, h = '0', mi = '0', se = '0', frac = '', tz] = m;
    const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
    let t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se), ms);
    const dt = new Date(t);
    // Reject impossible dates such as 2026-02-31 (Date.UTC would roll them over).
    if (dt.getUTCMonth() !== Number(mo) - 1 || dt.getUTCDate() !== Number(d)) {
      return { date: null, naive: false };
    }
    let naive = true;
    if (tz) {
      naive = false;
      if (tz.toUpperCase() !== 'Z') {
        const sign = tz[0] === '-' ? -1 : 1;
        const digits = tz.slice(1).replace(':', '');
        const oh = Number(digits.slice(0, 2));
        const om = Number(digits.slice(2, 4) || '0');
        t -= sign * (oh * 60 + om) * 60_000;
      }
    }
    return { date: new Date(t), naive };
  }

  // Other human formats: only trust them when they carry a zone, otherwise read as UTC.
  const hasTz = HAS_TZ.test(s);
  const parsed = Date.parse(hasTz ? s : `${s} UTC`);
  if (Number.isNaN(parsed)) return { date: null, naive: false };
  return { date: new Date(parsed), naive: !hasTz };
}
