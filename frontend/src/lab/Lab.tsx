import { useEffect, type ComponentType } from "react";
import { useLab, type Lab } from "./useLab";
import { useNoIndex } from "./common";
import { Reel } from "./Reel";
import { Versus } from "./Versus";
import { Budget } from "./Budget";
import { Words } from "./Words";
import { Shelves } from "./Shelves";
import Redesign from "./Redesign";
import "./lab.css";

const DESIGNS: { id: string; name: string; line: string; cold?: boolean; whole?: boolean; C: ComponentType<{ lab: Lab }> }[] = [
  { id: "2", name: "House Swipe, redesigned", whole: true, line: "The real app with every feature, in a different design: photos take the screen and the tabs move under your thumb.", C: () => null },
  { id: "6", name: "Words", cold: true, line: "Tap a few words like Cosy or Industrial. Homes appear at once, no swiping.", C: Words },
  { id: "8", name: "Shelves", cold: true, line: "Gardens the advert forgot to mention, rents that just dropped, homes unlike anything else. Nothing to teach it.", C: Shelves },
  { id: "1", name: "Reel", line: "One home per screen. Like or pass the photo you are on and the screens below re-choose themselves.", C: Reel },
  { id: "3", name: "Versus", line: "Two photos, one choice. Teaches your taste faster than swiping.", C: Versus },
  { id: "4", name: "Budget tape", line: "Start from the rent. Drag the tape, then like or pass and every row re-sorts for you.", C: Budget },
];

export function designFromPath(path: string): string | null {
  const m = /^\/ui(\d*)\/?$/.exec(path);
  return m ? m[1] : null;
}

export default function Lab({ path }: { path: string }) {
  useNoIndex();
  const id = designFromPath(path) ?? "";
  const design = DESIGNS.find((d) => d.id === id);
  useEffect(() => {
    document.title = design ? `${design.name} · House Swipe design lab` : "House Swipe design lab";
  }, [design]);
  if (design?.whole) return <Redesign />;
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
      {["whole", "cold", "learn"].map((group) => (
        <section key={group}>
          <h2>{group === "whole" ? "The real app, redesigned" : group === "cold" ? "Work from the first second" : "Learn from every like and pass"}</h2>
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
