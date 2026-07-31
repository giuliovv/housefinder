/** Addresses are comma-separated free text ending in a UK postcode outward
 * code, e.g. "Royal Mint Street, Tower Hill, London, E1" -> "E1". Not a full
 * postcode (agencies never show the inward code on listing pages), but the
 * outward code alone is what people mean by "area" anyway.
 */
const OUTWARD_CODE_RE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export function extractPostcodeArea(address: string): string | null {
  const last = address.split(",").pop()?.trim().toUpperCase();
  return last && OUTWARD_CODE_RE.test(last) ? last : null;
}
