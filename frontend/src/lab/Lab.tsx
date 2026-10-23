import { useEffect, type ComponentType } from "react";
import { useLab, type Lab } from "./useLab";
import { useNoIndex } from "./common";
import { Reel } from "./Reel";
import { Versus } from "./Versus";
import { Budget } from "./Budget";
import { Words } from "./Words";
import { Shelves } from "./Shelves";
import Redesign, { type RedesignName } from "./Redesign";
import "./lab.css";

const DESIGNS: { id: string; name: string; line: string; cold?: boolean; whole?: RedesignName; C: ComponentType<{ lab: Lab }> }[] = [
  { id: "2", name: "Navy", whole: "navy", line: "Photos take the screen, navy and raspberry, tabs under your thumb.", C: () => null },
  { id: "9", name: "Sticker", whole: "postcard", line: "Thick outlines, hard shadows, flat bright colour. Playful and loud.", C: () => null },
  { id: "13", name: "Full bleed", whole: "bleed", line: "The photo is the whole screen. The screen washes green or pink as you drag, and every ten photos fill the strip.", C: () => null },
  { id: "14", name: "Hand", whole: "fan", line: "Photos are dealt as a fanned hand of cards. Play the front card left or right and the hand re-deals.", C: () => null },
  { id: "15", name: "Daily ten", whole: "ritual", line: "Swiping as a daily ritual: a streak, a ring that fills across ten photos, and a round card that names your style.", C: () => null },
  { id: "16", name: "Dig deeper", whole: "dig", line: "Swipe up to love a photo, then like the six photos most like it in one tap.", C: () => null },
  { id: "17", name: "Visa", whole: "stamp", line: "Swipes are rubber stamps: MOVE IN or NEXT, and the buttons say it in words.", C: () => null },
  { id: "11", name: "Atlas", whole: "atlas", line: "Dense and practical: list cards, small type, sharp corners, two columns on a laptop.", C: () => null },
  { id: "6", name: "Words", cold: true, line: "Tap a few words like Cosy or Industrial. Homes appear at once, no swiping.", C: Words },
  { id: "8", name: "Shelves", cold: true, line: "Gardens the advert forgot to mention, rents that just dropped, homes unlike anything else. Nothing to teach it.", C: Shelves },
  { id: "1", name: "Reel", line: "One home per screen. Like or pass the photo you are on and the screens below re-choose themselves.", C: Reel },
  { id: "3", name: "Versus", line: "Two photos, one choice. Teaches your taste faster than swiping.", C: Versus },
  { id: "4", name: "Budget tape", line: "Start from the rent. Drag the tape, then like or pass and every row re-sorts for you.", C: Budget },
];

const CODEX: { slug: string; name: string; line: string; detail: string; whole: RedesignName }[] = [
  { slug: "fieldnotes", name: "Field Notes", line: "The considered home hunt", detail: "A renter's research journal: annotated imagery, paper, ink and a yellow highlighter. Make decisions feel collected rather than consumed.", whole: "fieldnotes" },
  { slug: "blueprint", name: "Blueprint", line: "The practical search instrument", detail: "A cartographic workspace: deep blue, measured grids and precise data. Let the map, filters and match signal feel like one tool.", whole: "blueprint" },
  { slug: "salon", name: "Salon", line: "The interior-led magazine", detail: "An editorial gallery with generous photography, expressive typography and warm colour. Lead with how a home feels; reveal the numbers cleanly.", whole: "salon" },
];

export function designFromPath(path: string): string | null {
  if (/^\/ui\/codex\/?$/.test(path)) return "codex";
  const codex = /^\/ui\/codex\/([a-z-]+)\/?$/.exec(path);
  if (codex) return `codex/${codex[1]}`;
  const m = /^\/ui(\d*)\/?$/.exec(path);
  return m ? m[1] : null;
}

export default function Lab({ path }: { path: string }) {
  useNoIndex();
  const id = designFromPath(path) ?? "";
  const design = DESIGNS.find((d) => d.id === id);
  const codex = CODEX.find((d) => `codex/${d.slug}` === id);
  useEffect(() => {
    document.title = codex ? `${codex.name} · House Swipe Codex` : design ? `${design.name} · House Swipe design lab` : "House Swipe design lab";
  }, [codex, design]);
  if (codex) return <Redesign name={codex.whole} />;
  if (id === "codex") return <CodexIndex />;
  if (design?.whole) return <Redesign name={design.whole} />;
  return design ? <Design id={design.id} /> : <Index />;
}

function Design({ id }: { id: string }) {
  const lab = useLab();
  const Comp = DESIGNS.find((d) => d.id === id)!.C;
  return (
    <div className={`lab lab--${id}`}>
      <a className="lab-back" href="/ui">
        All designs
      </a>
      <Comp lab={lab} />
    </div>
  );
}

function Index() {
  return (
    <div className="lab lab--index">
      <h1>Design lab</h1>
      <p>Ideas for House Swipe on the real homes. The redesign is the whole app with every feature. The others are new ways to find a home: some need nothing from you up front, some learn as you like and pass and share what they learn with the main app.</p>
      <section className="lab-codex-callout">
        <span>NEW COLLECTION / CODEX</span>
        <h2>Three ways to make the hunt feel different.</h2>
        <p>Full-app concepts on real homes, not static screenshots.</p>
        <a href="/ui/codex">Explore Codex directions <span aria-hidden="true">↗</span></a>
      </section>
      {["whole", "cold", "learn"].map((group) => (
        <section key={group}>
          <h2>{group === "whole" ? "The whole app, redesigns (every feature works)" : group === "cold" ? "Work from the first second" : "Learn from every like and pass"}</h2>
          <ul>
            {DESIGNS.filter((d) => (d.whole ? "whole" : d.cold ? "cold" : "learn") === group).map((d) => (
              <li key={d.id}>
                <a href={`/ui${d.id}`}>
                  <b>{d.name}</b>
                  <span>{d.line}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <a className="lab-home" href="/">
        Back to House Swipe
      </a>
    </div>
  );
}

function CodexIndex() {
  return (
    <div className="lab-codex-index">
      <nav><a href="/ui">← Design lab</a><span>HOUSE SWIPE / CODEX</span></nav>
      <header>
        <p>THREE DIRECTIONS · ONE REAL PRODUCT</p>
        <h1>A home hunt should have a point of view.</h1>
        <p>Explore three visual languages across the actual swipe, browse and saved flows. Each direction uses the same listings and working interactions.</p>
      </header>
      <main>
        {CODEX.map((d, i) => (
          <a className={`codex-direction codex-direction--${d.slug}`} href={`/ui/codex/${d.slug}`} key={d.slug}>
            <span className="codex-direction__number">0{i + 1} / 03</span>
            <span className="codex-direction__art" aria-hidden="true"><i /><i /><i /></span>
            <span className="codex-direction__copy"><small>{d.line}</small><strong>{d.name}</strong><span>{d.detail}</span></span>
            <span className="codex-direction__arrow" aria-hidden="true">↗</span>
          </a>
        ))}
      </main>
      <footer>Concepts only. The current public app at <a href="/">houseswipe.uk</a> is unchanged.</footer>
    </div>
  );
}
