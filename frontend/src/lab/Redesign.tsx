import { useEffect, useState } from "react";
import App from "../App";
import { useFont } from "./common";
import "./rd-navy.css";
import "./rd-postcard.css";
import "./rd-dusk.css";
import "./rd-atlas.css";
import "./rd-bleed.css";
import "./rd-fan.css";
import "./rd-ritual.css";
import "./rd-dig.css";
import "./rd-stamp.css";
import "./rd-fieldnotes.css";
import "./rd-blueprint.css";
import "./rd-salon.css";
import "./rd-board.css";
import "./rd-board-v4.css";
import { DeckVariantContext, type DeckVariant } from "../components/deckVariant";

export const REDESIGNS = {
  navy: "family=Schibsted+Grotesk:wght@400;500;600;700;800",
  postcard: "family=Bricolage+Grotesque:opsz,wght@12..96,400..800",
  dusk: "family=Outfit:wght@300;400;500;600",
  atlas: "family=Public+Sans:wght@400;500;600;700",
  bleed: "family=Outfit:wght@300;400;500;600",
  fan: "family=Sora:wght@400;500;600;700",
  ritual: "family=Nunito:wght@400;600;700;800;900",
  dig: "family=Karla:wght@400;600;700&family=Fraunces:opsz,wght@9..144,500;9..144,600",
  stamp: "family=Karla:wght@400;600;700&family=Special+Elite",
  fieldnotes: "family=DM+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600",
  blueprint: "family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600",
  salon: "family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1",
  board: "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Instrument+Serif:ital@1&family=DM+Mono:wght@500",
  "board-v4": "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Instrument+Serif:ital@1&family=DM+Mono:wght@400;500",
} as const;
export type RedesignName = keyof typeof REDESIGNS;

/** which swipe deck each design uses, and any extra classes it needs (the full-bleed design borrows the dark browsing styles) */
const DECK: Partial<Record<RedesignName, DeckVariant>> = { bleed: "bleed", fan: "fan", ritual: "ritual", dig: "dig", stamp: "stamp", board: "board", "board-v4": "board" };
const EXTRA: Partial<Record<RedesignName, string[]>> = { bleed: ["rd-dusk"], "board-v4": ["rd-board"] };

const DEBUG_PALETTES = [
  { name: "Sage", accent: "#355c48", soft: "#e5eee3", softInk: "#294d39" },
  { name: "Clay", accent: "#99523d", soft: "#f5e6df", softInk: "#783b2b" },
  { name: "Slate blue", accent: "#36566c", soft: "#e3ecf1", softInk: "#29475b" },
  { name: "Oxblood", accent: "#763e47", soft: "#f2e5e7", softInk: "#65333b" },
  { name: "Charcoal", accent: "#343e41", soft: "#e6e9e9", softInk: "#30383a" },
] as const;

function BoardV4Debug() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const palette = DEBUG_PALETTES[selected];

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--forest", palette.accent);
    root.style.setProperty("--accent-soft", palette.soft);
    root.style.setProperty("--accent-ink", palette.softInk);
    return () => {
      root.style.removeProperty("--forest");
      root.style.removeProperty("--accent-soft");
      root.style.removeProperty("--accent-ink");
    };
  }, [palette]);

  return <div className="rd-v4-debug">
    <button className="rd-v4-debug__toggle" aria-expanded={open} aria-controls="rd-v4-debug-panel" onClick={() => setOpen(!open)}>DEBUG · COLORS</button>
    {open && <div className="rd-v4-debug__panel" id="rd-v4-debug-panel" role="region" aria-label="Debug-only color options">
      <div className="rd-v4-debug__heading"><strong>Color preview</strong><button aria-label="Close debug colors" onClick={() => setOpen(false)}>×</button></div>
      <p>DEBUG ONLY · NOT FOR PRODUCTION<br />Session preview. Resets on refresh.</p>
      <div className="rd-v4-debug__options">
        {DEBUG_PALETTES.map((option, index) => <button key={option.name} aria-pressed={selected === index} onClick={() => setSelected(index)}>
          <span className="rd-v4-debug__swatch" style={{ background: option.accent }} />{option.name}
        </button>)}
      </div>
    </div>}
  </div>;
}

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
      <a className="rd-back" href={["fieldnotes", "blueprint", "salon", "board", "board-v4"].includes(name) ? "/ui/codex" : "/ui"}>
        ← {(["fieldnotes", "blueprint", "salon", "board", "board-v4"] as string[]).includes(name) ? "Codex" : "All designs"}
      </a>
      <DeckVariantContext.Provider value={DECK[name] ?? "classic"}>
        <App labVariant={name === "board" || name === "board-v4" ? name : undefined} />
      </DeckVariantContext.Provider>
      {name === "board-v4" && <BoardV4Debug />}
    </>
  );
}
