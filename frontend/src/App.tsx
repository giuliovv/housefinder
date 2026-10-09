import { useEffect, useMemo, useRef, useState } from "react";
import type { Listing, StyleLabel } from "./types";
import { loadEmbeddingStore, type EmbeddingStore } from "./lib/embeddingStore";
import { ListingCard } from "./components/ListingCard";
import { SwipeDeck } from "./components/SwipeDeck";
import { DrawMap } from "./components/DrawMap";
import { inAnyShape, type LatLon, type ListingGeo } from "./lib/geo";
import { FilterSheet } from "./components/FilterSheet";
import { LoadingMessage } from "./components/LoadingMessage";
import { TasteMeter } from "./components/TasteMeter";
import { useStylePreferences } from "./lib/preferences";
import { listingKey } from "./lib/listingKey";
import { topStyleLabels } from "./lib/similarity";
import "./App.css";

type SortKey = "price-asc" | "price-desc" | "match";
type Tab = "browse" | "style";

// Browse renders cards in pages: thousands of cards (each with a photo strip)
// at once would make the page crawl.
const PAGE_SIZE = 40;

function App() {
  const [allListings, setAllListings] = useState<Listing[] | null>(null);
  const [store, setStore] = useState<EmbeddingStore | null>(null);
  const [geo, setGeo] = useState<ListingGeo>({});
  const [styleLabels, setStyleLabels] = useState<StyleLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [styleFailed, setStyleFailed] = useState(false);
  const [deadPhotos, setDeadPhotos] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [shapes, setShapes] = useState<LatLon[][]>([]);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minBedrooms, setMinBedrooms] = useState<string>("any");
  const [minBathrooms, setMinBathrooms] = useState<string>("any");
  const [tab, setTab] = useState<Tab>("style");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [areaPanelOpen, setAreaPanelOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const resultsRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    fetch("/data/listings.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setAllListings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));

    // The style data is optional — the app still works (minus style-matching)
    // if this fails or hasn't been generated yet, so failures here don't set
    // the page-level error state.
    loadEmbeddingStore()
      .then(setStore)
      .catch((err) => {
        console.error("style data failed to load", err);
        setStyleFailed(true);
      });

    // Photo URLs the agencies have deleted (built by the pipeline); optional, and kept
    // out of the style store so a failure there can't hide this too.
    fetch("/data/dead-photos.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((urls: string[]) => setDeadPhotos(new Set(urls)))
      .catch(() => setDeadPhotos(new Set()));

    // Where each home is — without it there is simply no draw-an-area filter.
    fetch("/data/listing-geo.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then(setGeo)
      .catch(() => setGeo({}));

    // Also optional — without it the preference vector still works for
    // ranking, it just can't be described in words.
    fetch("/data/style-labels.json")
      .then((res) => (res.ok ? res.json() : []))
      .then(setStyleLabels)
      .catch(() => setStyleLabels([]));
  }, []);

  // Browse only shows listings we can say are still available. Let ones and
  // ones we can't currently verify stay in `allListings` so the style-swipe
  // deck can still show their photos (it only needs how a place looks).
  const listings = useMemo(
    () => (allListings ? allListings.filter((l) => !l.off_market && !l.unverified) : null),
    [allListings],
  );

  // back to the first page whenever the filters/sort change (but not when a
  // rating re-ranks the list — that would yank the user back up mid-scroll)
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [agencyFilter, shapes, minPrice, maxPrice, minBedrooms, minBathrooms, sort]);

  const { undecided, markBroken, hidePhoto, swipes, swipe, toggleSwipe, reset, preferenceVector, tasteRead, matchScores, likedCount, dislikedCount } = useStylePreferences(store);

  const styleDescription = useMemo(() => {
    if (!preferenceVector || styleLabels.length === 0) return null;
    return topStyleLabels(preferenceVector, styleLabels, 3);
  }, [preferenceVector, styleLabels]);

  const listingsByKey = useMemo(() => {
    const map: Record<string, Listing> = {};
    for (const l of allListings ?? []) map[listingKey(l)] = l;
    return map;
  }, [allListings]);

  const agencies = useMemo(() => {
    if (!listings) return [];
    return [...new Set(listings.map((l) => l.agency_name))];
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

  // dots for the map: every home passing the other filters (the drawn area is what narrows them)
  const mapPoints = useMemo(
    () =>
      preAreaFiltered.flatMap((l) => {
        const g = geo[listingKey(l)];
        return g ? [{ lat: g[0], lon: g[1], approx: g[2] === "a" }] : [];
      }),
    [preAreaFiltered, geo],
  );

  const visible = useMemo(() => {
    let rows = preAreaFiltered;
    if (shapes.length > 0) {
      rows = rows.filter((l) => {
        const g = geo[listingKey(l)];
        return g !== undefined && inAnyShape(g[0], g[1], shapes);
      });
    }
    return [...rows].sort((a, b) => {
      if (sort === "match" && matchScores) {
        const sa = matchScores[listingKey(a)] ?? -Infinity;
        const sb = matchScores[listingKey(b)] ?? -Infinity;
        return sb - sa;
      }
      // listings without a (trustworthy) price go last whichever way we sort
      const pa = a.summary.price_pcm;
      const pb = b.summary.price_pcm;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });
  }, [preAreaFiltered, sort, shapes, geo, matchScores]);

  // Once a preference exists, default to showing matches first rather than
  // making the user notice the new sort option themselves. Depends on the
  // null->non-null transition specifically, not matchScores itself —
  // otherwise this would force sort back to "match" on every single swipe,
  // overriding a user who deliberately switched to price sort mid-session.
  const hasPreference = matchScores !== null;
  useEffect(() => {
    if (hasPreference) setSort("match");
  }, [hasPreference]);

  function clearFilters() {
    setShapes([]);
    setAgencyFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setMinBedrooms("any");
    setMinBathrooms("any");
  }

  // Closing the filter sheet brings the results into view: the map and area
  // chips sit above the list, so otherwise the list changes out of sight and
  // nothing visibly happens.
  function closeFilterSheet() {
    setFilterSheetOpen(false);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // what `visible` actually does: "match" only sorts by match once there is a preference
  const effectiveSort: SortKey = sort === "match" && !matchScores ? "price-asc" : sort;

  const activeFilterCount =
    (shapes.length > 0 ? 1 : 0) +
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

      {error && <p className="app__error">Couldn't load the homes just now — give it a refresh in a moment.</p>}
      {!error && !listings && tab === "browse" && <LoadingMessage kind="listings" />}

      {tab === "style" && store && (
        <SwipeDeck
          undecided={undecided}
          listingsByKey={listingsByKey}
          likedCount={likedCount}
          dislikedCount={dislikedCount}
          totalCount={undecided.length + likedCount + dislikedCount}
          onSwipe={swipe}
          onReset={reset}
          onGoBrowse={() => setTab("browse")}
          styleDescription={styleDescription}
          tasteRead={tasteRead}
          onBroken={markBroken}
          onHide={hidePhoto}
        />
      )}
      {tab === "style" && !store && !styleFailed && <LoadingMessage kind="style" />}
      {tab === "style" && styleFailed && (
        <p className="app__error">Couldn't load the style cards just now — you can still browse; try a refresh in a moment.</p>
      )}

      {tab === "browse" && (
        <div className="app__browse">
          <div className="app__filter-row">
            <button className="app__filter-btn" onClick={() => setFilterSheetOpen(true)}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {Object.keys(geo).length > 0 && (
              <button
                className={`app__filter-btn ${areaPanelOpen ? "app__filter-btn--on" : ""}`}
                onClick={() => setAreaPanelOpen((open) => !open)}
                aria-expanded={areaPanelOpen}
              >
                Map{shapes.length > 0 ? ` (${shapes.length})` : ""}
              </button>
            )}
            <span className="app__result-count" role="status" aria-live="polite">
              {visible.length} {visible.length === 1 ? "home" : "homes"}
            </span>
            {activeFilterCount > 0 && (
              <button className="app__clear-btn" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>

          {areaPanelOpen && (
            <div className="app__area-panel">
              <div className="app__draw-bar">
                <button
                  className={`app__draw-btn ${drawing ? "app__draw-btn--on" : ""}`}
                  onClick={() => setDrawing((d) => !d)}
                >
                  {drawing ? "Done drawing" : "✎ Draw your area"}
                </button>
                {shapes.length > 0 && (
                  <button className="app__clear-btn" onClick={() => setShapes([])}>
                    Remove {shapes.length === 1 ? "outline" : "outlines"}
                  </button>
                )}
              </div>
              <p className="app__map-hint">
                {drawing
                  ? "Drag a finger around the area you like, then lift. Draw as many outlines as you want."
                  : "Each dot is a home. Press “Draw your area”, then circle where you'd like to live."}
              </p>
              <DrawMap
                points={mapPoints}
                shapes={shapes}
                drawing={drawing}
                onShape={(ring) => setShapes((cur) => [...cur, ring])}
              />
            </div>
          )}

          <p className="app__sort-note" ref={resultsRef}>
            Showing {visible.length} of {listings?.length ?? 0} listings
            {effectiveSort === "match"
              ? ` — sorted by your style preference from ${likedCount} liked / ${dislikedCount} disliked photos.`
              : effectiveSort === "price-asc"
                ? " — cheapest first."
                : " — most expensive first."}
          </p>
          {styleDescription && (
            <p className="app__style-note">Your style so far: {styleDescription.join(" · ")}</p>
          )}
          <TasteMeter read={tasteRead} compact />

          <main className="listing-grid">
            {visible.slice(0, shownCount).map((listing) => (
              <ListingCard
                key={`${listing.summary.platform}-${listing.summary.source_id}`}
                listing={listing}
                matchScore={matchScores?.[listingKey(listing)]}
                store={store}
                deadPhotos={deadPhotos}
                swipes={swipes}
                onRate={toggleSwipe}
              />
            ))}
          </main>
          {shownCount < visible.length && (
            <button className="app__show-more" onClick={() => setShownCount((n) => n + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, visible.length - shownCount)} more ({visible.length - shownCount} left)
            </button>
          )}
        </div>
      )}

      <FilterSheet
        open={filterSheetOpen}
        onClose={closeFilterSheet}
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
