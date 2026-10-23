import type { Listing } from "../types";
import type { ListingGeo, LatLon } from "./geo";
import { inAnyShape } from "./geo";
import { listingKey } from "./listingKey";
import { matchesBedrooms } from "./bedrooms";
import { hasFeatures } from "./features";
import { latestDrop, type PriceHistory } from "./priceHistory";

export interface ZeroFilters {
  agency: string;
  minPrice: string;
  maxPrice: string;
  minBedrooms: string;
  maxBedrooms: string;
  minBathrooms: string;
  features: string[];
  shapes: LatLon[][];
}

export interface RemovalSuggestion { key: string; label: string; count: number }

/** Exact what-if counts, using the same predicates as Browse. Only called for an empty Board result set. */
export function removalSuggestions(listings: Listing[], filters: ZeroFilters, geo: ListingGeo, history: PriceHistory): RemovalSuggestion[] {
  const active: { key: string; label: string }[] = [];
  if (filters.maxPrice) active.push({ key: "maxPrice", label: "max price" });
  if (filters.minPrice) active.push({ key: "minPrice", label: "min price" });
  if (filters.minBedrooms !== "any" || filters.maxBedrooms !== "any") active.push({ key: "bedrooms", label: "bedroom range" });
  if (filters.minBathrooms !== "any") active.push({ key: "bathrooms", label: "bathrooms" });
  if (filters.agency !== "all") active.push({ key: "agency", label: "agency" });
  if (filters.shapes.length) active.push({ key: "area", label: "map area" });
  for (const feature of filters.features) active.push({ key: `feature:${feature}`, label: feature.replaceAll("_", " ") });

  const matches = (l: Listing, skip: string) => {
    if (skip !== "agency" && filters.agency !== "all" && l.agency_name !== filters.agency) return false;
    const price = l.summary.price_pcm;
    if (skip !== "minPrice" && filters.minPrice && (price === null || price < Number(filters.minPrice))) return false;
    if (skip !== "maxPrice" && filters.maxPrice && (price === null || price > Number(filters.maxPrice))) return false;
    if (skip !== "bedrooms" && !matchesBedrooms(l.summary.bedrooms, filters.minBedrooms, filters.maxBedrooms)) return false;
    if (skip !== "bathrooms" && filters.minBathrooms !== "any" && (l.summary.bathrooms === null || l.summary.bathrooms < Number(filters.minBathrooms))) return false;
    const required = filters.features.filter((key) => skip !== `feature:${key}`);
    if (required.length) {
      const have = [...(l.attributes?.amenities ?? []), ...(l.attributes?.seen_in_photos ?? [])];
      if (latestDrop(history[listingKey(l)])) have.push("price_dropped");
      if (!hasFeatures(have, required)) return false;
    }
    if (skip !== "area" && filters.shapes.length) {
      const point = geo[listingKey(l)];
      if (!point || !inAnyShape(point[0], point[1], filters.shapes)) return false;
    }
    return true;
  };

  return active.map(({ key, label }) => ({ key, label, count: listings.filter((l) => matches(l, key)).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}
