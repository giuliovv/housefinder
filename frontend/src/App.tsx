import { useEffect, useMemo, useState } from "react";
import type { AreaCentroids, EmbeddingsData, Listing } from "./types";
import { ListingCard } from "./components/ListingCard";
import { SwipeDeck } from "./components/SwipeDeck";
import { NeighbourhoodMap } from "./components/NeighbourhoodMap";
import { FilterSheet } from "./components/FilterSheet";
import { useStylePreferences } from "./lib/preferences";
import { extractPostcodeArea } from "./lib/location";
import { listingKey } from "./lib/listingKey";
import "./App.css";

type SortKey = "price-asc" | "price-desc" | "match";
type Tab = "browse" | "style";

function App() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [embeddings, setEmbeddings] = useState<EmbeddingsData | null>(null);
  const [areaCentroids, setAreaCentroids] = useState<AreaCentroids>({});
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [areaFilters, setAreaFilters] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minBedrooms, setMinBedrooms] = useState<string>("any");
  const [minBathrooms, setMinBathrooms] = useState<string>("any");
  const [tab, setTab] = useState<Tab>("style");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    fetch("/data/listings.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    // Embeddings are optional — the app still works (minus style-matching)
    // if this fails or hasn't been generated yet, so failures here don't
    // set the page-level error state.
    fetch("/data/embeddings.json")
      .then((res) => (res.ok ? res.json() : null))
      .then(setEmbeddings)
      .catch(() => setEmbeddings(null));

    // Same deal — the map is a nice-to-have on top of the area filter,
    // which already works without it via the chips.
    fetch("/data/area-centroids.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then(setAreaCentroids)
      .catch(() => setAreaCentroids({}));
  }, []);

  const { undecided, swipes, swipe, toggleSwipe, reset, matchScores, likedCount, dislikedCount } = useStylePreferences(embeddings);

  const listingsByKey = useMemo(() => {
    const map: Record<string, Listing> = {};
    for (const l of listings ?? []) map[listingKey(l)] = l;
    return map;
  }, [listings]);

  const agencies = useMemo(() => {
    if (!listings) return [];
    return [...new Set(listings.map((l) => l.agency_name))];
  }, [listings]);

  const areas = useMemo(() => {
    if (!listings) return [];
    const found = listings.map((l) => extractPostcodeArea(l.summary.address)).filter((a): a is string => a !== null);
    return [...new Set(found)].sort();
  }, [listings]);

  // Everything except the area filter — used both as the base for the area
  // filter itself and to compute per-area counts for the map, so the map
  // reflects "how many results would this area add given my other filters"
  // rather than raw unfiltered counts.
  const preAreaFiltered = useMemo(() => {
    if (!listings) return [];
    let rows = listings;
    if (agencyFilter !== "all") rows = rows.filter((l) => l.agency_name === agencyFilter);
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    if (min !== null) rows = rows.filter((l) => l.summary.price_pcm !== null && l.summary.price_pcm >= min);
    if (max !== null) rows = rows.filter((l) => l.summary.price_pcm !== null && l.summary.price_pcm <= max);
    if (minBedrooms !== "any") {
      const n = Number(minBedrooms);
      rows = rows.filter((l) => l.summary.bedrooms !== null && l.summary.bedrooms >= n);
    }
    if (minBathrooms !== "any") {
      const n = Number(minBathrooms);
      rows = rows.filter((l) => l.summary.bathrooms !== null && l.summary.bathrooms >= n);
    }
    return rows;
  }, [listings, agencyFilter, minPrice, maxPrice, minBedrooms, minBathrooms]);

  const areaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const l of preAreaFiltered) {
      const area = extractPostcodeArea(l.summary.address);
      if (area !== null) counts[area] = (counts[area] ?? 0) + 1;
    }
    return counts;
  }, [preAreaFiltered]);

  const visible = useMemo(() => {
    let rows = preAreaFiltered;
    if (areaFilters.length > 0) {
      const wanted = new Set(areaFilters);
      rows = rows.filter((l) => {
        const area = extractPostcodeArea(l.summary.address);
        return area !== null && wanted.has(area);
      });
    }
    return [...rows].sort((a, b) => {
      if (sort === "match" && matchScores) {
        const sa = matchScores[listingKey(a)] ?? -Infinity;
        const sb = matchScores[listingKey(b)] ?? -Infinity;
        return sb - sa;
      }
      const pa = a.summary.price_pcm ?? Infinity;
      const pb = b.summary.price_pcm ?? Infinity;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });
  }, [preAreaFiltered, sort, areaFilters, matchScores]);

  function toggleArea(area: string) {
    setAreaFilters((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area]
    );
  }

  // Once a preference exists, default to showing matches first rather than
  // making the user notice the new sort option themselves. Depends on the
  // null->non-null transition specifically, not matchScores itself —
  // otherwise this would force sort back to "match" on every single swipe,
  // overriding a user who deliberately switched to price sort mid-session.
  const hasPreference = matchScores !== null;
  useEffect(() => {
    if (hasPreference) setSort("match");
  }, [hasPreference]);

  const activeFilterCount =
    (areaFilters.length > 0 ? 1 : 0) +
    (agencyFilter !== "all" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (minBedrooms !== "any" ? 1 : 0) +
    (minBathrooms !== "any" ? 1 : 0);

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-row">
          <h1>House Finder</h1>
          <span className="app__eyebrow">London Lettings</span>
        </div>
        <p className="app__subtitle">Swipe on interiors to teach us your taste, then browse listings ranked to match.</p>

        <div className="app__tabs">
          <button className={`app__tab ${tab === "style" ? "app__tab--active" : ""}`} onClick={() => setTab("style")}>
            Find your style
          </button>
          <button className={`app__tab ${tab === "browse" ? "app__tab--active" : ""}`} onClick={() => setTab("browse")}>
            Browse {listings ? `(${listings.length})` : ""}
          </button>
        </div>
      </header>

      {error && <p className="app__error">Failed to load listings: {error}</p>}
      {!error && !listings && <p className="app__loading">Loading…</p>}

      {tab === "style" && embeddings && (
        <SwipeDeck
          undecided={undecided}
          listingsByKey={listingsByKey}
          likedCount={likedCount}
          dislikedCount={dislikedCount}
          totalCount={undecided.length + likedCount + dislikedCount}
          onSwipe={swipe}
          onReset={reset}
          onGoBrowse={() => setTab("browse")}
        />
      )}
      {tab === "style" && !embeddings && (
        <p className="app__loading">Loading style data… (or it hasn't been generated yet — see scraper/embeddings.py)</p>
      )}

      {tab === "browse" && (
        <div className="app__browse">
          {Object.keys(areaCentroids).length > 0 && (
            <NeighbourhoodMap
              centroids={areaCentroids}
              counts={areaCounts}
              selected={areaFilters}
              onToggle={toggleArea}
            />
          )}
          <p className="app__map-hint">Tap a neighbourhood on the map or a chip below to filter by area.</p>

          <div className="app__filter-row">
            <button className="app__filter-btn" onClick={() => setFilterSheetOpen(true)}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
          </div>

          <div className="app__chip-row">
            {areas.map((area) => (
              <button
                key={area}
                className={`app__chip ${areaFilters.includes(area) ? "app__chip--active" : ""}`}
                onClick={() => toggleArea(area)}
              >
                {area}
              </button>
            ))}
          </div>

          <p className="app__sort-note">
            Showing {visible.length} of {listings?.length ?? 0} listings
            {matchScores ? ` — sorted by your style preference from ${likedCount} liked / ${dislikedCount} disliked photos.` : "."}
          </p>

          <main className="listing-grid">
            {visible.map((listing) => (
              <ListingCard
                key={`${listing.summary.platform}-${listing.summary.source_id}`}
                listing={listing}
                matchScore={matchScores?.[listingKey(listing)]}
                embeddings={embeddings}
                swipes={swipes}
                onRate={toggleSwipe}
              />
            ))}
          </main>
        </div>
      )}

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        agencies={agencies}
        agencyFilter={agencyFilter}
        setAgencyFilter={setAgencyFilter}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        minBedrooms={minBedrooms}
        setMinBedrooms={setMinBedrooms}
        minBathrooms={minBathrooms}
        setMinBathrooms={setMinBathrooms}
        sort={sort}
        setSort={setSort}
        hasMatchScores={matchScores !== null}
      />
    </div>
  );
}

export default App;
