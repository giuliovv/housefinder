/**
 * Loads the compact embedding files built by scraper/export_embeddings.py and
 * answers the questions the UI has — "what is this photo's vector", "how well
 * does each listing match this preference vector" — straight from packed typed
 * arrays. Everything stays in the browser.
 *
 *   ranking.bin        float32 scale[N], then int8 q[N][dim]  (browseable listings' photos)
 *   ranking-index.json listings in row order, each with the photo urls of its rows
 *   deck.json          sample of photos from all listings, base64 int8 vectors inline
 *
 * Each row's vector is unit length before quantising, so v ≈ q * scale and the
 * cosine similarity with a preference vector p is dot(p, q) * scale / |p|.
 */
import type { ListingKey } from "../types";

export interface DeckPhoto {
  id: string; // `${listingKey}::${url}` — the swipe-state key
  listingKey: ListingKey;
  url: string;
}

export interface EmbeddingStore {
  dim: number;
  deck: DeckPhoto[];
  /** true if this exact photo has a vector (so it can be rated) */
  hasPhoto(listingKey: ListingKey, url: string): boolean;
  /** dequantised vector of a photo, from the ranking matrix or the deck sample */
  vectorOf(photoId: string): Float32Array | null;
  /** mean vector of all listing photos (the "average interior"), used to centre vectors before comparing */
  mean: Float32Array;
  /** best-photo cosine similarity per browseable listing, in centred space: cos(photo - mean, preference) */
  scoreListings(preference: ArrayLike<number>): Record<ListingKey, number>;
  /** the url of the listing's photo that matches the (centred) preference best */
  bestPhoto(listingKey: ListingKey, preference: ArrayLike<number>): string | null;
}

interface RankingIndex {
  dim: number;
  count: number;
  listings: { k: string; o: number; u: string[] }[];
}

interface DeckFile {
  dim: number;
  photos: { k: string; u: string; s: number; v: string }[];
}

export function photoId(listingKey: ListingKey, url: string): string {
  return `${listingKey}::${url}`;
}

/** base64 -> Int8Array */
export function decodeInt8(b64: string): Int8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int8Array(bytes.buffer);
}

export function encodeInt8(q: Int8Array): string {
  let bin = "";
  const bytes = new Uint8Array(q.buffer, q.byteOffset, q.byteLength);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** unit-normalise and quantise a vector to int8 + scale (same scheme as the exporter) */
export function quantize(vec: ArrayLike<number>): { q: Int8Array; scale: number } {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  const q = new Int8Array(vec.length);
  if (norm === 0) return { q, scale: 0 };
  let max = 0;
  for (let i = 0; i < vec.length; i++) max = Math.max(max, Math.abs(vec[i] / norm));
  const scale = max / 127;
  for (let i = 0; i < vec.length; i++) q[i] = Math.round(vec[i] / norm / scale);
  return { q, scale };
}

export function dequantize(q: Int8Array, scale: number): Float32Array {
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = q[i] * scale;
  return out;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export async function loadEmbeddingStore(): Promise<EmbeddingStore> {
  const [indexRes, binRes, deckRes] = await Promise.all([
    fetchOk("/data/ranking-index.json"),
    fetchOk("/data/ranking.bin"),
    fetchOk("/data/deck.json"),
  ]);
  const index: RankingIndex = await indexRes.json();
  const buffer = await binRes.arrayBuffer();
  const deckFile: DeckFile = await deckRes.json();

  const { dim, count } = index;
  const scales = new Float32Array(buffer, 0, count);
  const q = new Int8Array(buffer, count * 4, count * dim);

  // mean photo vector, and each row's 1/|x - mean| so a centred cosine is one dot product per row
  const mean = new Float32Array(dim);
  for (let r = 0; r < count; r++) {
    const base = r * dim;
    for (let i = 0; i < dim; i++) mean[i] += q[base + i] * scales[r];
  }
  let meanSq = 0;
  for (let i = 0; i < dim; i++) {
    mean[i] /= count;
    meanSq += mean[i] * mean[i];
  }
  const invCentredNorm = new Float32Array(count);
  for (let r = 0; r < count; r++) {
    const base = r * dim;
    let dot = 0;
    let sq = 0;
    for (let i = 0; i < dim; i++) {
      const x = q[base + i] * scales[r];
      dot += x * mean[i];
      sq += x * x;
    }
    const centredSq = sq - 2 * dot + meanSq;
    invCentredNorm[r] = centredSq > 1e-9 ? 1 / Math.sqrt(centredSq) : 0;
  }

  const listingByKey = new Map(index.listings.map((l) => [l.k, l]));
  const rowById = new Map<string, number>();
  for (const l of index.listings) l.u.forEach((url, i) => rowById.set(photoId(l.k, url), l.o + i));

  const deckVectors = new Map<string, { q: Int8Array; scale: number }>();
  const deck: DeckPhoto[] = deckFile.photos.map((p) => {
    const id = photoId(p.k, p.u);
    deckVectors.set(id, { q: decodeInt8(p.v), scale: p.s });
    return { id, listingKey: p.k, url: p.u };
  });

  return {
    dim,
    deck,
    mean,
    hasPhoto: (listingKey, url) => rowById.has(photoId(listingKey, url)),
    vectorOf(id) {
      const row = rowById.get(id);
      if (row !== undefined) return dequantize(q.subarray(row * dim, (row + 1) * dim), scales[row]);
      const d = deckVectors.get(id);
      return d ? dequantize(d.q, d.scale) : null;
    },
    bestPhoto(listingKey, preference) {
      const l = listingByKey.get(listingKey);
      if (!l) return null;
      let meanDotPref = 0;
      for (let i = 0; i < dim; i++) meanDotPref += mean[i] * preference[i];
      let best = -Infinity;
      let bestUrl: string | null = null;
      for (let r = l.o; r < l.o + l.u.length; r++) {
        let dot = 0;
        const base = r * dim;
        for (let i = 0; i < dim; i++) dot += q[base + i] * preference[i];
        const sim = (dot * scales[r] - meanDotPref) * invCentredNorm[r];
        if (sim > best) {
          best = sim;
          bestUrl = l.u[r - l.o];
        }
      }
      return bestUrl;
    },
    scoreListings(preference) {
      let norm = 0;
      for (let i = 0; i < dim; i++) norm += preference[i] * preference[i];
      const inv = norm === 0 ? 0 : 1 / Math.sqrt(norm);
      let meanDotPref = 0;
      for (let i = 0; i < dim; i++) meanDotPref += mean[i] * preference[i];
      const out: Record<ListingKey, number> = {};
      for (const l of index.listings) {
        let best = -Infinity;
        for (let r = l.o; r < l.o + l.u.length; r++) {
          let dot = 0;
          const base = r * dim;
          for (let i = 0; i < dim; i++) dot += q[base + i] * preference[i];
          const sim = (dot * scales[r] - meanDotPref) * invCentredNorm[r] * inv;
          if (sim > best) best = sim;
        }
        out[l.k] = best;
      }
      return out;
    },
  };
}
