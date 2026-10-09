/** All in-browser: preference-vector math over CLIP embeddings. No backend —
 * a user's swipes never leave their device at this stage. */

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
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

function meanOf(vectors: ArrayLike<number>[]): Float32Array {
  const dim = vectors[0].length;
  const out = new Float32Array(dim);
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
  liked: ArrayLike<number>[],
  disliked: ArrayLike<number>[],
): Float32Array | null {
  if (liked.length === 0) return null;
  const likedCentroid = meanOf(liked);
  if (disliked.length === 0) return likedCentroid;
  const dislikedCentroid = meanOf(disliked);
  return likedCentroid.map((v, i) => v - dislikedCentroid[i]);
}

/** How much the dislikes count against the likes. Textbook Rocchio weights negatives well below positives; 0.5 won
 * the simulated-user comparison (see PLAN.md) once embeddings are centred. */
export const DISLIKE_WEIGHT = 0.5;

/**
 * The direction used to rank listings: Rocchio feedback in *centred* space. CLIP photo vectors all share a large
 * common component (the "average interior photo"); left in, it makes scores read ~90% while only likes exist and
 * collapse once dislikes arrive, and it swamps the taste signal. Subtracting the mean vector of the catalogue
 * first (as in "All-but-the-Top", Mu & Viswanath 2018) makes scores comparable at every swipe count and ranks
 * better, most of all with few swipes. `mean` is the mean of all listing photo vectors.
 */
export function computeCenteredPreference(
  liked: ArrayLike<number>[],
  disliked: ArrayLike<number>[],
  mean: ArrayLike<number>,
  dislikeWeight = DISLIKE_WEIGHT,
): Float32Array | null {
  if (liked.length === 0) return null;
  const likedCentroid = meanOf(liked);
  const dislikedCentroid = disliked.length > 0 ? meanOf(disliked) : null;
  // mean(liked - mu) - w * mean(disliked - mu), written without materialising the centred vectors
  return likedCentroid.map(
    (v, i) =>
      v - mean[i] - (dislikedCentroid ? dislikeWeight * (dislikedCentroid[i] - mean[i]) : 0),
  );
}

/* A listing's match score is the best (max) cosine similarity across its own
 * photos — "this flat has at least one room that matches your taste" is a more
 * useful signal for a rental search than the average, which would punish an
 * otherwise-great flat for one mediocre bathroom photo. It is computed over the
 * packed int8 matrix in embeddingStore.ts (scoreListings), not here. */

/** Describes a preference vector in words: cosine-similarity it against a
 * fixed vocabulary of style phrases (same CLIP text space) and return the
 * closest few labels. Turns an opaque 512-dim vector into "Bright &
 * light-filled, Period features, Wooden flooring" — no separate classifier,
 * just the same embedding-space trick the whole match-score mechanic
 * already relies on. */
export function topStyleLabels(
  preference: ArrayLike<number>,
  labels: { label: string; embedding: number[] }[],
  topN = 3,
): string[] {
  return labels
    .map((l) => ({ label: l.label, score: cosineSimilarity(preference, l.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((l) => l.label);
}
