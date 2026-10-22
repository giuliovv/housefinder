import { useEffect, useMemo, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, useFont } from "./common";

const FRAMES = 36;

/** A photographer's contact sheet: the 36 best matches as film frames. Circle the ones you want with a red pencil (save). */
export function Contact({ lab }: { lab: Lab }) {
  useFont("family=Archivo+Narrow:wght@500;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400");
  const [open, setOpen] = useState<Listing | null>(null);
  const [limit, setLimit] = useState(FRAMES);
  const rows = useMemo(() => lab.ranked.slice(0, limit), [lab.ranked, limit]);
  if (!lab.listings) return <Loading what="Developing the film…" />;
  const strips: Listing[][] = [];
  for (let i = 0; i < rows.length; i += 3) strips.push(rows.slice(i, i + 3));
  return (
    <div className="cs">
      <header className="cs__head">
        <h1>Contact sheet</h1>
        <p>
          {lab.matchScores ? "Your best matches, strongest first." : "Newest homes first. Swipe a few photos in the main app and this sheet re-develops around your taste."}
        </p>
      </header>
      <div className="cs__film">
        {strips.map((strip, s) => (
          <div className="cs__strip" key={s}>
            {strip.map((l, j) => {
              const n = s * 3 + j + 1;
              return <Frame key={listingKey(l)} lab={lab} listing={l} n={n} onOpen={() => setOpen(l)} />;
            })}
          </div>
        ))}
      </div>
      {limit < Math.min(lab.ranked.length, 240) && (
        <button className="cs__more" onClick={() => setLimit((n) => n + FRAMES)}>
          Develop the next {FRAMES}
        </button>
      )}
      {open && <Loupe lab={lab} listing={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Frame({ lab, listing, n, onOpen }: { lab: Lab; listing: Listing; n: number; onOpen: () => void }) {
  const key = listingKey(listing);
  const saved = lab.shortlist.saved.includes(key);
  const best = lab.rankingPreference && lab.store?.rankingReady ? lab.store.bestPhoto(key, lab.rankingPreference) : null;
  const url = best ?? listing.photo_urls[0];
  return (
    <figure className={`cs__frame${saved ? " circled" : ""}`}>
      <button className="cs__img" onClick={onOpen} aria-label={`${listing.summary.address}, ${money(listing)}. Open`}>
        <Photo url={url} alt="" loading={n > 6 ? "lazy" : "eager"} />
        {saved && <span className="cs__pencil" aria-hidden />}
      </button>
      <figcaption>
        <b>{n}</b>
        <span>{money(listing)}</span>
      </figcaption>
    </figure>
  );
}

function Loupe({ lab, listing, onClose }: { lab: Lab; listing: Listing; onClose: () => void }) {
  const key = listingKey(listing);
  const saved = lab.shortlist.saved.includes(key);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="cs__loupe" role="dialog" aria-label={listing.summary.address} onClick={onClose}>
      <div className="cs__loupe-body" onClick={(e) => e.stopPropagation()}>
        <div className="cs__roll">
          {listing.photo_urls.slice(0, 10).map((u) => (
            <Photo key={u} url={u} alt="" loading="lazy" />
          ))}
        </div>
        <div className="cs__notes">
          <h2>{area(listing)}</h2>
          <p className="cs__price">
            {money(listing)} a month, {[bedsLabel(listing), listing.agency_name].filter(Boolean).join(", ")}
          </p>
          <p className="cs__desc">{listing.description.slice(0, 280)}</p>
          <div className="cs__acts">
            <button onClick={() => lab.shortlist.toggleSave(listing)}>{saved ? "Rub out the circle" : "Circle it"}</button>
            <a href={listing.summary.url} target="_blank" rel="noopener noreferrer">
              View at {listing.agency_name}
            </a>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
