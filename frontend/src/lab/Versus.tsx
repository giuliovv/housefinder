import { useEffect, useMemo, useState } from "react";
import { listingKey } from "../lib/listingKey";
import { area, money, type Lab } from "./useLab";
import { Loading, Photo, useFont } from "./common";

type Pick = "a" | "b" | null;

/** Two photos, one choice. Faster than swipe: every round teaches the model about a pair, not a single photo. */
export function Versus({ lab }: { lab: Lab }) {
  useFont("family=Archivo:wdth,wght@62..125,500..900&display=swap");
  const [picked, setPicked] = useState<Pick>(null);
  const [round, setRound] = useState(1);
  const pair = useMemo(() => [lab.undecided[0], lab.undecided[1]] as const, [lab.undecided]);
  const [a, b] = pair;

  function choose(p: "a" | "b" | "neither" | "both") {
    if (!a || !b || picked) return;
    setPicked(p === "a" || p === "b" ? p : null);
    const settle = () => {
      lab.swipe(a.id, p === "a" || p === "both" ? "like" : "dislike");
      lab.swipe(b.id, p === "b" || p === "both" ? "like" : "dislike");
      setPicked(null);
      setRound((r) => r + 1);
    };
    if (p === "a" || p === "b") window.setTimeout(settle, 320);
    else settle();
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "1") choose("a");
      if (e.key === "ArrowDown" || e.key === "2") choose("b");
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const lead = lab.ranked[0];
  if (!lab.store) return <Loading what="Setting up the first round…" />;
  if (!a || !b) return <Loading what="You have rated every photo." />;
  return (
    <div className="vs">
      {[
        { id: "a" as const, photo: a },
        { id: "b" as const, photo: b },
      ].map(({ id, photo }) => (
        <button
          key={photo.id}
          className={`vs__side vs__side--${id}${picked === id ? " win" : picked ? " lose" : ""}`}
          onClick={() => choose(id)}
          aria-label={`Prefer photo ${id.toUpperCase()}`}
        >
          <Photo url={photo.url} alt={`Option ${id.toUpperCase()}`} onError={() => lab.markBroken(photo.id)} />
          <span className="vs__letter" aria-hidden>
            {id.toUpperCase()}
          </span>
        </button>
      ))}
      <div className="vs__band">
        <span className="vs__round">Round {round}</span>
        <span className="vs__live">
          {lab.matchScores && lead ? (
            <>
              Leading: <b>{area(lead)}</b>, {money(lead)}
            </>
          ) : (
            `${lab.swipeCount} photos rated. Matches appear after about 10.`
          )}
        </span>
        <span className="vs__alt">
          <button onClick={() => choose("neither")}>Neither</button>
          <button onClick={() => choose("both")}>Both</button>
        </span>
      </div>
      {lead && lab.matchScores && (
        <a className="vs__lead" href={lead.summary.url} target="_blank" rel="noopener noreferrer" key={listingKey(lead)}>
          Open the leader
        </a>
      )}
    </div>
  );
}
