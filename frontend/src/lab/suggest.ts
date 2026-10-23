import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";

export const dot = (a: Float32Array, b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Farthest-point sampling: each next home is the one least like those already chosen, so a batch shows real variety. */
export function diverse(pool: Listing[], vecs: Map<string, Float32Array>, n: number, seed: number): Listing[] {
  const usable = pool.filter((l) => vecs.has(listingKey(l)));
  if (usable.length <= n) return usable;
  const start = usable[(seed * 7919) % usable.length];
  const chosen = [start];
  const best = usable.map((l) => dot(vecs.get(listingKey(l))!, vecs.get(listingKey(start))!));
  while (chosen.length < n) {
    let at = -1;
    let low = Infinity;
    best.forEach((b, i) => {
      if (b < low && !chosen.includes(usable[i])) {
        low = b;
        at = i;
      }
    });
    chosen.push(usable[at]);
    const v = vecs.get(listingKey(usable[at]))!;
    usable.forEach((l, i) => (best[i] = Math.max(best[i], dot(vecs.get(listingKey(l))!, v))));
  }
  return chosen;
}

/** Until a taste exists the best use of each card is to find out something, so cold-start suggestions are spread wide; after that they are the best matches. */
export const EXPLORE_UNTIL = 6;
