import { useEffect, useMemo, useState } from "react";
import type { Listing } from "../types";
import { loadEmbeddingStore, type EmbeddingStore } from "../lib/embeddingStore";
import { useStylePreferences } from "../lib/preferences";
import { useShortlist } from "../lib/useShortlist";
import { listingKey } from "../lib/listingKey";
import type { ListingGeo } from "../lib/geo";

/**
 * Everything the design experiments share: the same data, the same taste model and the same saved list as the real app,
 * so a swipe made in one design counts in all of them. The designs only differ in how they show it and ask for input.
 */
export function useLab() {
  const [store, setStore] = useState<EmbeddingStore | null>(null);
  const [rankingReady, setRankingReady] = useState(false);
  const [raw, setRaw] = useState<Listing[] | null>(null);
  const [killed, setKilled] = useState<string[]>([]);
  const [geo, setGeo] = useState<ListingGeo>({});

  useEffect(() => {
    loadEmbeddingStore().then(setStore).catch((e) => console.error("style data failed", e));
    fetch("/data/browse.json").then((r) => r.json()).then(setRaw).catch((e) => console.error("listings failed", e));
    fetch("/killswitch.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { disabled: [] }))
      .then((k) => setKilled(Array.isArray(k?.disabled) ? k.disabled.map(String) : []))
      .catch(() => undefined);
    fetch("/data/listing-geo.json").then((r) => (r.ok ? r.json() : {})).then(setGeo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!store) return;
    store.ensureRanking().then(() => setRankingReady(true)).catch((e) => console.error("ranking failed", e));
  }, [store]);

  const prefs = useStylePreferences(store, rankingReady);

  const listings = useMemo(
    () => (raw ? raw.filter((l) => !l.off_market && !l.unverified && !killed.includes(l.summary.agency) && l.photo_urls.length > 0) : null),
    [raw, killed],
  );
  const byKey = useMemo(() => {
    const m: Record<string, Listing> = {};
    for (const l of raw ?? []) m[listingKey(l)] = l;
    return m;
  }, [raw]);
  const shortlist = useShortlist(byKey);

  /** best matches first when the person has taught us anything; otherwise newest first */
  const ranked = useMemo(() => {
    if (!listings) return [];
    const s = prefs.matchScores;
    return [...listings].sort((a, b) => (s ? (s[listingKey(b)] ?? -9) - (s[listingKey(a)] ?? -9) : (b.first_seen ?? "").localeCompare(a.first_seen ?? "")));
  }, [listings, prefs.matchScores]);

  return { store, rankingReady, listings, ranked, byKey, geo, shortlist, ...prefs, swipeCount: prefs.likedCount + prefs.dislikedCount };
}
export type Lab = ReturnType<typeof useLab>;

/** 0..1 for display; scores are cosine similarities that rarely leave about -0.1..0.5 */
export function matchPct(score: number | undefined): number | null {
  if (score === undefined || !Number.isFinite(score)) return null;
  return Math.round(Math.max(0, Math.min(1, (score + 0.05) / 0.5)) * 100);
}

export function money(l: Listing): string {
  return l.summary.price_pcm ? `£${l.summary.price_pcm.toLocaleString("en-GB")}` : l.summary.price_text || "Price on request";
}

export function bedsLabel(l: Listing): string {
  const b = l.summary.bedrooms;
  return b === null ? "" : b === 0 ? "Studio" : `${b} bed`;
}

export function area(l: Listing): string {
  const parts = l.summary.address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || l.summary.address;
}
