import { describe, expect, it } from "vitest";
import { boardIdFromSearch, boardPeople, joinNames, cleanName, docId, randomId, shareUrl, sortBoard, whatsappLink, type BoardItem } from "./shortlist";

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

describe("people on the board", () => {
  it("lists me first, then everyone else once", () => {
    const items = [item("a", "Ann", "Bo"), item("b", "Bo")]; // ids id0 = Ann/Bo, id1 = Bo
    items[0].savers = { me1: "Giulio", p1: "Ann" };
    items[1].savers = { p1: "Ann", p2: "Bo" };
    expect(boardPeople(items, { id: "me1", name: "Giulio" })).toEqual(["You", "Ann", "Bo"]);
    expect(boardPeople([], { id: "me1", name: "G" })).toEqual(["You"]);
  });
  it("joins names naturally", () => {
    expect(joinNames(["You"])).toBe("You");
    expect(joinNames(["You", "Ann"])).toBe("You & Ann");
    expect(joinNames(["You", "Ann", "Bo"])).toBe("You, Ann & Bo");
  });
});
