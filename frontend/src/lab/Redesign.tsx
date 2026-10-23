import { useEffect } from "react";
import App from "../App";
import { useFont } from "./common";
import "./rd-navy.css";
import "./rd-postcard.css";
import "./rd-dusk.css";
import "./rd-atlas.css";
import "./rd-table.css";
import "./rd-bleed.css";
import "./rd-fan.css";
import "./rd-ritual.css";
import "./rd-dig.css";
import "./rd-stamp.css";
import { DeckVariantContext, type DeckVariant } from "../components/deckVariant";

export const REDESIGNS = {
  navy: "family=Schibsted+Grotesk:wght@400;500;600;700;800",
  postcard: "family=Bricolage+Grotesque:opsz,wght@12..96,400..800",
  dusk: "family=Outfit:wght@300;400;500;600",
  atlas: "family=Public+Sans:wght@400;500;600;700",
  table: "family=Familjen+Grotesk:wght@400;500;600;700&family=Caveat:wght@700",
  bleed: "family=Outfit:wght@300;400;500;600",
  fan: "family=Sora:wght@400;500;600;700",
  ritual: "family=Nunito:wght@400;600;700;800;900",
  dig: "family=Karla:wght@400;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600",
  stamp: "family=Karla:wght@400;600;700&family=Special+Elite",
} as const;
export type RedesignName = keyof typeof REDESIGNS;

/** which swipe deck each design uses, and any extra classes it needs (the full-bleed design borrows the dark browsing styles) */
const DECK: Partial<Record<RedesignName, DeckVariant>> = { table: "table", bleed: "bleed", fan: "fan", ritual: "ritual", dig: "dig", stamp: "stamp" };
const EXTRA: Partial<Record<RedesignName, string[]>> = { bleed: ["rd-dusk"] };

/** The whole real app, every feature, wearing a different design: a re-skin through colour variables plus layout rules. */
export default function Redesign({ name }: { name: RedesignName }) {
  useFont(REDESIGNS[name]);
  useEffect(() => {
    const cls = [`rd-${name}`, ...(EXTRA[name] ?? [])];
    document.documentElement.classList.add(...cls);
    return () => document.documentElement.classList.remove(...cls);
  }, [name]);
  return (
    <>
      <a className="rd-back" href="/ui">
        All designs
      </a>
      <DeckVariantContext.Provider value={DECK[name] ?? "classic"}>
        <App />
      </DeckVariantContext.Provider>
    </>
  );
}
