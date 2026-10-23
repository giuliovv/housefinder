import { createContext } from "react";

/** how the swipe deck presents itself: the real site uses "classic"; the design lab (/ui12 and up) tries bolder ones. Behaviour is identical. */
export type DeckVariant = "classic" | "table" | "bleed" | "fan";
export const DeckVariantContext = createContext<DeckVariant>("classic");
