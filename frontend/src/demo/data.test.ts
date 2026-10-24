import { expect, it } from "vitest";
import { demoHomes, demoMatchScore } from "./data";

it("maps 16 fictional homes onto four generated sheets", () => {
  expect(demoHomes).toHaveLength(16);
  expect(demoHomes.map((home) => home.sheet)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]);
  expect(demoHomes.map((home) => home.tile)).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3]);
  expect(new Set(demoHomes.map((home) => home.agency)).size).toBeGreaterThan(1);
});

it("ranks homes with a matching fictional style above unrelated ones", () => {
  expect(demoMatchScore(demoHomes[1], [demoHomes[0]])).toBeGreaterThan(demoMatchScore(demoHomes[4], [demoHomes[0]]));
});
