// Customer identifiers never stay in clear text. Each id or email is replaced by a salted
// SHA-256 digest (64 bits kept) before any rule runs. The salt is random per session
// (per module instance, i.e. per worker), so digests cannot be linked between sessions.

const K = new Uint32Array(64);
const H0 = new Uint32Array(8);
(function init() {
  const primes: number[] = [];
  for (let n = 2; primes.length < 64; n++) {
    let ok = true;
    for (const p of primes) {
      if (p * p > n) break;
      if (n % p === 0) {
        ok = false;
        break;
      }
    }
    if (ok) primes.push(n);
  }
  const frac32 = (x: number) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  for (let i = 0; i < 64; i++) K[i] = frac32(Math.cbrt(primes[i]));
  for (let i = 0; i < 8; i++) H0[i] = frac32(Math.sqrt(primes[i]));
})();

const W = new Uint32Array(64);
const enc = new TextEncoder();

export function sha256Hex(message: string): string {
  const bytes = enc.encode(message);
  const len = bytes.length;
  const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((len * 8) / 4294967296));
  view.setUint32(padded.length - 4, (len * 8) >>> 0);

  let h0 = H0[0], h1 = H0[1], h2 = H0[2], h3 = H0[3], h4 = H0[4], h5 = H0[5], h6 = H0[6], h7 = H0[7];
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
}

let sessionSalt: string | null = null;
function salt(): string {
  if (sessionSalt === null) {
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    sessionSalt = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sessionSalt;
}

const EMPTY = new Set(['', 'null', 'undefined', 'nan', 'none', 'n/a', '-']);

/** Returns a hasher for one parse. Its cache holds raw ids, so drop it when the parse ends. */
export function makeKeyHasher(): (raw: unknown) => string | null {
  const cache = new Map<string, string | null>();
  const s = salt();
  return (raw) => {
    if (raw === null || raw === undefined) return null;
    const norm = String(raw).trim().toLowerCase();
    if (EMPTY.has(norm)) return null;
    let h = cache.get(norm);
    if (h === undefined) {
      h = sha256Hex(`${s}:${norm}`).slice(0, 16);
      cache.set(norm, h);
    }
    return h;
  };
}
