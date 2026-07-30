import { useCallback, useEffect, useMemo, useState } from "react";
import type { EmbeddingsData, ListingKey } from "../types";
import { computePreferenceVector, listingMatchScore } from "./similarity";

export type SwipeChoice = "like" | "dislike";

interface DeckPhoto {
  id: string; // `${listingKey}::${url}` — stable across reloads, used as the swipe-state key
  listingKey: ListingKey;
  url: string;
  embedding: number[];
}

const STORAGE_KEY = "housefinder:style-swipes:v1";

function loadStoredSwipes(): Record<string, SwipeChoice> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// Deterministic shuffle (mulberry32) so the deck order is stable across a
// session/page reload instead of jumping around, but still not just
// "listing order" (which would cluster all of one agency's photos together).
function seededShuffle<T>(items: T[], seed: number): T[] {
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function useStylePreferences(embeddings: EmbeddingsData | null) {
  const [swipes, setSwipes] = useState<Record<string, SwipeChoice>>(loadStoredSwipes);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(swipes));
  }, [swipes]);

  const deck = useMemo<DeckPhoto[]>(() => {
    if (!embeddings) return [];
    const all: DeckPhoto[] = [];
    for (const [listingKey, entry] of Object.entries(embeddings)) {
      for (const photo of entry.photos) {
        all.push({ id: `${listingKey}::${photo.url}`, listingKey, url: photo.url, embedding: photo.embedding });
      }
    }
    return seededShuffle(all, 42);
  }, [embeddings]);

  const undecided = useMemo(() => deck.filter((p) => !(p.id in swipes)), [deck, swipes]);

  const swipe = useCallback((id: string, choice: SwipeChoice) => {
    setSwipes((prev) => ({ ...prev, [id]: choice }));
  }, []);

  const reset = useCallback(() => setSwipes({}), []);

  const preferenceVector = useMemo(() => {
    const liked = deck.filter((p) => swipes[p.id] === "like").map((p) => p.embedding);
    const disliked = deck.filter((p) => swipes[p.id] === "dislike").map((p) => p.embedding);
    return computePreferenceVector(liked, disliked);
  }, [deck, swipes]);

  const matchScores = useMemo<Record<ListingKey, number> | null>(() => {
    if (!preferenceVector || !embeddings) return null;
    const scores: Record<ListingKey, number> = {};
    for (const [listingKey, entry] of Object.entries(embeddings)) {
      if (entry.photos.length === 0) continue;
      scores[listingKey] = listingMatchScore(preferenceVector, entry.photos.map((p) => p.embedding));
    }
    return scores;
  }, [preferenceVector, embeddings]);

  const likedCount = useMemo(() => Object.values(swipes).filter((c) => c === "like").length, [swipes]);
  const dislikedCount = useMemo(() => Object.values(swipes).filter((c) => c === "dislike").length, [swipes]);

  return { deck, undecided, swipe, reset, preferenceVector, matchScores, likedCount, dislikedCount };
}
