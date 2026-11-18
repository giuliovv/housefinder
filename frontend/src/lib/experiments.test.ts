import { beforeEach, describe, expect, it, vi } from "vitest";
import { welcomeArm } from "./experiments";

describe("welcomeArm", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
  });
  it("splits new browsers by the random draw and keeps the arm", () => {
    expect(welcomeArm(false, () => 0.2)).toBe("on");
    expect(welcomeArm(false, () => 0.9)).toBe("on");
    data.clear();
    expect(welcomeArm(false, () => 0.9)).toBe("off");
    expect(welcomeArm(false, () => 0.1)).toBe("off");
  });
  it("leaves known browsers out", () => {
    expect(welcomeArm(true, () => 0.1)).toBe("legacy");
  });
});
