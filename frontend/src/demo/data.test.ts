import { expect, it } from "vitest";
import { DEMO_MATCH_ID, demoGallery, demoHomes, demoMatchScore, demoPriceDrop, demoShareUrl, demoStyleHomes, nextDemoStyleHome, orderDemoBrowse, readDemoShare, shouldOfferDemoMatch } from "./data";

it("maps 20 fictional homes onto five generated sheets", () => {
  expect(demoHomes).toHaveLength(20);
  expect(demoHomes.map((home) => home.sheet).sort()).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]);
  expect(demoHomes.filter((home) => home.sheet === 5).map((home) => home.tile).sort()).toEqual([0, 1, 2, 3]);
  expect(demoHomes.slice(-4).every((home) => home.sheet === 5)).toBe(true);
  expect(demoStyleHomes[1].sheet).toBe(5);
  expect(demoStyleHomes.slice(0, 11).filter((home) => home.sheet === 5)).toHaveLength(4);
  expect(new Set(demoStyleHomes.map((home) => home.id))).toEqual(new Set(demoHomes.map((home) => home.id)));
  expect(demoHomes.some((home) => home.id === DEMO_MATCH_ID && home.sheet !== 5)).toBe(true);
  expect(new Set(demoHomes.map((home) => home.id)).size).toBe(20);
  expect(new Set(demoHomes.map((home) => home.agency)).size).toBeGreaterThan(1);
});

it("ranks homes with a matching fictional style above unrelated ones", () => {
  expect(demoMatchScore(demoHomes[1], [demoHomes[0]])).toBeGreaterThan(demoMatchScore(demoHomes[4], [demoHomes[0]]));
});

it("gives the first two featured homes room galleries without duplicating other listings", () => {
  const match = demoHomes.find((home) => home.id === DEMO_MATCH_ID)!;
  expect(demoGallery(match).map((photo) => photo.room)).toEqual(["Living room", "Bedroom", "Kitchen", "Dining room"]);
  expect(demoGallery(demoHomes[0])).toHaveLength(5);
  expect(demoGallery(demoHomes[2])).toHaveLength(1);
});

it("offers the scripted match once after three Style swipes", () => {
  expect(shouldOfferDemoMatch({ h01: "like", h17: "pass" })).toBe(false);
  expect(shouldOfferDemoMatch({ h01: "like", h17: "pass", h02: "like" })).toBe(true);
  expect(shouldOfferDemoMatch({ h01: "like", h17: "pass", h02: "like", [DEMO_MATCH_ID]: "like" })).toBe(false);
});

it("keeps the upcoming photo beneath each Style swipe, including the match", () => {
  expect(nextDemoStyleHome({}, demoStyleHomes[0])?.id).toBe(demoStyleHomes[1].id);
  expect(nextDemoStyleHome({ h01: "like", h17: "pass" }, demoStyleHomes[2])?.id).toBe(DEMO_MATCH_ID);
  expect(nextDemoStyleHome({ h01: "like", h17: "pass", h02: "like" }, demoHomes.find((home) => home.id === DEMO_MATCH_ID)!)?.id).toBe(demoStyleHomes[3].id);
  expect(nextDemoStyleHome(Object.fromEntries(demoHomes.filter((home) => home.id !== "h20").map((home) => [home.id, "skip"])), demoHomes.find((home) => home.id === "h20")!)).toBeUndefined();
});

it("puts the two complete homes first in filmed Browse and dated rooms last", () => {
  const ordered = orderDemoBrowse([demoHomes[0], demoHomes[1]], "taste", true);
  expect(ordered.slice(0, 2).map((home) => home.id)).toEqual([DEMO_MATCH_ID, "h01"]);
  expect(ordered.slice(0, 2).every((home) => demoGallery(home).length >= 4)).toBe(true);
  expect(ordered.slice(-4).every((home) => home.sheet === 5)).toBe(true);
});

it("shows an exact £100 drop on the matched home", () => {
  const match = demoHomes.find((home) => home.id === DEMO_MATCH_ID)!;
  expect(demoPriceDrop(match)).toBe(100);
});

it("shares only known fictional home IDs and a first name", () => {
  const url = demoShareUrl("https://houseswipe.uk", [DEMO_MATCH_ID, "h01", "unknown"], "Alex");
  expect(readDemoShare(new URL(url).search)).toEqual({ ids: [DEMO_MATCH_ID, "h01"], from: "Alex" });
  expect(readDemoShare("?shared=unknown")).toBeNull();
});
