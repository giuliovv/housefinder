import { useEffect, useMemo, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, money, type Lab } from "./useLab";
import { Loading, Photo, useFont } from "./common";
import { diverse, dot } from "./suggest";

const ROUNDS = 3;
const TILES = 9;

/** A wall of nine very different homes. Pick the one you would rather come home to; the next wall is nine variations on it. */
export function Pick({ lab }: { lab: Lab }) {
  useFont("family=Libre+Franklin:wght@400;600;800&display=swap");
  const [picks, setPicks] = useState<Listing[]>([]);
  const [seed, setSeed] = useState(1);
  const round = picks.length + 1;
  const vecs = lab.homeVectors;

  const pref = useMemo(() => {
    if (picks.length === 0 || vecs.size === 0) return null;
    const out = new Float32Array(lab.store!.dim);
    for (const p of picks) {
      const v = vecs.get(listingKey(p));
      if (v) for (let i = 0; i < out.length; i++) out[i] += v[i];
    }
    return out;
  }, [picks, vecs, lab.store]);

  // round one: the whole market. Later rounds: the 12% of homes nearest what has been chosen so far.
  const wall = useMemo(() => {
    if (vecs.size === 0 || round > ROUNDS) return [];
    let pool = lab.listings ?? [];
    if (pref) {
      const scored = pool.filter((l) => vecs.has(listingKey(l))).map((l) => [l, dot(vecs.get(listingKey(l))!, pref)] as const);
      scored.sort((a, b) => b[1] - a[1]);
      pool = scored.slice(0, Math.max(60, Math.round(scored.length * 0.12))).map((s) => s[0]);
    }
    return diverse(pool, vecs, TILES, seed + round);
  }, [vecs, round, pref, seed, lab.listings]);

  const finalists = useMemo(() => {
    if (round <= ROUNDS || !pref) return [];
    return (lab.listings ?? [])
      .filter((l) => vecs.has(listingKey(l)) && !picks.includes(l))
      .map((l) => [l, dot(vecs.get(listingKey(l))!, pref)] as const)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map((s) => s[0]);
  }, [round, pref, vecs, lab.listings, picks]);

  useEffect(() => document.querySelector(".lab")?.scrollTo(0, 0), [round]);

  if (!lab.listings || vecs.size === 0) return <Loading what="Hanging the wall…" />;
  if (round > ROUNDS)
    return (
      <div className="pk pk--done">
        <h1>Your wall</h1>
        <p>You chose {picks.length} homes. These are the closest to them.</p>
        <div className="pk__grid pk__grid--final">
          {finalists.map((l) => (
            <Frame key={listingKey(l)} l={l} href={l.summary.url} />
          ))}
        </div>
        <button className="pk__again" onClick={() => setPicks([])}>
          Start again
        </button>
      </div>
    );
  return (
    <div className="pk">
      <header className="pk__head">
        <h1>Which would you rather come home to?</h1>
        <p>
          Choice {round} of {ROUNDS}. {round === 1 ? "Nine very different homes." : "Nine variations on what you chose."}
        </p>
      </header>
      <div className="pk__grid">
        {wall.map((l) => (
          <Frame key={listingKey(l)} l={l} onPick={() => setPicks((p) => [...p, l])} />
        ))}
      </div>
      <button className="pk__again" onClick={() => setSeed((s) => s + 1)}>
        None of these
      </button>
    </div>
  );
}

function Frame({ l, onPick, href }: { l: Listing; onPick?: () => void; href?: string }) {
  const photo = <Photo url={l.photo_urls[Math.min(1, l.photo_urls.length - 1)]} alt={`${area(l)}, ${money(l)}`} loading="lazy" />;
  const cap = (
    <span className="pk__cap">
      {money(l)} <i>{area(l)}</i>
    </span>
  );
  return href ? (
    <a className="pk__frame" href={href} target="_blank" rel="noopener noreferrer">
      {photo}
      {cap}
    </a>
  ) : (
    <button className="pk__frame" onClick={onPick}>
      {photo}
      {cap}
    </button>
  );
}
