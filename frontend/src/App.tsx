import { useEffect, useMemo, useState } from "react";
import type { EmbeddingsData, Listing } from "./types";
import { ListingCard } from "./components/ListingCard";
import { SwipeDeck } from "./components/SwipeDeck";
import { useStylePreferences } from "./lib/preferences";
import { extractPostcodeArea } from "./lib/location";
import "./App.css";

type SortKey = "price-asc" | "price-desc" | "match";
type Tab = "browse" | "style";

function listingKey(listing: Listing): string {
  return `${listing.summary.platform}:${listing.summary.source_id}`;
}

function App() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [embeddings, setEmbeddings] = useState<EmbeddingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");
  const [areaFilters, setAreaFilters] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minBedrooms, setMinBedrooms] = useState<string>("any");
  const [minBathrooms, setMinBathrooms] = useState<string>("any");
  const [tab, setTab] = useState<Tab>("browse");

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
  }, []);

  const { undecided, swipe, reset, matchScores, likedCount, dislikedCount } = useStylePreferences(embeddings);

  const agencies = useMemo(() => {
    if (!listings) return [];
    return [...new Set(listings.map((l) => l.agency_name))];
  }, [listings]);

  const areas = useMemo(() => {
    if (!listings) return [];
    const found = listings.map((l) => extractPostcodeArea(l.summary.address)).filter((a): a is string => a !== null);
    return [...new Set(found)].sort();
  }, [listings]);

  const visible = useMemo(() => {
    if (!listings) return [];
    let rows = listings;
    if (agencyFilter !== "all") rows = rows.filter((l) => l.agency_name === agencyFilter);
    if (areaFilters.length > 0) {
      const wanted = new Set(areaFilters);
      rows = rows.filter((l) => {
        const area = extractPostcodeArea(l.summary.address);
        return area !== null && wanted.has(area);
      });
    }
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
  }, [listings, sort, agencyFilter, areaFilters, minPrice, maxPrice, minBedrooms, minBathrooms, matchScores]);

  // Once a preference exists, default to showing matches first rather than
  // making the user notice the new sort option themselves. Depends on the
  // null->non-null transition specifically, not matchScores itself —
  // otherwise this would force sort back to "match" on every single swipe,
  // overriding a user who deliberately switched to price sort mid-session.
  const hasPreference = matchScores !== null;
  useEffect(() => {
    if (hasPreference) setSort("match");
  }, [hasPreference]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>House Finder</h1>
        <p className="app__subtitle">
          Scraped listings + CLIP-based style matching — swipe on interior photos, then browse ranked by how well
          each listing matches what you liked.
        </p>

        <div className="app__tabs">
          <button
            className={`app__tab ${tab === "browse" ? "app__tab--active" : ""}`}
            onClick={() => setTab("browse")}
          >
            Browse ({listings?.length ?? 0})
          </button>
          <button className={`app__tab ${tab === "style" ? "app__tab--active" : ""}`} onClick={() => setTab("style")}>
            Find your style {embeddings ? `(${undecided.length} left)` : ""}
          </button>
        </div>

        {tab === "browse" && (
          <div className="app__controls">
            <label>
              Agency:{" "}
              <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}>
                <option value="all">All ({listings?.length ?? 0})</option>
                {agencies.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="app__area-filter">
              Area (ctrl/cmd-click for multiple):{" "}
              <select
                multiple
                size={Math.min(6, areas.length || 1)}
                value={areaFilters}
                onChange={(e) =>
                  setAreaFilters(Array.from(e.target.selectedOptions, (o) => o.value))
                }
              >
                {areas.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {areaFilters.length > 0 && (
                <button type="button" className="app__clear-areas" onClick={() => setAreaFilters([])}>
                  Clear ({areaFilters.length})
                </button>
              )}
            </label>
            <label>
              Min price (pcm):{" "}
              <input
                type="number"
                min={0}
                placeholder="No min"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </label>
            <label>
              Max price (pcm):{" "}
              <input
                type="number"
                min={0}
                placeholder="No max"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </label>
            <label>
              Bedrooms:{" "}
              <select value={minBedrooms} onChange={(e) => setMinBedrooms(e.target.value)}>
                <option value="any">Any</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}+</option>
                ))}
              </select>
            </label>
            <label>
              Bathrooms:{" "}
              <select value={minBathrooms} onChange={(e) => setMinBathrooms(e.target.value)}>
                <option value="any">Any</option>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}+</option>
                ))}
              </select>
            </label>
            <label>
              Sort:{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {matchScores && <option value="match">Best match to your style</option>}
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
              </select>
            </label>
          </div>
        )}
        {tab === "browse" && (
          <p className="app__sort-note">
            Showing {visible.length} of {listings?.length ?? 0} listings
            {matchScores ? ` — sorted by your style preference from ${likedCount} liked / ${dislikedCount} disliked photos.` : "."}
          </p>
        )}
      </header>

      {error && <p className="app__error">Failed to load listings: {error}</p>}
      {!error && !listings && <p className="app__loading">Loading…</p>}

      {tab === "style" && embeddings && (
        <SwipeDeck
          undecided={undecided}
          likedCount={likedCount}
          dislikedCount={dislikedCount}
          totalCount={undecided.length + likedCount + dislikedCount}
          onSwipe={swipe}
          onReset={reset}
        />
      )}
      {tab === "style" && !embeddings && (
        <p className="app__loading">Loading style data… (or it hasn't been generated yet — see scraper/embeddings.py)</p>
      )}

      {tab === "browse" && (
        <main className="listing-grid">
          {visible.map((listing) => (
            <ListingCard
              key={`${listing.summary.platform}-${listing.summary.source_id}`}
              listing={listing}
              matchScore={matchScores?.[listingKey(listing)]}
            />
          ))}
        </main>
      )}
    </div>
  );
}

export default App;
