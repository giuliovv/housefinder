/** Homeflow serves protocol-relative image URLs ("//mr1.homeflow-assets.co.uk/...");
 * browsers resolve those fine against an https page, but be explicit rather
 * than rely on that implicitly. */
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("//") ? `https:${url}` : url;
}
