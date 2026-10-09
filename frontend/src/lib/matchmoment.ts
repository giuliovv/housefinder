/**
 * "It's a match!" moments: now and then the next swipe photo is a real, available home we expect the person to love.
 * It looks exactly like any other photo (they can't know), so a swipe right is a genuine reaction and a swipe left
 * is just a normal pass that also teaches us the prediction was off. Only the rare, good ones: a high match, inside
 * their Browse filters, at a sane price.
 */
import { readJson, writeJson } from "./shortlist";

export interface MatchState {
  /** listing keys already offered, never offered again */
  shown: string[];
  /** swipe total when the last one was offered */
  lastAt: number;
}

const KEY = "housefinder:matches:v1";
export const MIN_SWIPES = 15; // enough of a read to predict from
export const MIN_DISLIKES = 3; // likes alone give inflated, undiscriminating scores
export const MIN_LEVEL = 1; // taste read at least "getting a feel"
export const MIN_GAP = 12; // swipes between moments
export const CHANCE = 0.12; // per swipe once allowed: random, so they can't be predicted
export const TOP_FRACTION = 0.05; // only listings in the top 5% of all matches qualify
export const POOL = 8; // pick at random among the best few, for variety
export const PRICE_CAP_OF_MEDIAN = 1.5; // never a wildly expensive outlier

export function loadMatchState(): MatchState {
  return { shown: [], lastAt: 0, ...readJson<Partial<MatchState>>(KEY, {}) };
}

export function saveMatchState(state: MatchState): void {
  writeJson(KEY, state);
}

/** a dice roll after a swipe: should the next card be a match moment? */
export function shouldOffer(
  state: MatchState,
  swipeTotal: number,
  dislikes: number,
  level: number,
  rand: () => number = Math.random,
): boolean {
  const lastAt = state.lastAt > swipeTotal ? 0 : state.lastAt; // "start over" resets the count
  if (swipeTotal < MIN_SWIPES || dislikes < MIN_DISLIKES || level < MIN_LEVEL) return false;
  if (swipeTotal - lastAt < MIN_GAP) return false;
  return rand() < CHANCE;
}

export interface Candidate {
  key: string;
  score: number;
  price: number | null;
}

/**
 * `candidates` are the homes the person's Browse filters currently show; `allScores` are the match scores of every
 * browseable home (to know what "top 5%" means overall, not just within the filters).
 */
export function pickMatch(
  candidates: Candidate[],
  allScores: number[],
  excluded: ReadonlySet<string>,
  rand: () => number = Math.random,
): string | null {
  if (allScores.length === 0 || candidates.length === 0) return null;
  const sorted = [...allScores].sort((a, b) => b - a);
  const threshold = sorted[Math.max(0, Math.ceil(sorted.length * TOP_FRACTION) - 1)];
  const prices = candidates.map((c) => c.price).filter((p): p is number => p !== null).sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const median = prices[Math.floor(prices.length / 2)];
  const good = candidates
    .filter((c) => c.score >= threshold && c.price !== null && c.price <= median * PRICE_CAP_OF_MEDIAN && !excluded.has(c.key))
    .sort((a, b) => b.score - a.score)
    .slice(0, POOL);
  return good.length === 0 ? null : good[Math.floor(rand() * good.length)].key;
}
