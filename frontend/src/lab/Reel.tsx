import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, useFont } from "./common";

const FIRST = 12;

/** One home per screen, best match first. Tap the photo's right or left edge to move through its photos. */
export function Reel({ lab }: { lab: Lab }) {
  useFont("family=Big+Shoulders+Display:wght@700;900&family=Instrument+Sans:wght@400;600");
  const [shown, setShown] = useState(FIRST);
  const feedRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => lab.ranked.slice(0, shown), [lab.ranked, shown]);
  const total = lab.ranked.length;

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight * 3 > el.scrollHeight) setShown((n) => Math.min(n + FIRST, 200));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!lab.listings) return <Loading what="Finding homes…" />;
  return (
    <div className="reel" ref={feedRef}>
      {rows.map((l, i) => (
        <Slide key={listingKey(l)} lab={lab} listing={l} rank={i} total={total} />
      ))}
    </div>
  );
}

function Slide({ lab, listing, rank, total }: { lab: Lab; listing: Listing; rank: number; total: number }) {
  const [idx, setIdx] = useState(0);
  const key = listingKey(listing);
  const photos = listing.photo_urls.slice(0, 12);
  const saved = lab.shortlist.saved.includes(key);
  const top = lab.matchScores ? Math.max(1, Math.round(((rank + 1) / total) * 100)) : null;
  const best = lab.rankingPreference && lab.store?.rankingReady ? lab.store.bestPhoto(key, lab.rankingPreference) : null;
  const first = best ? photos.indexOf(best) : -1;
  useEffect(() => {
    if (first > 0) setIdx(first);
  }, [first]);

  function step(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const right = e.clientX - r.left > r.width / 2;
    setIdx((i) => (right ? Math.min(photos.length - 1, i + 1) : Math.max(0, i - 1)));
  }

  return (
    <section className="reel__slide">
      <div className="reel__photo" onClick={step}>
        <Photo url={photos[idx]} alt={`${listing.summary.address}, photo ${idx + 1}`} loading={rank < 2 ? "eager" : "lazy"} />
        <div className="reel__ticks" aria-hidden>
          {photos.map((_, i) => (
            <i key={i} className={i === idx ? "on" : i < idx ? "past" : ""} />
          ))}
        </div>
      </div>
      <div className="reel__plate">
        <div className="reel__price">
          {money(listing)}
          <small>/ month</small>
        </div>
        <div className="reel__where">{area(listing)}</div>
        <div className="reel__facts">
          {[bedsLabel(listing), listing.summary.bathrooms ? `${listing.summary.bathrooms} bath` : "", listing.agency_name].filter(Boolean).join(", ")}
        </div>
        <div className="reel__row">
          {top !== null && <span className="reel__rank">Top {top}% for you</span>}
          <button className={`reel__save${saved ? " on" : ""}`} onClick={() => lab.shortlist.toggleSave(listing)} aria-pressed={saved}>
            {saved ? "Saved" : "Save"}
          </button>
          <a className="reel__open" href={listing.summary.url} target="_blank" rel="noopener noreferrer">
            View at {listing.agency_name}
          </a>
        </div>
      </div>
    </section>
  );
}
