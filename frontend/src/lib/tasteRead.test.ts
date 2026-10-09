import { describe, expect, it } from "vitest";
import { computeTasteRead, predictedAgreement } from "./tasteRead";

const DIM = 8;
function unit(...xs: number[]): Float32Array {
  const v = new Float32Array(DIM);
  xs.forEach((x, i) => (v[i] = x));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}
// Real like/pass centroids are close together (separation ~0.25-0.5 on unit
// vectors), nothing like orthogonal ones — pick vectors 0.3 apart.
const A = unit(1, 0);
const B = unit(Math.cos(0.3), Math.sin(0.3));
const many = (v: Float32Array, n: number) => Array.from({ length: n }, () => v);

describe("computeTasteRead", () => {
  it("says nothing before the first like", () => {
    expect(computeTasteRead([], many(B, 5))).toBeNull();
  });

  it("asks for more likes while there are fewer than three, however clear they look", () => {
    const r = computeTasteRead(many(A, 2), many(B, 30))!;
    expect(r.level).toBe(0);
    expect(r.hint).toMatch(/at least 3/);
  });

  it("only ever goes up as swipes are added", () => {
    const scores = [4, 10, 20, 40, 80].map((n) => computeTasteRead(many(A, Math.ceil(n * 0.3)), many(B, Math.floor(n * 0.7)))!.score);
    for (let i = 1; i < scores.length; i++) expect(scores[i]).toBeGreaterThanOrEqual(scores[i - 1]);
    expect(scores[0]).toBeLessThan(0.3);
    expect(scores[4]).toBeGreaterThan(0.8);
  });

  it("passes through the four levels on a typical swipe history", () => {
    const levels = [5, 20, 40, 80].map((n) => computeTasteRead(many(A, Math.ceil(n * 0.3)), many(B, Math.floor(n * 0.7)))!.level);
    expect(levels[0]).toBe(0);
    expect(levels[3]).toBe(3);
    expect(new Set(levels).size).toBeGreaterThanOrEqual(3);
  });

  it("nudges to pass on a few photos when only likes exist", () => {
    expect(computeTasteRead(many(A, 8), [])!.hint).toMatch(/Pass on a few/);
  });

  it("scores stay within 0..1 and the model is monotone in its inputs", () => {
    const r = computeTasteRead(many(A, 500), many(B, 500))!;
    expect(r.score).toBeLessThanOrEqual(1);
    expect(predictedAgreement(10, 10, 0.3)).toBeGreaterThan(predictedAgreement(5, 10, 0.3));
    expect(predictedAgreement(10, 10, 0.4)).toBeGreaterThan(predictedAgreement(10, 10, 0.2));
  });
});
