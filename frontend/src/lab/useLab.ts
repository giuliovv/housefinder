import { useCallback, useEffect, useMemo, useState } from "react";
import type { Listing } from "../types";
import { loadEmbeddingStore, type EmbeddingStore } from "../lib/embeddingStore";
import { useStylePreferences } from "../lib/preferences";
import { useShortlist } from "../lib/useShortlist";
import { listingKey } from "../lib/listingKey";
import type { ListingGeo } from "../lib/geo";
import { photoId } from "../lib/embeddingStore";
import { diverse, EXPLORE_UNTIL } from "./suggest";
import type { StyleLabel } from "../types";

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
  const [labels, setLabels] = useState<StyleLabel[]>([]);

  useEffect(() => {
    loadEmbeddingStore().then(setStore).catch((e) => console.error("style data failed", e));
    fetch("/data/browse.json").then((r) => r.json()).then(setRaw).catch((e) => console.error("listings failed", e));
    fetch("/killswitch.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : { disabled: [] }))
      .then((k) => setKilled(Array.isArray(k?.disabled) ? k.disabled.map(String) : []))
      .catch(() => undefined);
    fetch("/data/style-labels.json").then((r) => (r.ok ? r.json() : [])).then(setLabels).catch(() => undefined);
    fetch("/data/listing-geo.json").then((r) => (r.ok ? r.json() : {})).then(setGeo).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!store) return;
    store.ensureRanking().then(() => setRankingReady(true)).catch((e) => console.error("ranking failed", e));
  }, [store]);

  const prefs = useStylePreferences(store, rankingReady);

  // which homes this person has already judged in a lab design: they are never suggested again
  const [choices, setChoices] = useState<Record<string, "like" | "dislike">>(() => {
    try {
      return JSON.parse(localStorage.getItem("lab:home-choices") ?? "{}");
    } catch {
      return {};
    }
  });
  const { swipe } = prefs;
  /** judge one photo of a home: that photo teaches the taste model, and the home stops being suggested */
  const rate = useCallback(
    (listing: Listing, url: string, choice: "like" | "dislike") => {
      const key = listingKey(listing);
      // the shown photo teaches the model; if it has no vector yet (a home newer than the photo data) another photo of the home stands in
      const teach = [url, ...listing.photo_urls].find((u) => store?.vectorOf(photoId(key, u)));
      if (teach) swipe(photoId(key, teach), choice);
      setChoices((c) => {
        const next = { ...c, [key]: choice };
        try {
          localStorage.setItem("lab:home-choices", JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [swipe, store],
  );

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

  /** one unit vector per home: the average of its photos, measured from the "average interior" (what makes it different) */
  const { out: homeVectors, far: homeDistance } = useMemo(() => {
    const out = new Map<string, Float32Array>();
    const far = new Map<string, number>();
    if (!store || !rankingReady || !listings) return { out, far };
    const dim = store.dim;
    for (const l of listings) {
      const key = listingKey(l);
      const acc = new Float32Array(dim);
      let n = 0;
      const sum = new Float32Array(dim);
      for (const u of l.photo_urls.slice(0, 12)) {
        const v = store.vectorOf(photoId(key, u));
        if (!v) continue;
        let sq = 0;
        for (let i = 0; i < dim; i++) {
          const x = v[i] - store.mean[i];
          sum[i] += x;
          sq += x * x;
        }
        if (sq === 0) continue;
        // each photo counts equally whatever its length
        const inv = 1 / Math.sqrt(sq);
        for (let i = 0; i < dim; i++) acc[i] += (v[i] - store.mean[i]) * inv;
        n++;
      }
      if (n === 0) continue;
      let sq = 0;
      for (let i = 0; i < dim; i++) sq += acc[i] * acc[i];
      const inv = sq > 0 ? 1 / Math.sqrt(sq) : 0;
      for (let i = 0; i < dim; i++) acc[i] *= inv;
      out.set(key, acc);
      let far2 = 0;
      for (let i = 0; i < dim; i++) far2 += sum[i] * sum[i];
      far.set(key, Math.sqrt(far2) / n); // how far the home's average photo sits from the average interior
    }
    return { out, far };
  }, [store, rankingReady, listings]);

  /** the next n homes to show: spread wide while we know little, the best matches once we know more; never ones already judged or in `exclude` */
  const suggest = (n: number, exclude: ReadonlySet<string> = new Set(), seed = 1): Listing[] => {
    // homes whose photos aren't in the photo data yet can't be learned from, so they are not suggested
    const known = homeVectors.size > 0;
    const fresh = ranked.filter((l) => !(listingKey(l) in choices) && !exclude.has(listingKey(l)) && (!known || homeVectors.has(listingKey(l))));
    if (prefs.matchScores && prefs.likedCount + prefs.dislikedCount >= EXPLORE_UNTIL) return fresh.slice(0, n);
    return homeVectors.size > 0 ? diverse(fresh.slice(0, 600), homeVectors, n, seed) : fresh.slice(0, n);
  };

  return { store, rankingReady, choices, rate, suggest, listings, ranked, byKey, geo, labels, homeVectors, homeDistance, shortlist, ...prefs, swipeCount: prefs.likedCount + prefs.dislikedCount };
}
export type Lab = ReturnType<typeof useLab>;

/** 0..1 for display; scores are cosine similarities that rarely leave about -0.1..0.5 */
export function matchPct(score: number | undefined): number | null {
  if (score === undefined || !Number.isFinite(score)) return null;
  return Math.round(Math.max(0, Math.min(1, (score + 0.05) / 0.5)) * 100);
}

export function money(l: Listing): string {
  return l.summary.price_pcm ? `£${Math.round(l.summary.price_pcm).toLocaleString("en-GB")}` : l.summary.price_text || "Price on request";
}

export function bedsLabel(l: Listing): string {
  const b = l.summary.bedrooms;
  return b === null ? "" : b === 0 ? "Studio" : `${b} bed`;
}

export function area(l: Listing): string {
  const parts = l.summary.address.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.slice(-2).join(", ") || l.summary.address;
}
