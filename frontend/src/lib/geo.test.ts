import { describe, expect, it } from "vitest";
import { inAnyShape, pointInPolygon, type LatLon } from "./geo";

const square: LatLon[] = [[51.5, -0.2], [51.5, -0.1], [51.6, -0.1], [51.6, -0.2]];

describe("pointInPolygon", () => {
  it("separates inside from outside", () => {
    expect(pointInPolygon(51.55, -0.15, square)).toBe(true);
    expect(pointInPolygon(51.45, -0.15, square)).toBe(false);
    expect(pointInPolygon(51.55, -0.05, square)).toBe(false);
  });
  it("matches any of several shapes", () => {
    const other: LatLon[] = [[51.3, 0], [51.3, 0.1], [51.4, 0.1], [51.4, 0]];
    expect(inAnyShape(51.35, 0.05, [square, other])).toBe(true);
    expect(inAnyShape(51.35, 0.05, [square])).toBe(false);
    expect(inAnyShape(51.55, -0.15, [])).toBe(false);
  });
});
