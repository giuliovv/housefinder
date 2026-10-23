import { describe, expect, it } from "vitest";
import { staleLabelDays } from "./staleness";

describe("staleLabelDays", () => {
  it("waits through the three-day retry window", () => {
    expect(staleLabelDays("2026-10-20", "2026-10-23")).toBeNull();
    expect(staleLabelDays("2026-10-19", "2026-10-23")).toBe(4);
  });

  it("does not warn without a valid check date", () => {
    expect(staleLabelDays(undefined, "2026-10-23")).toBeNull();
    expect(staleLabelDays("invalid", "2026-10-23")).toBeNull();
  });
});
