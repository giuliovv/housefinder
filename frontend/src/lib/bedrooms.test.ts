import { describe, expect, it } from "vitest";
import { matchesBedrooms, reconcileBedrooms } from "./bedrooms";

describe("matchesBedrooms", () => {
  it("applies a minimum and a maximum", () => {
    expect(matchesBedrooms(2, "2", "3")).toBe(true);
    expect(matchesBedrooms(1, "2", "3")).toBe(false);
    expect(matchesBedrooms(4, "2", "3")).toBe(false);
    expect(matchesBedrooms(0, "any", "1")).toBe(true); // a studio is under any maximum
    expect(matchesBedrooms(7, "any", "any")).toBe(true);
  });
  it("hides unknown counts only when a minimum asks for at least N", () => {
    expect(matchesBedrooms(null, "2", "any")).toBe(false);
    expect(matchesBedrooms(null, "any", "2")).toBe(true);
    expect(matchesBedrooms(null, "any", "any")).toBe(true);
  });
});

describe("reconcileBedrooms", () => {
  it("drags the other bound along instead of leaving an impossible range", () => {
    expect(reconcileBedrooms("3", "2", "max")).toEqual({ min: "2", max: "2" });
    expect(reconcileBedrooms("3", "2", "min")).toEqual({ min: "3", max: "3" });
    expect(reconcileBedrooms("1", "3", "min")).toEqual({ min: "1", max: "3" });
    expect(reconcileBedrooms("any", "2", "min")).toEqual({ min: "any", max: "2" });
  });
});
