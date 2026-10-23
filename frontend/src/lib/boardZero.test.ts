import { describe, expect, it } from "vitest";
import type { Listing } from "../types";
import { removalSuggestions, type ZeroFilters } from "./boardZero";

const listing = (price: number, agency: string) => ({ agency_name: agency, summary: { platform: "x", source_id: `${price}-${agency}`, price_pcm: price, bedrooms: 2, bathrooms: 1 } }) as Listing;
const base: ZeroFilters = { agency: "all", minPrice: "", maxPrice: "", minBedrooms: "any", maxBedrooms: "any", minBathrooms: "any", features: [], shapes: [] };

describe("removalSuggestions", () => {
  it("counts results gained by removing one filter at a time", () => {
    const suggestions = removalSuggestions([listing(2200, "A"), listing(2600, "B")], { ...base, agency: "A", maxPrice: "2000" }, {}, {});
    expect(suggestions).toEqual([{ key: "maxPrice", label: "max price", count: 1 }]);
  });
  it("returns no misleading suggestions if the catalogue itself is empty", () => {
    expect(removalSuggestions([], { ...base, maxPrice: "2000" }, {}, {})).toEqual([]);
  });
});
