import { describe, expect, it } from "vitest";
import { chartGeometry, gbp, latestDrop, shortDay } from "./priceHistory";

describe("latestDrop", () => {
  it("reports a drop with its amount", () => {
    expect(latestDrop([["2026-10-09", 2950], ["2026-10-13", 2850]])).toEqual({ from: 2950, to: 2850, amount: 100, day: "2026-10-13" });
  });
  it("is null for a rise, a single price, or nothing", () => {
    expect(latestDrop([["2026-10-09", 1150], ["2026-10-13", 1400]])).toBeNull();
    expect(latestDrop([["2026-10-09", 1150]])).toBeNull();
    expect(latestDrop(undefined)).toBeNull();
  });
  it("looks only at the latest move", () => {
    expect(latestDrop([["2026-10-01", 3000], ["2026-10-05", 2800], ["2026-10-09", 2900]])).toBeNull();
  });
});

describe("formatting", () => {
  it("formats money and days", () => {
    expect(gbp(2850)).toBe("£2,850");
    expect(shortDay("2026-10-09")).toBe("9 Oct");
  });
});

describe("chartGeometry", () => {
  const box = { x0: 10, x1: 290, yTop: 20, yBottom: 50 };
  it("puts the higher price higher up and later days further right", () => {
    const g = chartGeometry([["2026-10-09", 2950], ["2026-10-13", 2850]], "2026-10-14", box);
    expect(g.points[0].y).toBeLessThan(g.points[1].y); // 2950 is drawn above 2850
    expect(g.points[0].x).toBe(10);
    expect(g.points[1].x).toBeGreaterThan(g.points[0].x);
    expect(g.points[1].x).toBeLessThan(g.endX);
    for (const p of g.points) {
      expect(p.y).toBeGreaterThanOrEqual(20);
      expect(p.y).toBeLessThanOrEqual(50);
    }
  });
});
