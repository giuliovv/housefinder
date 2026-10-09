/**
 * "How well do we know your taste?" — a meter driven by what we actually have:
 * how many photos were liked and passed on, and how clearly the likes differ
 * from the passes.
 *
 * Calibrated on simulated users (real listing photos, latent tastes of varying
 * breadth, 0-8% mis-taps): the rank agreement between the profile built from
 * the swipes so far and the user's true taste was regressed on ln(1+likes),
 * ln(1+dislikes) and the separation between the like and dislike centroids.
 * Held-out R² was only ~0.25, because how broad someone's taste is can't be
 * observed — so this is deliberately a *progress* meter with plain-language
 * levels, not a percentage of accuracy. Two cheaper ideas were tried and
 * rejected: the stability of the ranking under dropped swipes (reads
 * "confident" after 4 swipes when real agreement is ~0.35) and the cohesion of
 * the likes (adds nothing beyond counts).
 *
 * Predicted agreement by swipe count for a typical user: ~0.38 at 5 swipes,
 * 0.50 at 20, 0.59 at 40, 0.70 at 80 — hence the level cut-offs below.
 */

export type TasteLevel = 0 | 1 | 2 | 3;

export interface TasteRead {
  /** 0..1, for the bar */
  score: number;
  level: TasteLevel;
  label: string;
  hint: string;
  likes: number;
  dislikes: number;
}

const COEF = { intercept: -0.003, likes: 0.103, dislikes: 0.079, separation: 0.342 };
const LEVEL_MIN = [0, 0.42, 0.52, 0.62] as const;
const LABELS = [
  "Just getting started",
  "Getting a feel for your taste",
  "A good read on your taste",
  "A strong read on your taste",
] as const;
const BAR_FROM = 0.3;
const BAR_TO = 0.72;
const MIN_LIKES_FOR_ANYTHING = 3;
/** Likes alone look "clear" (the likes centroid is far from nothing), which is not a read of taste: a good or strong
 * read needs some passes too. */
const MIN_DISLIKES_FOR_GOOD = 3;

function meanVector(vectors: ArrayLike<number>[]): Float32Array {
  const out = new Float32Array(vectors[0].length);
  for (const v of vectors) for (let i = 0; i < out.length; i++) out[i] += v[i];
  for (let i = 0; i < out.length; i++) out[i] /= vectors.length;
  return out;
}

/** predicted rank agreement with the user's true taste, ~0..0.8 */
export function predictedAgreement(likes: number, dislikes: number, separation: number): number {
  return (
    COEF.intercept +
    COEF.likes * Math.log1p(likes) +
    COEF.dislikes * Math.log1p(dislikes) +
    COEF.separation * separation
  );
}

function hintFor(level: TasteLevel, likes: number, dislikes: number): string {
  if (likes === 0) return "Tap ♥ on interiors you'd happily live in.";
  if (likes < MIN_LIKES_FOR_ANYTHING) return `Like at least ${MIN_LIKES_FOR_ANYTHING} photos so we have something to go on.`;
  if (dislikes < MIN_DISLIKES_FOR_GOOD && likes + dislikes >= 6) return "Pass on a few too — knowing what you don't like helps a lot.";
  if (level === 0) return "Keep going — every swipe sharpens your matches.";
  if (level === 1) return "A few more likes and passes will sharpen your matches.";
  if (level === 2) return "Your matches are shaping up. A few more swipes will fine-tune them.";
  return "We have a solid read. Rate photos while you browse to keep refining it.";
}

/** vectors are unit-length photo embeddings; returns null before the first like */
export function computeTasteRead(liked: ArrayLike<number>[], disliked: ArrayLike<number>[]): TasteRead | null {
  if (liked.length === 0) return null;
  const likeMean = meanVector(liked);
  const diff = new Float32Array(likeMean.length);
  const disMean = disliked.length > 0 ? meanVector(disliked) : null;
  let sepSq = 0;
  for (let i = 0; i < diff.length; i++) {
    diff[i] = likeMean[i] - (disMean ? disMean[i] : 0);
    sepSq += diff[i] * diff[i];
  }
  const predicted = predictedAgreement(liked.length, disliked.length, Math.sqrt(sepSq));

  let level: TasteLevel = 0;
  for (let l = 1; l < LEVEL_MIN.length; l++) if (predicted >= LEVEL_MIN[l]) level = l as TasteLevel;
  if (liked.length < MIN_LIKES_FOR_ANYTHING) level = 0; // too little to say anything, whatever the separation
  let score = Math.max(0, Math.min(1, (predicted - BAR_FROM) / (BAR_TO - BAR_FROM)));
  if (disliked.length < MIN_DISLIKES_FOR_GOOD) {
    level = Math.min(level, 1) as TasteLevel;
    score = Math.min(score, (LEVEL_MIN[2] - BAR_FROM) / (BAR_TO - BAR_FROM) - 0.02); // the bar stops short of "good"
  }
  return { score, level, label: LABELS[level], hint: hintFor(level, liked.length, disliked.length), likes: liked.length, dislikes: disliked.length };
}
