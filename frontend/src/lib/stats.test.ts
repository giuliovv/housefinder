import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bump, setUsageStatsEnabled, trackMilestone, trackVisit, usageStatsEnabled } from "./stats";

describe("usage statistics choice", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };

  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", storage);
    vi.stubGlobal("window", { location: { search: "", hostname: "houseswipe.uk" } });
    vi.stubGlobal("navigator", { doNotTrack: "0" });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("clears existing milestone state and stops local and remote counters", async () => {
    data.set("housefinder:stats:v1", '{"seen":{"m_saved":true}}');
    setUsageStatsEnabled(false);
    expect(usageStatsEnabled()).toBe(false);
    expect(data.has("housefinder:stats:v1")).toBe(false);

    trackVisit();
    trackMilestone("m_saved");
    await bump(["visitors"]);
    expect(data.has("housefinder:stats:v1")).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows the choice to be changed later", () => {
    setUsageStatsEnabled(false);
    setUsageStatsEnabled(true);
    expect(usageStatsEnabled()).toBe(true);
  });

  it("respects Do Not Track", () => {
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    expect(usageStatsEnabled()).toBe(false);
    trackVisit();
    expect(data.has("housefinder:stats:v1")).toBe(false);
  });
});
