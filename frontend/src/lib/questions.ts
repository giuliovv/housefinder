/**
 * Practical-requirement questions that appear now and then between photo swipes.
 * Photo swipes never answer them (they only train the taste model); an answer simply sets the
 * existing Browse filters, so there is one filter system and the person can change it later there.
 */
import { readJson, writeJson } from "./shortlist";

export type QuestionId = "bedrooms" | "budget" | "location";

/** the order they're asked in */
export const QUESTION_ORDER: QuestionId[] = ["bedrooms", "budget", "location"];

export interface QuestionState {
  /** answered ones are never asked again */
  answered: Partial<Record<QuestionId, true>>;
  /** set by the first skip: the person doesn't want these, so none of them ever appear again */
  dismissed: boolean;
  /** swipe total when a question card last appeared (answered or skipped) */
  lastAt: number;
}

export const EMPTY_STATE: QuestionState = { answered: {}, dismissed: false, lastAt: 0 };

const KEY = "housefinder:questions:v1";
/** swipes between question cards: 8, 9 or 10, varying a little so it doesn't feel mechanical */
export function gapAfter(lastAt: number): number {
  return 8 + (lastAt % 3);
}

/**
 * The question to show instead of the next photo, or null. `alreadySet` marks requirements the
 * person has already put into the Browse filters themselves — no need to ask those.
 */
export function nextQuestion(
  state: QuestionState,
  swipeTotal: number,
  alreadySet: Partial<Record<QuestionId, boolean>>,
): QuestionId | null {
  if (state.dismissed) return null;
  // "start over" resets the swipe count below the stored marker; treat that as a fresh start
  const lastAt = state.lastAt > swipeTotal ? 0 : state.lastAt;
  if (swipeTotal - lastAt < gapAfter(lastAt)) return null;
  return (
    QUESTION_ORDER.find((id) => {
      return !state.answered[id] && !alreadySet[id];
    }) ?? null
  );
}

/** A question card is never the first thing on the deck: each time the deck is opened (first visit, reload, back
 * from another tab) at least this many photos must be swiped before one can appear. */
export const MIN_SWIPES_PER_VISIT = 3;

/** `visitStart` is the swipe total when the deck was shown, or null until it has been shown */
export function deckWarmedUp(visitStart: number | null, swipeTotal: number): boolean {
  return visitStart !== null && swipeTotal - visitStart >= MIN_SWIPES_PER_VISIT;
}

export function recordAnswered(state: QuestionState, id: QuestionId, swipeTotal: number): QuestionState {
  return { ...state, answered: { ...state.answered, [id]: true }, lastAt: swipeTotal };
}

/** skipping one means skipping all: no question card is shown again */
export function recordDismissed(state: QuestionState, swipeTotal: number): QuestionState {
  return { ...state, dismissed: true, lastAt: swipeTotal };
}

export function loadQuestionState(): QuestionState {
  return { ...EMPTY_STATE, ...readJson<Partial<QuestionState>>(KEY, {}) };
}

export function saveQuestionState(state: QuestionState): void {
  writeJson(KEY, state);
}

/** what the answer chips map onto in the existing filters */
export const BEDROOM_OPTIONS = [
  { label: "Studio", value: "any" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4+", value: "4" },
] as const;

export const BUDGET_OPTIONS = [
  { label: "£1,500", value: "1500" },
  { label: "£2,000", value: "2000" },
  { label: "£2,500", value: "2500" },
  { label: "£3,000", value: "3000" },
  { label: "£4,000", value: "4000" },
  { label: "£5,000", value: "5000" },
  { label: "No limit", value: "" },
] as const;

/** the filters that persist between visits (so an answer is still there tomorrow) */
export interface StoredFilters {
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  minBathrooms: string;
  shapes: [number, number][][];
}

const FILTERS_KEY = "housefinder:filters:v1";

export function loadFilters(): Partial<StoredFilters> {
  return readJson<Partial<StoredFilters>>(FILTERS_KEY, {});
}

export function saveFilters(filters: StoredFilters): void {
  writeJson(FILTERS_KEY, filters);
}
