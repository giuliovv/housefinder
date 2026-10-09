import { useCallback, useEffect, useMemo, useState } from "react";
import type { ListingKey } from "../types";
import { computePreferenceVector } from "./similarity";
import { computeTasteRead } from "./tasteRead";
import { decodeInt8, dequantize, encodeInt8, photoId, quantize, type DeckPhoto, type EmbeddingStore } from "./embeddingStore";

export type SwipeChoice = "like" | "dislike";

/** A swipe keeps its own vector. A taste profile therefore never depends on the
 * data files: listings expire and get re-embedded, and a swipe must keep
 * counting regardless. */
interface StoredSwipe {
  c: SwipeChoice;
  v: string; // base64 int8
  s: number; // scale: vector ≈ v * s
}

const STORAGE_KEY = "housefinder:style-swipes:v2";
const SEED_KEY = "housefinder:deck-seed:v1";
const HIDDEN_KEY = "housefinder:hidden-photos:v1";

/** Every browser gets its own deck order (stable across reloads in that browser), so opening the
 * app on another device doesn't feel like starting over with the same sequence. */
function newSeed(): number {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  try {
    localStorage.setItem(SEED_KEY, String(seed));
  } catch {
    /* storage blocked: the order just won't survive a reload */
  }
  return seed;
}

function loadSeed(): number {
  try {
    const n = Number(localStorage.getItem(SEED_KEY));
    if (Number.isInteger(n) && n > 0) return n;
  } catch {
    /* fall through */
  }
  return newSeed();
}

function loadHidden(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
const LEGACY_KEY = "housefinder:style-swipes:v1"; // id -> choice only, vectors lived in the big embeddings file

function loadStored(): Record<string, StoredSwipe> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadLegacy(): Record<string, SwipeChoice> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
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

export function useStylePreferences(store: EmbeddingStore | null) {
  const [stored, setStored] = useState<Record<string, StoredSwipe>>(loadStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }, [stored]);

  // One-off: carry over swipes from the old format whose photo still has a
  // vector in the current data (older ones can't be recovered).
  useEffect(() => {
    if (!store || localStorage.getItem(LEGACY_KEY + ":migrated")) return;
    const legacy = loadLegacy();
    const migrated: Record<string, StoredSwipe> = {};
    for (const [id, choice] of Object.entries(legacy)) {
      const vec = store.vectorOf(id);
      if (vec) {
        const { q, scale } = quantize(vec);
        migrated[id] = { c: choice, v: encodeInt8(q), s: scale };
      }
    }
    localStorage.setItem(LEGACY_KEY + ":migrated", "1");
    if (Object.keys(migrated).length > 0) setStored((prev) => ({ ...migrated, ...prev }));
  }, [store]);

  const swipes = useMemo<Record<string, SwipeChoice>>(
    () => Object.fromEntries(Object.entries(stored).map(([id, sw]) => [id, sw.c])),
    [stored],
  );

  // Photos whose image failed to load this session (deleted, blocked, blank) are skipped.
  // Session-only on purpose: a flaky connection shouldn't blacklist a good photo for good;
  // the pipeline's dead-photo list handles the permanent cases.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const markBroken = useCallback((id: string) => setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);

  const [seed, setSeed] = useState(loadSeed);
  const deck = useMemo<DeckPhoto[]>(() => (store ? seededShuffle(store.deck, seed) : []), [store, seed]);

  // Photos this person marked "not a room": hidden for them for good (kept on their device only).
  const [hidden, setHidden] = useState<ReadonlySet<string>>(loadHidden);
  const hidePhoto = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const undecided = useMemo(() => deck.filter((p) => !(p.id in stored) && !broken.has(p.id) && !hidden.has(p.id)), [deck, stored, broken, hidden]);

  const record = useCallback(
    (id: string, choice: SwipeChoice) => {
      const vec = store?.vectorOf(id);
      if (!vec) return; // a photo without a vector can't influence matching, so don't record it
      const { q, scale } = quantize(vec);
      setStored((prev) => ({ ...prev, [id]: { c: choice, v: encodeInt8(q), s: scale } }));
    },
    [store],
  );

  const swipe = useCallback((id: string, choice: SwipeChoice) => record(id, choice), [record]);

  // Clicking the same choice again clears it — lets a rating made while
  // scrolling the Browse grid (as opposed to the dedicated swipe deck, where
  // there's no way to revisit a photo) be corrected without a full reset.
  const toggleSwipe = useCallback(
    (id: string, choice: SwipeChoice) => {
      if (stored[id]?.c === choice) {
        setStored((prev) => {
          const { [id]: _removed, ...rest } = prev;
          return rest;
        });
      } else {
        record(id, choice);
      }
    },
    [stored, record],
  );

  const reset = useCallback(() => {
    setStored({});
    setSeed(newSeed()); // starting over also gets a fresh order
  }, []);

  const { preferenceVector, tasteRead } = useMemo(() => {
    const vectors = (choice: SwipeChoice) =>
      Object.values(stored)
        .filter((sw) => sw.c === choice)
        .map((sw) => dequantize(decodeInt8(sw.v), sw.s));
    const liked = vectors("like");
    const disliked = vectors("dislike");
    return { preferenceVector: computePreferenceVector(liked, disliked), tasteRead: computeTasteRead(liked, disliked) };
  }, [stored]);

  const matchScores = useMemo<Record<ListingKey, number> | null>(() => {
    if (!preferenceVector || !store) return null;
    return store.scoreListings(preferenceVector);
  }, [preferenceVector, store]);

  const likedCount = useMemo(() => Object.values(stored).filter((sw) => sw.c === "like").length, [stored]);
  const dislikedCount = useMemo(() => Object.values(stored).filter((sw) => sw.c === "dislike").length, [stored]);

  return { deck, undecided, markBroken, hidePhoto, swipes, swipe, toggleSwipe, reset, preferenceVector, tasteRead, matchScores, likedCount, dislikedCount };
}

export { photoId };
