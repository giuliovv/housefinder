import { describe, expect, it } from "vitest";
import { hasFeatures } from "./features";

describe("hasFeatures", () => {
  it("passes when nothing is required", () => expect(hasFeatures(undefined, [])).toBe(true));
  it("needs every selected feature", () => {
    expect(hasFeatures(["garden", "parking"], ["garden"])).toBe(true);
    expect(hasFeatures(["garden", "parking"], ["garden", "lift"])).toBe(false);
  });
  it("treats a home that doesn't mention a feature as not having it", () => {
    expect(hasFeatures(undefined, ["terrace"])).toBe(false);
    expect(hasFeatures([], ["terrace"])).toBe(false);
  });
});
