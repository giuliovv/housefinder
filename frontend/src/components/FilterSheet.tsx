import { FEATURES } from "../lib/features";
type SortKey = "price-asc" | "price-desc" | "match";

export function FilterSheet({
  open,
  onClose,
  agencies,
  agencyFilter,
  setAgencyFilter,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  minBedrooms,
  setMinBedrooms,
  maxBedrooms,
  setMaxBedrooms,
  features,
  setFeatures,
  minBathrooms,
  setMinBathrooms,
  sort,
  setSort,
  hasMatchScores,
  onClear,
  canClear,
}: {
  open: boolean;
  onClose: () => void;
  agencies: string[];
  agencyFilter: string;
  setAgencyFilter: (v: string) => void;
  minPrice: string;
  setMinPrice: (v: string) => void;
  maxPrice: string;
  setMaxPrice: (v: string) => void;
  minBedrooms: string;
  setMinBedrooms: (v: string) => void;
  maxBedrooms: string;
  setMaxBedrooms: (v: string) => void;
  features: string[];
  setFeatures: (v: string[]) => void;
  minBathrooms: string;
  setMinBathrooms: (v: string) => void;
  sort: SortKey;
  setSort: (v: SortKey) => void;
  hasMatchScores: boolean;
  onClear: () => void;
  canClear: boolean;
}) {
  if (!open) return null;

  return (
    <div className="sheet__overlay" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <p className="sheet__title">Filters</p>
          <button className="sheet__close" onClick={onClose}>Close</button>
        </div>

        <p className="sheet__label">Price (pcm)</p>
        <div className="sheet__row">
          <input
            className="sheet__input"
            type="number"
            min={0}
            placeholder="No min"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
          />
          <input
            className="sheet__input"
            type="number"
            min={0}
            placeholder="No max"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
          />
        </div>

        <p className="sheet__label">Minimum bedrooms</p>
        <div className="sheet__row sheet__row--wrap">
          {["any", 1, 2, 3, 4].map((v) => (
            <button
              key={v}
              className={`sheet__opt ${minBedrooms === String(v) ? "sheet__opt--active" : ""}`}
              onClick={() => setMinBedrooms(String(v))}
            >
              {v === "any" ? "Any" : `${v}+`}
            </button>
          ))}
        </div>

        <p className="sheet__label">Maximum bedrooms</p>
        <div className="sheet__row sheet__row--wrap">
          {["any", 1, 2, 3, 4].map((v) => (
            <button
              key={v}
              className={`sheet__opt ${maxBedrooms === String(v) ? "sheet__opt--active" : ""}`}
              onClick={() => setMaxBedrooms(String(v))}
            >
              {v === "any" ? "Any" : `Up to ${v}`}
            </button>
          ))}
        </div>

        <p className="sheet__label">Must have</p>
        <div className="sheet__row sheet__row--wrap">
          {FEATURES.map((f) => (
            <button
              key={f.key}
              className={`sheet__opt ${features.includes(f.key) ? "sheet__opt--active" : ""}`}
              onClick={() => setFeatures(features.includes(f.key) ? features.filter((k) => k !== f.key) : [...features, f.key])}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="sheet__hint">From each listing's text, plus gardens, terraces and balconies spotted in its photos. A home that shows none of it isn't listed.</p>

        <p className="sheet__label">Minimum bathrooms</p>
        <div className="sheet__row sheet__row--wrap">
          {["any", 1, 2, 3].map((v) => (
            <button
              key={v}
              className={`sheet__opt ${minBathrooms === String(v) ? "sheet__opt--active" : ""}`}
              onClick={() => setMinBathrooms(String(v))}
            >
              {v === "any" ? "Any" : `${v}+`}
            </button>
          ))}
        </div>

        <p className="sheet__label">Agency</p>
        <div className="sheet__row sheet__row--wrap">
          <button
            className={`sheet__opt ${agencyFilter === "all" ? "sheet__opt--active" : ""}`}
            onClick={() => setAgencyFilter("all")}
          >
            All
          </button>
          {agencies.map((a) => (
            <button
              key={a}
              className={`sheet__opt ${agencyFilter === a ? "sheet__opt--active" : ""}`}
              onClick={() => setAgencyFilter(a)}
            >
              {a}
            </button>
          ))}
        </div>

        <p className="sheet__label">Sort</p>
        <div className="sheet__row sheet__row--col">
          {hasMatchScores && (
            <button
              className={`sheet__opt ${sort === "match" ? "sheet__opt--active" : ""}`}
              onClick={() => setSort("match")}
            >
              Best match to your style
            </button>
          )}
          <button
            className={`sheet__opt ${sort === "price-asc" ? "sheet__opt--active" : ""}`}
            onClick={() => setSort("price-asc")}
          >
            Price: low to high
          </button>
          <button
            className={`sheet__opt ${sort === "price-desc" ? "sheet__opt--active" : ""}`}
            onClick={() => setSort("price-desc")}
          >
            Price: high to low
          </button>
        </div>

        {canClear && (
          <button className="sheet__clear" onClick={onClear}>
            Clear all filters
          </button>
        )}
        <button className="sheet__apply" onClick={onClose}>Show homes</button>
      </div>
    </div>
  );
}
