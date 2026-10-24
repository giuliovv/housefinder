import { createContext } from "react";

/** how the swipe deck presents itself: the real site uses "classic"; the design lab (/ui12 and up) tries bolder ones. Behaviour is identical. */
export type DeckVariant = "classic" | "bleed" | "fan" | "ritual" | "dig" | "stamp" | "board";
export const DeckVariantContext = createContext<DeckVariant>("classic");

/** Photos most like a given one, for the "more like this" gesture. */
export const DeckNeighboursContext = createContext<((photoId: string, n: number) => { id: string; url: string }[]) | null>(null);
