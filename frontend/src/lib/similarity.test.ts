import { describe, expect, it } from "vitest";
import { computeCenteredPreference, cosineSimilarity } from "./similarity";

const mean = [0.9, 0, 0, 0]; // the shared "average interior" part of every photo
const taste = [0, 0.3, 0, 0];
const add = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);

describe("computeCenteredPreference", () => {
  it("returns null until something is liked", () => {
    expect(computeCenteredPreference([], [add(mean, taste)], mean)).toBeNull();
  });
  it("with likes only, keeps the taste direction and drops the shared component", () => {
    const pref = computeCenteredPreference([add(mean, taste), add(mean, taste)], [], mean)!;
    expect(cosineSimilarity(pref, taste)).toBeCloseTo(1, 5);
    expect(Math.abs(pref[0])).toBeLessThan(1e-6);
  });
  it("counts dislikes at half weight", () => {
    const pref = computeCenteredPreference([add(mean, taste)], [sub(mean, taste)], mean)!;
    expect(pref[1]).toBeCloseTo(0.3 * 1.5, 5); // taste - 0.5 * (-taste)
  });
  it("gives the same direction whether or not dislikes exist, so early and late scores stay comparable", () => {
    const likesOnly = computeCenteredPreference([add(mean, taste)], [], mean)!;
    const both = computeCenteredPreference([add(mean, taste)], [sub(mean, taste)], mean)!;
    expect(cosineSimilarity(likesOnly, both)).toBeCloseTo(1, 5);
  });
});
