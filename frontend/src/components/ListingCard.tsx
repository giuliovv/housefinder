import { useState } from "react";
import type { EmbeddingsData, Listing } from "../types";
import type { SwipeChoice } from "../lib/preferences";
import { normalizeImageUrl } from "../lib/url";
import { listingKey } from "../lib/listingKey";

export function ListingCard({
  listing,
  matchScore,
  embeddings,
  swipes,
  onRate,
}: {
  listing: Listing;
  matchScore?: number;
  embeddings?: EmbeddingsData | null;
  swipes?: Record<string, SwipeChoice>;
  onRate?: (photoId: string, choice: SwipeChoice) => void;
}) {
  const { summary } = listing;
  const photos = listing.photo_urls.length > 0
    ? listing.photo_urls
    : [summary.thumbnail_url].filter((u): u is string => Boolean(u));
  const [photoIndex, setPhotoIndex] = useState(0);
  const rawCurrentPhoto = photos[photoIndex];
  const currentPhoto = normalizeImageUrl(rawCurrentPhoto);

  // Only photos that were actually CLIP-embedded can be rated (in practice
  // this is every photo, up to scraper/embeddings.py's MAX_PHOTOS_PER_LISTING
  // safety ceiling) — rating only makes sense for a photo that has an
  // embedding to feed into the preference vector, so buttons are hidden
  // otherwise rather than silently recording a swipe that never affects
  // match scores.
  const embeddedUrls = embeddings?.[listingKey(listing)]?.photos.map((p) => p.url);
  const canRate = onRate != null && embeddedUrls != null && rawCurrentPhoto != null && embeddedUrls.includes(rawCurrentPhoto);
  const photoId = rawCurrentPhoto != null ? `${listingKey(listing)}::${rawCurrentPhoto}` : null;
  const currentChoice = photoId != null ? swipes?.[photoId] : undefined;

  function nextPhoto(e: React.MouseEvent) {
    e.preventDefault();
    setPhotoIndex((i) => (i + 1) % photos.length);
  }

  function prevPhoto(e: React.MouseEvent) {
    e.preventDefault();
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  }

  function rate(e: React.MouseEvent, choice: SwipeChoice) {
    e.preventDefault();
    e.stopPropagation();
    if (photoId != null) onRate?.(photoId, choice);
  }

  return (
    <a className="listing-card" href={summary.url} target="_blank" rel="noreferrer">
      <div className="listing-card__photo-wrap">
        {currentPhoto ? (
          <img className="listing-card__photo" src={currentPhoto} alt={summary.address} loading="lazy" />
        ) : (
          <div className="listing-card__photo listing-card__photo--placeholder">No photo</div>
        )}

        {photos.length > 1 && (
          <>
            <button className="listing-card__nav listing-card__nav--prev" onClick={prevPhoto} aria-label="Previous photo">
              ‹
            </button>
            <button className="listing-card__nav listing-card__nav--next" onClick={nextPhoto} aria-label="Next photo">
              ›
            </button>
            <span className="listing-card__photo-count">
              {photoIndex + 1} / {photos.length}
            </span>
          </>
        )}

        {summary.status && <span className="listing-card__status">{summary.status}</span>}
        <span className="listing-card__agency">{listing.agency_name}</span>
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
        <p className="listing-card__price">{summary.price_text}</p>
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
