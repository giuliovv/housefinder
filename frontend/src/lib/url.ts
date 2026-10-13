/** Homeflow serves protocol-relative image URLs ("//mr1.homeflow-assets.co.uk/...");
 * browsers resolve those fine against an https page, but be explicit rather
 * than rely on that implicitly. */
/** Hosts that answer a photo request carrying another site as referrer with a "STOP: hotlinked" picture. Photos are
 * requested without a referrer now, but browsers that already cached the stop picture under the plain URL keep
 * showing it, so these get a harmless extra query string: a new cache entry, the same image. */
const HOTLINK_PROTECTED = ["rlmorrisproperty.co.uk"];

export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const full = url.startsWith("//") ? `https:${url}` : url;
  try {
    const host = new URL(full).hostname;
    if (HOTLINK_PROTECTED.some((h) => host === h || host.endsWith(`.${h}`)) && !full.includes("?")) return `${full}?nr=1`;
  } catch {
    /* not a parseable url: leave it */
  }
  return full;
}
