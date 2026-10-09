import { useEffect, useRef, useState } from "react";
import type { Listing } from "../types";
import type { EmbeddingStore } from "../lib/embeddingStore";
import type { SwipeChoice } from "../lib/preferences";
import { normalizeImageUrl } from "../lib/url";
import { listingKey } from "../lib/listingKey";

/** Agencies leak their own wording into the price cell ("To Let: £4,616 per week",
 * "… (Tenant Info)"); show just the price. The pipeline cleans it too, this covers
 * data that hasn't been refreshed yet. */
function displayPrice(text: string): string {
  return text
    .replace(/\s*\((?:tenant info|tenancy info)\)/gi, "")
    .replace(/^\s*(?:to\s+let|to\s+rent|for\s+rent|available|let)\s*[:\-–]\s*/i, "")
    .trim();
}

export function ListingCard({
  listing,
  matchScore,
  store,
  deadPhotos,
  swipes,
  onRate,
  saved,
  onToggleSave,
}: {
  listing: Listing;
  matchScore?: number;
  store?: EmbeddingStore | null;
  /** photo URLs known to be gone (the agency deleted them) — never shown */
  deadPhotos?: ReadonlySet<string>;
  swipes?: Record<string, SwipeChoice>;
  onRate?: (photoId: string, choice: SwipeChoice) => void;
  saved?: boolean;
  onToggleSave?: () => void;
}) {
  const { summary } = listing;
  const allPhotos = listing.photo_urls.length > 0
    ? listing.photo_urls
    : [summary.thumbnail_url].filter((u): u is string => Boolean(u));
  const photos = deadPhotos && deadPhotos.size > 0 ? allPhotos.filter((u) => !deadPhotos.has(u)) : allPhotos;
  const [photoIndex, setPhotoIndex] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<number | null>(null);
  const rawCurrentPhoto = photos[photoIndex];

  // Only photos that have a vector can be rated — rating only makes sense for
  // a photo that can feed the preference vector, so the buttons are hidden
  // otherwise rather than silently recording a swipe that never affects match
  // scores.
  const canRate = onRate != null && store != null && rawCurrentPhoto != null && store.hasPhoto(listingKey(listing), rawCurrentPhoto);
  const photoId = rawCurrentPhoto != null ? `${listingKey(listing)}::${rawCurrentPhoto}` : null;
  const currentChoice = photoId != null ? swipes?.[photoId] : undefined;

  // The photos are a horizontally scrolling, scroll-snapping strip: swipe on
  // touch, horizontal wheel/trackpad on desktop, or tap the big edge zones.
  // `photoIndex` just follows whichever slide is in view (so the rating
  // buttons and counter stay in sync); it is never the source of truth.
  function onStripScroll() {
    if (scrollFrame.current != null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      const el = stripRef.current;
      if (el && el.clientWidth > 0) {
        const index = Math.min(photos.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
        setPhotoIndex(index);
      }
    });
  }

  useEffect(
    () => () => {
      if (scrollFrame.current != null) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  function goTo(e: React.MouseEvent, delta: 1 | -1) {
    // the whole card is a link; a tap on a zone must not open the listing
    e.preventDefault();
    e.stopPropagation();
    const el = stripRef.current;
    if (!el) return;
    const target = (photoIndex + delta + photos.length) % photos.length; // wraps around
    el.scrollTo({ left: target * el.clientWidth, behavior: "smooth" });
  }

  function rate(e: React.MouseEvent, choice: SwipeChoice) {
    e.preventDefault();
    e.stopPropagation();
    if (photoId != null) onRate?.(photoId, choice);
  }

  return (
    <a className="listing-card" href={summary.url} target="_blank" rel="noreferrer">
      <div className="listing-card__photo-wrap">
        {photos.length > 0 ? (
          <div className="listing-card__strip" ref={stripRef} onScroll={onStripScroll}>
            {photos.map((raw, i) => (
              <div className="listing-card__slide" key={raw}>
                {/* only mount images near the visible slide: a few thousand cards
                    with 10+ photos each would otherwise be tens of thousands of <img>s */}
                {Math.abs(i - photoIndex) <= 2 && (
                  <img
                    className="listing-card__photo"
                    src={normalizeImageUrl(raw) ?? undefined}
                    alt={i === 0 ? summary.address : ""}
                    loading="lazy"
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="listing-card__photo listing-card__photo--placeholder">No photo</div>
        )}

        {photos.length > 1 && (
          <>
            <button
              className="listing-card__zone listing-card__zone--prev"
              onClick={(e) => goTo(e, -1)}
              aria-label="Previous photo"
            >
              <span className="listing-card__zone-arrow">‹</span>
            </button>
            <button
              className="listing-card__zone listing-card__zone--next"
              onClick={(e) => goTo(e, 1)}
              aria-label="Next photo"
            >
              <span className="listing-card__zone-arrow">›</span>
            </button>
            <span className="listing-card__photo-count">
              {photoIndex + 1} / {photos.length}
            </span>
          </>
        )}

        <div className="listing-card__tags">
          <span className="listing-card__agency">{listing.agency_name}</span>
          {summary.status && <span className="listing-card__status">{summary.status}</span>}
        </div>
        {matchScore != null && (
          <span className="listing-card__match" title="Relative match to your swiped style — higher is better, compare listings to each other rather than reading it as an absolute percentage">
            {Math.round(matchScore * 100)}% match
          </span>
        )}
        {canRate && (
          <div className="listing-card__rate">
            <button
              className={`listing-card__rate-btn listing-card__rate-btn--dislike ${currentChoice === "dislike" ? "listing-card__rate-btn--active" : ""}`}
              onClick={(e) => rate(e, "dislike")}
              aria-label="Not my style"
              title="Not my style"
            >
              ✕
            </button>
            <button
              className={`listing-card__rate-btn listing-card__rate-btn--like ${currentChoice === "like" ? "listing-card__rate-btn--active" : ""}`}
              onClick={(e) => rate(e, "like")}
              aria-label="My style"
              title="My style"
            >
              ♥
            </button>
          </div>
        )}
      </div>

      <div className="listing-card__body">
        <div className="listing-card__price-row">
          <p className="listing-card__price">{displayPrice(summary.price_text)}</p>
          {onToggleSave && (
            <button
              className={`listing-card__save ${saved ? "listing-card__save--on" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleSave();
              }}
              aria-pressed={saved}
            >
              {saved ? "★ Saved" : "☆ Save"}
            </button>
          )}
        </div>
        {summary.price_flag && (
          <p className="listing-card__price-flag">Price looks off — check with the agency</p>
        )}
        <p className="listing-card__address">{summary.address}</p>
        <p className="listing-card__rooms">
          {summary.bedrooms != null && <span>{summary.bedrooms} bed</span>}
          {summary.bathrooms != null && <span>{summary.bathrooms} bath</span>}
          {summary.receptions != null && <span>{summary.receptions} reception</span>}
        </p>
        {listing.description && (
          <p className="listing-card__description">{listing.description.slice(0, 140)}…</p>
        )}
      </div>
    </a>
  );
}
