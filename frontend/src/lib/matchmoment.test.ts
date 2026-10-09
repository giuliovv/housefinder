import { describe, expect, it } from "vitest";
import { CHANCE, MIN_GAP, MIN_SWIPES, pickMatch, shouldOffer, type Candidate } from "./matchmoment";

const fresh = { shown: [], lastAt: 0 };

describe("shouldOffer", () => {
  it("needs a real read first: enough swipes, some dislikes, a level", () => {
    expect(shouldOffer(fresh, MIN_SWIPES - 1, 5, 2, () => 0)).toBe(false);
    expect(shouldOffer(fresh, 30, 2, 2, () => 0)).toBe(false); // likes alone: scores aren't trustworthy
    expect(shouldOffer(fresh, 30, 5, 0, () => 0)).toBe(false);
    expect(shouldOffer(fresh, 30, 5, 1, () => 0)).toBe(true);
  });
  it("is random, not on a schedule", () => {
    expect(shouldOffer(fresh, 30, 5, 2, () => CHANCE - 0.001)).toBe(true);
    expect(shouldOffer(fresh, 30, 5, 2, () => CHANCE + 0.001)).toBe(false);
  });
  it("keeps a gap after the last one, and survives a start-over", () => {
    expect(shouldOffer({ shown: [], lastAt: 25 }, 25 + MIN_GAP - 1, 5, 2, () => 0)).toBe(false);
    expect(shouldOffer({ shown: [], lastAt: 25 }, 25 + MIN_GAP, 5, 2, () => 0)).toBe(true);
    expect(shouldOffer({ shown: [], lastAt: 90 }, 20, 5, 2, () => 0)).toBe(true); // count was reset below the marker
  });
});

const make = (n: number): Candidate[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, score: 1 - i / n, price: 2000 + (i % 5) * 100 }));

describe("pickMatch", () => {
  const all = make(100).map((c) => c.score);
  it("only picks from the top 5% overall", () => {
    const keys = new Set<string>();
    for (let r = 0; r < 40; r++) keys.add(pickMatch(make(100), all, new Set(), () => r / 40)!);
    for (const k of keys) expect(Number(k.slice(1))).toBeLessThan(5);
  });
  it("respects what the filters show: candidates outside the top 5% give nothing", () => {
    expect(pickMatch(make(100).slice(20), all, new Set())).toBeNull();
  });
  it("skips homes already offered or saved, and wildly expensive outliers", () => {
    const c = make(100);
    expect(pickMatch(c, all, new Set(["k0", "k1", "k2", "k3", "k4"]))).toBeNull();
    c[0].price = 40000;
    for (let r = 0; r < 20; r++) expect(pickMatch(c, all, new Set(), () => r / 20)).not.toBe("k0");
  });
  it("needs a price", () => {
    expect(pickMatch(make(100).map((c) => ({ ...c, price: null })), all, new Set())).toBeNull();
  });
});
