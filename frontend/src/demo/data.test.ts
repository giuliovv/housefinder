import { expect, it } from "vitest";
import { DEMO_MATCH_ID, demoHomes, demoMatchScore, demoStyleHomes } from "./data";

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
