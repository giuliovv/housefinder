/** Bedroom filter: a minimum and a maximum, each "any" or a number. Unknown bedroom counts (some agencies don't
 * show them on the card) fail a minimum, which asserts "at least N", but pass a maximum, so they aren't hidden by it. */
export function matchesBedrooms(beds: number | null, min: string, max: string): boolean {
  if (min !== "any") {
    if (beds === null || beds < Number(min)) return false;
  }
  if (max !== "any") {
    if (beds !== null && beds > Number(max)) return false;
  }
  return true;
}

/** keep min <= max when one of them changes: the one that was just set wins, the other follows */
export function reconcileBedrooms(min: string, max: string, changed: "min" | "max"): { min: string; max: string } {
  if (min === "any" || max === "any" || Number(min) <= Number(max)) return { min, max };
  return changed === "min" ? { min, max: min } : { min: max, max };
}
