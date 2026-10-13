import { describe, expect, it } from "vitest";
import type { Listing } from "../types";
import { newKeys, newestDay, startVisit, type VisitStore } from "./newsince";

const mem = (): VisitStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, get: (k) => data[k] ?? null, set: (k, v) => void (data[k] = v) };
};
const l = (id: string, first_seen?: string) => ({ summary: { platform: "p", source_id: id }, first_seen }) as unknown as Listing;
const key = (x: Listing) => `${x.summary.platform}:${x.summary.source_id}`;

describe("newestDay / newKeys", () => {
  const listings = [l("a", "2026-10-10"), l("b", "2026-10-12"), l("c", "2026-10-13"), l("d")];
  it("finds the newest day", () => expect(newestDay(listings)).toBe("2026-10-13"));
  it("marks homes first seen after the previous visit", () => {
    expect([...newKeys(listings, "2026-10-12", key)]).toEqual(["p:c"]);
    expect([...newKeys(listings, "2026-10-09", key)].sort()).toEqual(["p:a", "p:b", "p:c"]);
  });
  it("marks nothing without a previous visit", () => expect(newKeys(listings, null, key).size).toBe(0));
});

describe("startVisit", () => {
  it("first visit: nothing is new, today's data is remembered", () => {
    const local = mem();
    const session = mem();
    expect(startVisit("2026-10-13", local, session)).toBeNull();
    expect(local.data["housefinder:last-seen:v1"]).toBe("2026-10-13");
  });
  it("next visit compares with the previous one and moves the marker on", () => {
    const local = mem();
    local.data["housefinder:last-seen:v1"] = "2026-10-11";
    expect(startVisit("2026-10-13", local, mem())).toBe("2026-10-11");
    expect(local.data["housefinder:last-seen:v1"]).toBe("2026-10-13");
  });
  it("a reload in the same session keeps the same comparison day", () => {
    const local = mem();
    const session = mem();
    local.data["housefinder:last-seen:v1"] = "2026-10-11";
    startVisit("2026-10-13", local, session);
    expect(startVisit("2026-10-13", local, session)).toBe("2026-10-11"); // not 2026-10-13: the chip survives a refresh
  });
  it("never moves the marker backwards", () => {
    const local = mem();
    local.data["housefinder:last-seen:v1"] = "2026-10-14";
    startVisit("2026-10-13", local, mem());
    expect(local.data["housefinder:last-seen:v1"]).toBe("2026-10-14");
  });
});
