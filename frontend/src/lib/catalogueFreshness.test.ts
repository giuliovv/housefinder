import { describe, expect, it } from "vitest";
import { catalogueAge } from "./catalogueFreshness";

describe("catalogueAge", () => {
  const now = Date.parse("2026-10-23T12:00:00Z");
  it("reports minute precision only from a real timestamp", () => {
    expect(catalogueAge("2026-10-23T11:38:00Z", now)).toEqual({ label: "Catalogue updated 22 min ago", stale: false });
  });
  it("turns stale after six hours", () => {
    expect(catalogueAge("2026-10-23T05:59:00Z", now)).toEqual({ label: "Catalogue updated 6 h ago", stale: true });
  });
  it("does not invent freshness without metadata", () => {
    expect(catalogueAge(null, now)).toEqual({ label: "Catalogue check time unavailable", stale: true });
  });
});
