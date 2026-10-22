import { useEffect } from "react";
import { useLab } from "./useLab";
import { useNoIndex } from "./common";
import { Reel } from "./Reel";
import { Contact } from "./Contact";
import { Versus } from "./Versus";
import { Budget } from "./Budget";
import { MapView } from "./MapView";
import "./lab.css";

const DESIGNS = [
  { id: "1", name: "Reel", line: "One home per screen, best match first. Tap the photo to look through it.", C: Reel },
  { id: "2", name: "Contact sheet", line: "The 36 best matches as film frames. Circle the ones you want.", C: Contact },
  { id: "3", name: "Versus", line: "Two photos, one choice. Teaches your taste faster than swiping.", C: Versus },
  { id: "4", name: "Budget tape", line: "Start from the rent. Drag the tape and see what it buys at each size.", C: Budget },
  { id: "5", name: "Plum map", line: "Every home on the map, darker where it matches your taste.", C: MapView },
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
      <p>Five different ideas for House Swipe, all on the real homes and your real taste. Swipes you make in one count in the others.</p>
      <ul>
        {DESIGNS.map((d) => (
          <li key={d.id}>
            <a href={`/ui${d.id}`}>
              <b>{d.name}</b>
              <span>{d.line}</span>
            </a>
          </li>
        ))}
      </ul>
      <a className="lab-home" href="/">
        Back to House Swipe
      </a>
    </div>
  );
}
