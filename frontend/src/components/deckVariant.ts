import { createContext } from "react";

/** how the swipe deck presents itself: the real site uses "classic"; the design lab (/ui12 and up) tries bolder ones. Behaviour is identical. */
export type DeckVariant = "classic" | "table" | "bleed" | "fan" | "ritual" | "dig" | "stamp";
export const DeckVariantContext = createContext<DeckVariant>("classic");

/** photos most like a given one, for the "more like this" gesture; the real site leaves this empty */
export const DeckNeighboursContext = createContext<((photoId: string, n: number) => { id: string; url: string }[]) | null>(null);
