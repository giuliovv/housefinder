import { useEffect, useRef, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, RateButtons, TasteBar, useFont } from "./common";

const AHEAD = 8;

/**
 * One home per screen. Like or pass the photo you are looking at and the screens below you are chosen again from what
 * you have shown so far: spread wide at first to find out what you like, then the closest matches.
 */
export function Reel({ lab }: { lab: Lab }) {
  useFont("family=Big+Shoulders+Display:wght@700;900&family=Instrument+Sans:wght@400;600");
  const feedRef = useRef<HTMLDivElement>(null);
  const [order, setOrder] = useState<Listing[]>([]);
  const [cur, setCur] = useState(0);
  const latest = useRef(lab);
  latest.current = lab;
  const taught = lab.likedCount + lab.dislikedCount;
  const wasReady = useRef(false);

  // everything below the screen you are on is re-chosen whenever your taste changes
  useEffect(() => {
    if (!lab.listings) return;
    setOrder((prev) => {
      // when the photo data arrives, a feed chosen without it starts again; otherwise only what is below you changes
      const justReady = latest.current.rankingReady && !wasReady.current;
      wasReady.current = latest.current.rankingReady;
      const keep = justReady && cur === 0 ? [] : prev.slice(0, cur + 1);
      const seen = new Set(keep.map(listingKey));
      const next = latest.current.suggest(AHEAD, seen, cur + 1);
      return [...keep, ...next];
    });
  }, [lab.listings, cur, taught, lab.rankingReady, lab.matchScores !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCur(Math.round(el.scrollTop / el.clientHeight)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [order.length > 0]);

  function next() {
    const el = feedRef.current;
    if (el) el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
  }

  if (!lab.listings || order.length === 0) return <Loading what="Finding homes…" />;
  return (
    <div className="reel" ref={feedRef}>
      <div className="reel__taste">
        <TasteBar lab={lab} />
      </div>
      {order.map((l) => (
        <Slide key={listingKey(l)} lab={lab} listing={l} onPass={next} />
      ))}
    </div>
  );
}

function Slide({ lab, listing, onPass }: { lab: Lab; listing: Listing; onPass: () => void }) {
  const [idx, setIdx] = useState(0);
  const key = listingKey(listing);
  const photos = listing.photo_urls.slice(0, 12);
  const saved = lab.shortlist.saved.includes(key);
  const choice = lab.choices[key];
  const [pulse, setPulse] = useState(0);

  function step(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const right = e.clientX - r.left > r.width / 2;
    setIdx((i) => (right ? Math.min(photos.length - 1, i + 1) : Math.max(0, i - 1)));
  }

  return (
    <section className="reel__slide">
      <div className="reel__photo" onClick={step}>
        <Photo url={photos[idx]} alt={`${listing.summary.address}, photo ${idx + 1}`} />
        <div className="reel__ticks" aria-hidden>
          {photos.map((_, i) => (
            <i key={i} className={i === idx ? "on" : i < idx ? "past" : ""} />
          ))}
        </div>
        {pulse > 0 && <span key={pulse} className="reel__burst" aria-hidden>♥</span>}
      </div>
      <div className="reel__side">
        <RateButtons
          disabled={!lab.rankingReady}
          liked={choice === "like"}
          onLike={() => {
            lab.rate(listing, photos[idx], "like");
            setPulse((p) => p + 1);
          }}
          onPass={() => {
            lab.rate(listing, photos[idx], "dislike");
            onPass();
          }}
        />
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
