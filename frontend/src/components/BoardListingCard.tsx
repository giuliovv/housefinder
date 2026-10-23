import { useRef, useState } from "react";
import type { Listing } from "../types";
import type { EmbeddingStore } from "../lib/embeddingStore";
import type { SwipeChoice } from "../lib/preferences";
import { listingKey } from "../lib/listingKey";
import { normalizeImageUrl } from "../lib/url";
import { gbp, latestDrop, type PricePoint } from "../lib/priceHistory";
import { trackMilestone } from "../lib/stats";

function checkedDay(day?: string): string | null {
  if (!day) return null;
  const then = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(then)) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (day === today) return "checked today";
  const days = Math.max(1, Math.floor((Date.parse(`${today}T00:00:00Z`) - then) / 86_400_000));
  return `checked ${days}d ago`;
}

export function BoardListingCard({ listing, store, deadPhotos, swipes, onRate, saved, onToggleSave, isNew, isTopRanked, priceSeries }: {
  listing: Listing;
  store?: EmbeddingStore | null;
  deadPhotos?: ReadonlySet<string>;
  swipes?: Record<string, SwipeChoice>;
  onRate?: (photoId: string, choice: SwipeChoice) => void;
  saved?: boolean;
  onToggleSave?: () => void;
  isNew?: boolean;
  isTopRanked?: boolean;
  priceSeries?: PricePoint[];
  /** kept so existing callers still compile; the photo-led card no longer draws the price chart */
  today?: string;
}) {
  const { summary } = listing;
  const images = listing.photo_urls.length ? listing.photo_urls : [summary.thumbnail_url].filter((x): x is string => Boolean(x));
  const photos = deadPhotos?.size ? images.filter((url) => !deadPhotos.has(url)) : images;
  const [index, setIndex] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const current = photos[index];
  const currentId = current ? `${listingKey(listing)}::${current}` : null;
  const canRate = Boolean(currentId && onRate && store?.hasPhoto(listingKey(listing), current));
  const drop = latestDrop(priceSeries);
  const checked = checkedDay(listing.last_seen);
  const agencyUrl = summary.url;
  const agencyClick = () => trackMilestone("m_agency_click");

  function onScroll() {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = strip.current;
      if (el?.clientWidth) setIndex(Math.min(photos.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
    });
  }

  function shift(delta: number) {
    const el = strip.current;
    if (!el || photos.length < 2) return;
    const next = (index + delta + photos.length) % photos.length;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  }

  const price = summary.price_pcm != null ? `${gbp(summary.price_pcm)} pcm` : summary.price_flag ? (summary.price_text || "Price on request") : "Price on request";
  const rooms = summary.bedrooms == null ? "Bedrooms not listed" : `${summary.bedrooms === 0 ? "Studio" : `${summary.bedrooms} bed`}${summary.bathrooms == null ? "" : ` · ${summary.bathrooms} bath`}`;
  const stale = checked && checked !== "checked today" ? checked : null;

  return (
    <article className="listing-card board-listing">
      <div className="listing-card__photo-wrap board-listing__gallery">
        {photos.length ? (
          <div className="listing-card__strip" ref={strip} onScroll={onScroll} aria-label={`Photos of ${summary.address}`}>
            {photos.map((url, i) => (
              <div className="listing-card__slide" key={url}>
                {Math.abs(i - index) <= 2 && <img className="listing-card__photo" src={normalizeImageUrl(url) ?? undefined} alt={i === 0 ? summary.address : ""} referrerPolicy="no-referrer" loading="lazy" draggable={false} />}
              </div>
            ))}
          </div>
        ) : <div className="board-listing__no-photo">No photo from agency</div>}
        {photos.length > 1 && <>
          <button className="board-listing__arrow board-listing__arrow--prev" onClick={() => shift(-1)} aria-label="Previous photo">‹</button>
          <button className="board-listing__arrow board-listing__arrow--next" onClick={() => shift(1)} aria-label="Next photo">›</button>
          <span className="listing-card__photo-count">{index + 1}/{photos.length}</span>
        </>}
        <div className="board-listing__tags">
          <span className="listing-card__agency">{listing.agency_name}</span>
          {isNew && <span className="listing-card__new">New</span>}
          {isTopRanked && photos.length > 0 && <span className="listing-card__match">Nearer your taste</span>}
          {photos.length === 0 && <span className="board-listing__unranked">Not ranked: no photos</span>}
        </div>

        <div className="board-listing__side">
          <button className="board-listing__icon" disabled={!canRate} aria-label="Not for me" aria-pressed={currentId ? swipes?.[currentId] === "dislike" : false} onClick={() => currentId && onRate?.(currentId, "dislike")}>✕</button>
          <button className="board-listing__icon board-listing__icon--like" disabled={!canRate} aria-label="I like this" aria-pressed={currentId ? swipes?.[currentId] === "like" : false} onClick={() => currentId && onRate?.(currentId, "like")}>♥</button>
          <button className="board-listing__icon" disabled={!onToggleSave} aria-label={saved ? "Remove from saved" : "Save"} aria-pressed={Boolean(saved)} onClick={onToggleSave}>{saved ? "★" : "☆"}</button>
        </div>

        <a className="board-listing__info" href={agencyUrl} target="_blank" rel="noopener noreferrer" onClick={agencyClick} aria-label={`View ${summary.address} on ${listing.agency_name}`}>
          <span className="board-listing__price">{price}</span>
          {drop && <span className="board-listing__drop"><del>{gbp(drop.from)}</del><span>−{gbp(drop.amount)}</span></span>}
          <span className="board-listing__address">{summary.address}</span>
          <span className="board-listing__rooms">{rooms}{stale ? ` · ${stale}` : ""} · View ↗</span>
          {summary.price_flag && <span className="board-listing__flag">Rent looks unusually low. Check with the agency.</span>}
        </a>
      </div>
    </article>
  );
}
