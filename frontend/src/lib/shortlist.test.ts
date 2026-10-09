import { describe, expect, it } from "vitest";
import { boardIdFromSearch, cleanName, docId, randomId, shareUrl, sortBoard, whatsappLink, type BoardItem } from "./shortlist";

const item = (key: string, ...names: string[]): BoardItem => ({
  key,
  snap: { address: "", price: "", thumb: "", url: "" },
  savers: Object.fromEntries(names.map((n, i) => [`id${i}`, n])),
});

describe("board links", () => {
  it("round-trips a board id through the share url", () => {
    const id = randomId();
    expect(id).toHaveLength(40);
    const url = shareUrl("https://example.com", id);
    expect(boardIdFromSearch(new URL(url).search)).toBe(id);
  });
  it("ignores malformed board ids", () => {
    expect(boardIdFromSearch("?board=short")).toBeNull();
    expect(boardIdFromSearch("?board=../../etc")).toBeNull();
    expect(boardIdFromSearch("")).toBeNull();
  });
  it("builds a whatsapp link carrying the share url", () => {
    const link = whatsappLink("https://x.test/?board=abc", "Giulio");
    expect(link.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("https://x.test/?board=abc");
    expect(decodeURIComponent(link)).toContain("Giulio is");
  });
});

describe("board contents", () => {
  it("lists homes saved by more people first and hides ones nobody has saved", () => {
    const sorted = sortBoard([item("a", "Ann"), item("b", "Ann", "Bo"), item("c"), item("d", "Bo")]);
    expect(sorted.map((i) => i.key)).toEqual(["b", "a", "d"]);
  });
  it("makes document ids and names safe", () => {
    expect(docId("propertyhive:a/b")).toBe("propertyhive:a|b");
    expect(cleanName("  Anna   Maria  ")).toBe("Anna Maria");
    expect(cleanName("x".repeat(80))).toHaveLength(30);
  });
});
