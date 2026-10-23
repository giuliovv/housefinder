import { useEffect, type ComponentType } from "react";
import { useLab, type Lab } from "./useLab";
import { useNoIndex } from "./common";
import { Reel } from "./Reel";
import { Contact } from "./Contact";
import { Versus } from "./Versus";
import { Budget } from "./Budget";
import { MapView } from "./MapView";
import { Words } from "./Words";
import { Pick } from "./Pick";
import { Shelves } from "./Shelves";
import "./lab.css";

const DESIGNS: { id: string; name: string; line: string; cold?: boolean; C: ComponentType<{ lab: Lab }> }[] = [
  { id: "6", name: "Words", cold: true, line: "Tap a few words like Cosy or Industrial. Homes appear at once, no swiping.", C: Words },
  { id: "7", name: "Pick a wall", cold: true, line: "Nine very different homes. Choose one, get nine variations. Three choices and you are done.", C: Pick },
  { id: "8", name: "Shelves", cold: true, line: "Gardens the advert forgot, terraces in the photos, rents that just dropped. Nothing to teach it.", C: Shelves },
  { id: "1", name: "Reel", line: "One home per screen. Like or pass the photo you are on and the screens below re-choose themselves.", C: Reel },
  { id: "2", name: "Contact sheet", line: "36 film frames. Circle the ones you like, cross out the rest, and the sheet develops again around you.", C: Contact },
  { id: "3", name: "Versus", line: "Two photos, one choice. Teaches your taste faster than swiping.", C: Versus },
  { id: "4", name: "Budget tape", line: "Start from the rent. Drag the tape, then like or pass and every row re-sorts for you.", C: Budget },
  { id: "5", name: "Plum map", line: "Every home on the map. Rate a few and the dots darken where you will like it.", C: MapView },
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
      <p>Eight ideas for House Swipe on the real homes. The first group needs nothing from you up front. The second group learns as you like and pass, and shares what it learns with the main app.</p>
      {[true, false].map((cold) => (
        <section key={String(cold)}>
          <h2>{cold ? "Work from the first second" : "Learn from every like and pass"}</h2>
          <ul>
            {DESIGNS.filter((d) => !!d.cold === cold).map((d) => (
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
