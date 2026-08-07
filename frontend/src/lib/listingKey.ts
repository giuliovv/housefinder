import type { Listing, ListingKey } from "../types";

/** matches scraper/embeddings.py's _listing_key */
export function listingKey(listing: Listing): ListingKey {
  return `${listing.summary.platform}:${listing.summary.source_id}`;
}
