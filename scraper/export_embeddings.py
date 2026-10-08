"""Turn the full working embeddings store into the compact files the site loads.

`embeddings.json` (every photo's 512 floats as JSON text, ~150MB for ~3,000
listings) is the *working* store the incremental embedding step reads and
writes. It is far too big to ship to a browser, and measuring showed that the
obvious shortcuts all change the ranking noticeably (an averaged vector per
listing keeps only ~15-20% of today's top 20; PCA-reducing the dimensions or
keeping 6-10 diverse photos per listing lose a third to a half of the top
100). What is essentially lossless (rank correlation 0.9997 with the exact
ranking) is keeping every photo's full vector but storing each as one signed
byte per dimension plus a scale. So:

  ranking.bin        float32 scale[N] then int8 q[N][512]; every embedded photo
                     of every *browseable* listing (all photos, so the match
                     score — the best photo's similarity — stays exact).
  ranking-index.json {dim, count, listings: [{k: key, o: first row, u: [photo
                     urls in row order]}]} — rows are consecutive per listing.
  deck.json          a deterministic sample of photos from *all* listings
                     (including let/unverified ones, which Browse hides but the
                     style deck still wants), vectors inline, for the swipe deck.

Vectors are unit-normalised before quantising, so cosine similarity in the
browser is a plain dot product times the row's scale.

Usage:
    python -m scraper.export_embeddings --embeddings work/embeddings.json \
        --listings frontend/public/data/listings.json --out-dir frontend/public/data
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import pathlib

import ijson
import numpy as np

DIM = 512
DECK_SIZE = 1500
DECK_MAX_PER_LISTING = 2


def quantize(vec: np.ndarray) -> tuple[np.ndarray, float]:
    """Unit-normalise, then int8 with one float scale: v ≈ q * scale."""
    v = np.asarray(vec, dtype=np.float32)
    norm = float(np.linalg.norm(v))
    if norm == 0:
        return np.zeros(DIM, dtype=np.int8), 0.0
    v = v / norm
    scale = float(np.abs(v).max()) / 127
    return np.round(v / scale).astype(np.int8), scale


def _photo_hash(key: str, url: str) -> int:
    return int.from_bytes(hashlib.sha1(f"{key}|{url}".encode()).digest()[:8], "big")


def listing_key(row: dict) -> str:
    s = row["summary"]
    return f"{s['platform']}:{s['source_id']}"


def is_browseable(row: dict) -> bool:
    return not row.get("off_market") and not row.get("unverified")


def build(embeddings_path: pathlib.Path, listings: list[dict], out_dir: pathlib.Path) -> dict:
    browseable = {listing_key(r) for r in listings if is_browseable(r)}
    known = {listing_key(r) for r in listings}

    scales: list[float] = []
    rows: list[np.ndarray] = []
    index: list[dict] = []
    deck_candidates: list[tuple[int, str, str, np.ndarray, float]] = []

    with open(embeddings_path, "rb") as f:
        for key, entry in ijson.kvitems(f, "", use_float=True):
            if key not in known:
                continue
            photos = [p for p in entry.get("photos", []) if p.get("embedding") and len(p["embedding"]) == DIM]
            if not photos:
                continue
            quantized = [(p["url"], *quantize(p["embedding"])) for p in photos]
            if key in browseable:
                index.append({"k": key, "o": len(rows), "u": [u for u, _, _ in quantized]})
                for _, q, s in quantized:
                    rows.append(q)
                    scales.append(s)
            # the deck's per-listing picks: the photos with the smallest hash, so
            # the sample is stable from run to run and independent of ordering
            for url, q, s in sorted(quantized, key=lambda t: _photo_hash(key, t[0]))[:DECK_MAX_PER_LISTING]:
                deck_candidates.append((_photo_hash(key, url), key, url, q, s))

    out_dir.mkdir(parents=True, exist_ok=True)
    matrix = np.stack(rows) if rows else np.zeros((0, DIM), dtype=np.int8)
    (out_dir / "ranking.bin").write_bytes(np.asarray(scales, dtype="<f4").tobytes() + matrix.astype(np.int8).tobytes())
    (out_dir / "ranking-index.json").write_text(
        json.dumps({"version": 1, "dim": DIM, "count": len(rows), "listings": index}, ensure_ascii=False, separators=(",", ":"))
    )

    deck_candidates.sort(key=lambda t: t[0])
    deck = [
        {"k": k, "u": u, "s": round(s, 8), "v": base64.b64encode(q.tobytes()).decode()}
        for _, k, u, q, s in deck_candidates[:DECK_SIZE]
    ]
    (out_dir / "deck.json").write_text(json.dumps({"version": 1, "dim": DIM, "photos": deck}, separators=(",", ":")))
    return {"listings": len(index), "photos": len(rows), "deck": len(deck)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--embeddings", type=pathlib.Path, required=True)
    parser.add_argument("--listings", type=pathlib.Path, required=True)
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    args = parser.parse_args()
    stats = build(args.embeddings, json.loads(args.listings.read_text()), args.out_dir)
    ranking = (args.out_dir / "ranking.bin").stat().st_size / 1e6
    print(f"ranking: {stats['listings']} listings, {stats['photos']} photos ({ranking:.1f} MB); deck: {stats['deck']} photos")


if __name__ == "__main__":
    main()
