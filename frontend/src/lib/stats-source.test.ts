import { describe, expect, it } from "vitest";
import { cleanTag, parseSource } from "./stats";

describe("campaign source tags", () => {
  it("reads utm_source and utm_campaign", () => {
    expect(parseSource("?utm_source=tiktok&utm_medium=paid&utm_campaign=demo1")).toEqual({ s: "tiktok", c: "demo1" });
    expect(parseSource("?utm_source=Instagram")).toEqual({ s: "instagram", c: "" });
  });
  it("understands Instagram's own link-in-bio tags", () => {
    expect(parseSource("?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=PAZXh0bgNhZW0C")).toEqual({ s: "instagram", c: "link_in_bio" });
    expect(parseSource("?utm_source=ig&utm_campaign=demo1&utm_content=link_in_bio")).toEqual({ s: "instagram", c: "demo1" });
    expect(parseSource("?utm_source=tt")).toEqual({ s: "tiktok", c: "" });
  });
  it("ignores links without a source", () => {
    expect(parseSource("")).toBeNull();
    expect(parseSource("?board=abc&utm_campaign=x")).toBeNull();
  });
  it("keeps tags short and safe", () => {
    expect(cleanTag("Tik Tok!/../x")).toBe("tiktokx");
    expect(cleanTag("a".repeat(60))).toHaveLength(24);
    expect(cleanTag(null)).toBe("");
  });
});
