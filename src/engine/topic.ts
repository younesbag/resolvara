// Local TF-IDF cosine similarity for the optional same-topic filter. Runs in memory only.

export const TOPIC_THRESHOLD = 0.35;

const STOP = new Set(
  (
    'the a an and or of to in on for is are was were be i my me we you it this that with at by from as ' +
    'do does did have has had can could please hi hello thanks thank'
  ).split(' '),
);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length >= 2 && !STOP.has(w)) out.push(w);
  }
  return out;
}

export type Vec = { terms: Map<string, number>; norm: number };

export class TopicIndex {
  private df = new Map<string, number>();
  private docs = 0;
  private cache = new Map<number, Vec | null>();

  constructor(private texts: (string | null)[]) {
    for (const t of texts) {
      if (!t) continue;
      const toks = tokenize(t);
      if (toks.length === 0) continue;
      this.docs += 1;
      for (const w of new Set(toks)) this.df.set(w, (this.df.get(w) ?? 0) + 1);
    }
  }

  /** Number of conversations that carry usable topic text. */
  get withText(): number {
    return this.docs;
  }

  private vec(i: number): Vec | null {
    if (this.cache.has(i)) return this.cache.get(i) ?? null;
    const t = this.texts[i];
    let v: Vec | null = null;
    if (t) {
      const toks = tokenize(t);
      if (toks.length > 0) {
        const tf = new Map<string, number>();
        for (const w of toks) tf.set(w, (tf.get(w) ?? 0) + 1);
        const terms = new Map<string, number>();
        let sq = 0;
        for (const [w, c] of tf) {
          // Smoothed idf stays positive, so a word found in every document still counts.
          const idf = Math.log((1 + this.docs) / (1 + (this.df.get(w) ?? 0))) + 1;
          const x = c * idf;
          terms.set(w, x);
          sq += x * x;
        }
        v = { terms, norm: Math.sqrt(sq) };
      }
    }
    this.cache.set(i, v);
    return v;
  }

  /** Cosine similarity of two conversations' topic text; 0 when either has none. */
  similarity(i: number, j: number): number {
    const a = this.vec(i);
    const b = this.vec(j);
    if (!a || !b || a.norm === 0 || b.norm === 0) return 0;
    const [small, big] = a.terms.size <= b.terms.size ? [a, b] : [b, a];
    let dot = 0;
    for (const [w, x] of small.terms) {
      const y = big.terms.get(w);
      if (y !== undefined) dot += x * y;
    }
    return dot / (a.norm * b.norm);
  }
}
