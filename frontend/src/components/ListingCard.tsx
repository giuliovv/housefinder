import { useState } from "react";
import type { Listing } from "../types";
import { normalizeImageUrl } from "../lib/url";

export function ListingCard({ listing }: { listing: Listing }) {
  const { summary } = listing;
  const photos = listing.photo_urls.length > 0
    ? listing.photo_urls
    : [summary.thumbnail_url].filter((u): u is string => Boolean(u));
  const [photoIndex, setPhotoIndex] = useState(0);
  const currentPhoto = normalizeImageUrl(photos[photoIndex]);

  function nextPhoto(e: React.MouseEvent) {
    e.preventDefault();
    setPhotoIndex((i) => (i + 1) % photos.length);
  }

  function prevPhoto(e: React.MouseEvent) {
    e.preventDefault();
    setPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
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
