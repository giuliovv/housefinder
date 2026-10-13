/** Features a person can require in Browse. They are detected from the listing's own text (scraper/attributes.py), so a
 * home that doesn't mention a feature is treated as not having it. */
export const FEATURES = [
  { key: "garden", label: "Garden" },
  { key: "terrace", label: "Terrace" },
  { key: "balcony", label: "Balcony" },
  { key: "parking", label: "Parking" },
  { key: "lift", label: "Lift" },
  { key: "pets", label: "Pets OK" },
  { key: "price_dropped", label: "Price dropped" }, // from the price history, not the listing text
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];

/** every selected feature must be present */
export function hasFeatures(amenities: string[] | undefined, required: string[]): boolean {
  if (required.length === 0) return true;
  const have = new Set(amenities ?? []);
  return required.every((f) => have.has(f));
}
