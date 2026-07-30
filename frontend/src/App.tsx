import { useEffect, useMemo, useState } from "react";
import type { Listing } from "./types";
import { ListingCard } from "./components/ListingCard";
import "./App.css";

type SortKey = "price-asc" | "price-desc";

function App() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [agencyFilter, setAgencyFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/data/listings.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setListings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const agencies = useMemo(() => {
    if (!listings) return [];
    return [...new Set(listings.map((l) => l.agency_name))];
  }, [listings]);

  const visible = useMemo(() => {
    if (!listings) return [];
    let rows = listings;
    if (agencyFilter !== "all") rows = rows.filter((l) => l.agency_name === agencyFilter);
    return [...rows].sort((a, b) => {
      const pa = a.summary.price_pcm ?? Infinity;
      const pb = b.summary.price_pcm ?? Infinity;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });
  }, [listings, sort, agencyFilter]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>London Rentals — scraper preview</h1>
        <p className="app__subtitle">
          Raw scraped listings, no filtering/style-matching yet — this is just to see the data pipeline working end to end.
        </p>
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
          <label>
            Sort:{" "}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
        </div>
      </header>

      {error && <p className="app__error">Failed to load listings: {error}</p>}
      {!error && !listings && <p className="app__loading">Loading…</p>}

      <main className="listing-grid">
        {visible.map((listing) => (
          <ListingCard key={`${listing.summary.platform}-${listing.summary.source_id}`} listing={listing} />
        ))}
      </main>
    </div>
  );
}

export default App;
