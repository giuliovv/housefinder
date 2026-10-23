import { useEffect, useRef, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, TasteBar, useFont } from "./common";

const FRAMES = 36;
const REDEVELOP = 4;

/**
 * A photographer's contact sheet of 36 frames. Circle a frame with the red pencil to say you like it; cross it out and it is
 * replaced by a different frame. Every few marks the rest of the sheet is developed again from what you have shown so far.
 */
export function Contact({ lab }: { lab: Lab }) {
  useFont("family=Archivo+Narrow:wght@500;700&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400");
  const [open, setOpen] = useState<Listing | null>(null);
  const [slots, setSlots] = useState<Listing[]>([]);
  const latest = useRef(lab);
  latest.current = lab;
  const taught = lab.likedCount + lab.dislikedCount;
  const wasReady = useRef(false);

  useEffect(() => {
    if (!lab.listings) return;
    const l = latest.current;
    setSlots((prev) => {
      if (prev.length === 0) return l.suggest(FRAMES);
      // when the photo data arrives the first sheet (chosen without it) is developed again; after that every few marks
      const justReady = l.rankingReady && !wasReady.current;
      wasReady.current = l.rankingReady;
      const full = justReady || (taught > 0 && taught % REDEVELOP === 0);
      const stays = (x: Listing) => l.choices[listingKey(x)] === "like" || (!full && !(listingKey(x) in l.choices));
      const keep = new Set(prev.filter(stays).map(listingKey));
      const fresh = l.suggest(prev.length - keep.size, keep, taught + 1);
      // circled frames (and, between redevelops, unmarked ones) stay where they are; crossed-out ones are replaced
      return prev.map((x) => (keep.has(listingKey(x)) ? x : (fresh.shift() ?? x)));
    });
  }, [lab.listings, taught, lab.rankingReady]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lab.listings || slots.length === 0) return <Loading what="Developing the film…" />;
  const strips: Listing[][] = [];
  for (let i = 0; i < slots.length; i += 3) strips.push(slots.slice(i, i + 3));
  return (
    <div className="cs">
      <header className="cs__head">
        <h1>Contact sheet</h1>
        <p>Circle the homes you would visit. Cross out the rest. The sheet learns from both.</p>
        <TasteBar lab={lab} />
      </header>
      <div className="cs__film">
        {strips.map((strip, s) => (
          <div className="cs__strip" key={s}>
            {strip.map((l, j) => (
              <Frame key={listingKey(l)} lab={lab} listing={l} n={s * 3 + j + 1} onOpen={() => setOpen(l)} />
            ))}
          </div>
        ))}
      </div>
      {open && <Loupe lab={lab} listing={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Frame({ lab, listing, n, onOpen }: { lab: Lab; listing: Listing; n: number; onOpen: () => void }) {
  const key = listingKey(listing);
  const choice = lab.choices[key];
  const url = frameUrl(lab, listing);
  return (
    <figure className={`cs__frame${choice === "like" ? " circled" : ""}${choice === "dislike" ? " crossed" : ""}`}>
      <button className="cs__img" onClick={onOpen} aria-label={`${listing.summary.address}, ${money(listing)}. Open`}>
        <Photo url={url} alt="" loading={n > 6 ? "lazy" : "eager"} />
        {choice === "like" && <span className="cs__pencil" aria-hidden />}
      </button>
      <figcaption>
        <b>{n}</b>
        <span>{money(listing)}</span>
        <span className="cs__marks">
          <button disabled={!lab.rankingReady} onClick={() => lab.rate(listing, url, "like")} aria-label="Circle: I like this" aria-pressed={choice === "like"}>
            ○
          </button>
          <button disabled={!lab.rankingReady} onClick={() => lab.rate(listing, url, "dislike")} aria-label="Cross out: not for me">
            ✕
          </button>
        </span>
      </figcaption>
    </figure>
  );
}

/** the photo that suits this person best once there is a taste, otherwise the lead photo */
function frameUrl(lab: Lab, listing: Listing): string {
  const best = lab.rankingPreference && lab.store?.rankingReady ? lab.store.bestPhoto(listingKey(listing), lab.rankingPreference) : null;
  return best ?? listing.photo_urls[0];
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
            <button onClick={() => lab.rate(listing, frameUrl(lab, listing), "like")} disabled={!lab.rankingReady}>
              Circle it
            </button>
            <button onClick={() => lab.shortlist.toggleSave(listing)}>{saved ? "Remove from saved" : "Keep for later"}</button>
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
