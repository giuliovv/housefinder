/** All in-browser: preference-vector math over CLIP embeddings. No backend —
 * a user's swipes never leave their device at this stage. */

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function mean(vectors: number[][]): number[] {
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

/**
 * Preference vector = centroid(liked) - centroid(disliked), the standard
 * simple baseline for this (no training needed, just averaging in
 * embedding space — CLIP does the semantic heavy lifting). Returns null
 * until there's at least one like, since "the average of nothing" isn't a
 * meaningful preference.
 */
export function computePreferenceVector(
  liked: number[][],
  disliked: number[][],
): number[] | null {
  if (liked.length === 0) return null;
  const likedCentroid = mean(liked);
  if (disliked.length === 0) return likedCentroid;
  const dislikedCentroid = mean(disliked);
  return likedCentroid.map((v, i) => v - dislikedCentroid[i]);
}

/** A listing's match score is the best (max) similarity across its own
 * photos — "this flat has at least one room that matches your taste" is a
 * more useful signal for a rental search than the average, which would
 * punish an otherwise-great flat for one mediocre bathroom photo. */
export function listingMatchScore(preference: number[], photoEmbeddings: number[][]): number {
  return Math.max(...photoEmbeddings.map((p) => cosineSimilarity(preference, p)));
}

/** Describes a preference vector in words: cosine-similarity it against a
 * fixed vocabulary of style phrases (same CLIP text space) and return the
 * closest few labels. Turns an opaque 512-dim vector into "Bright &
 * light-filled, Period features, Wooden flooring" — no separate classifier,
 * just the same embedding-space trick the whole match-score mechanic
 * already relies on. */
export function topStyleLabels(
  preference: number[],
  labels: { label: string; embedding: number[] }[],
  topN = 3,
): string[] {
  return labels
    .map((l) => ({ label: l.label, score: cosineSimilarity(preference, l.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((l) => l.label);
}
