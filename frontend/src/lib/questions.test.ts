import { describe, expect, it } from "vitest";
import { readyToAnnounce, deckWarmedUp, EMPTY_STATE, gapAfter, nextQuestion, recordAnswered, recordDismissed } from "./questions";

describe("when a question card appears", () => {
  it("never before 8 photo swipes, and not at 7", () => {
    expect(nextQuestion(EMPTY_STATE, 0, {})).toBeNull();
    expect(nextQuestion(EMPTY_STATE, 7, {})).toBeNull();
    expect(nextQuestion(EMPTY_STATE, gapAfter(0), {})).toBe("bedrooms");
  });
  it("is spaced 8-10 swipes apart", () => {
    for (let last = 0; last < 60; last++) expect([8, 9, 10]).toContain(gapAfter(last));
  });
  it("returns to photos right after an answer, then asks the next one later", () => {
    let s = recordAnswered(EMPTY_STATE, "bedrooms", 8);
    expect(nextQuestion(s, 8, {})).toBeNull();
    expect(nextQuestion(s, 8 + gapAfter(8) - 1, {})).toBeNull();
    expect(nextQuestion(s, 8 + gapAfter(8), {})).toBe("budget");
    s = recordAnswered(s, "budget", 17);
    expect(nextQuestion(s, 17 + gapAfter(17), {})).toBe("location");
    s = recordAnswered(s, "location", 27);
    expect(nextQuestion(s, 200, {})).toBeNull(); // all answered: never again
  });
  it("does not ask what the person already set in Browse", () => {
    expect(nextQuestion(EMPTY_STATE, 8, { bedrooms: true })).toBe("budget");
    expect(nextQuestion(EMPTY_STATE, 8, { bedrooms: true, budget: true, location: true })).toBeNull();
  });
});

describe("skipping", () => {
  it("one skip switches every question off for good", () => {
    const s = recordDismissed(EMPTY_STATE, 8);
    expect(s.dismissed).toBe(true);
    expect(nextQuestion(s, 8, {})).toBeNull();
    expect(nextQuestion(s, 5000, {})).toBeNull();
  });
  it("also holds after an earlier answer", () => {
    let s = recordAnswered(EMPTY_STATE, "bedrooms", 8);
    s = recordDismissed(s, 17);
    expect(nextQuestion(s, 400, {})).toBeNull();
  });
});

describe("start over", () => {
  it("resets the pacing when the swipe count drops below the marker", () => {
    const s = { ...recordAnswered(EMPTY_STATE, "location", 80), lastAt: 80 };
    expect(nextQuestion(s, 3, {})).toBeNull();
    expect(nextQuestion(s, 8, {})).toBe("bedrooms");
  });
});

describe("never the first thing on the deck", () => {
  it("needs a few photo swipes in this visit, however many were swiped before", () => {
    expect(deckWarmedUp(null, 50)).toBe(false); // deck not shown yet
    expect(deckWarmedUp(50, 50)).toBe(false);
    expect(deckWarmedUp(50, 52)).toBe(false);
    expect(deckWarmedUp(50, 53)).toBe(true);
  });
});

describe("the ready-for-Browse nudge", () => {
  it("is announced once at 'good' and once at 'strong', never before", () => {
    expect(readyToAnnounce(null, 0)).toBeNull();
    expect(readyToAnnounce(1, 0)).toBeNull();
    expect(readyToAnnounce(2, 0)).toBe(2);
    expect(readyToAnnounce(2, 2)).toBeNull();
    expect(readyToAnnounce(3, 2)).toBe(3);
    expect(readyToAnnounce(3, 3)).toBeNull();
    expect(readyToAnnounce(2, 3)).toBeNull(); // dipping back down never repeats it
  });
});
