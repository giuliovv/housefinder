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
import datetime as dt
import hashlib
import json
import pathlib

import ijson
import numpy as np

from .photo_health import PhotoHealth

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


from .keys import alias_map, embedding_belongs_to, listing_key, migrate_rows  # noqa: E402


def is_browseable(row: dict) -> bool:
    return not row.get("off_market") and not row.get("unverified")


def build(embeddings_path: pathlib.Path, listings: list[dict], out_dir: pathlib.Path, health=None) -> dict:
    """`health` is an optional photo_health.PhotoHealth: photos known to be dead are
    left out of the ranking matrix and the deck, and written to dead-photos.json so
    the site can hide them from listing cards too."""
    migrate_rows(listings)
    browseable = {listing_key(r) for r in listings if is_browseable(r)}
    known = {listing_key(r) for r in listings}
    by_key = {listing_key(r): r for r in listings}
    alias = alias_map(listings)   # legacy key -> current key, for a store written before agencies were in the key

    entries: dict[str, list[tuple[str, np.ndarray, float]]] = {}
    with open(embeddings_path, "rb") as f:
        for key, entry in ijson.kvitems(f, "", use_float=True):
            if key in alias and key not in known and embedding_belongs_to(by_key[alias[key]], entry):
                key = alias[key]
            if key not in known or key in entries:
                continue
            photos = [p for p in entry.get("photos", []) if p.get("embedding") and len(p["embedding"]) == DIM]
            if photos:
                entries[key] = [(p["url"], *quantize(p["embedding"])) for p in photos]

    # Deck: per listing the photos with the smallest hash, then globally by hash; health-check
    # candidates in batches until enough are alive (dead ones are skipped, next in line used).
    candidates = []
    for key, photos in entries.items():
        for url, q, s in sorted(photos, key=lambda t: _photo_hash(key, t[0]))[:DECK_MAX_PER_LISTING + 2]:
            candidates.append((_photo_hash(key, url), key, url, q, s))
    candidates.sort(key=lambda t: t[0])
    deck_candidates: list[tuple[int, str, str, np.ndarray, float]] = []
    per_listing: dict[str, int] = {}
    i = 0
    while len(deck_candidates) < DECK_SIZE and i < len(candidates):
        batch = candidates[i : i + 400]
        i += 400
        if health is not None:
            health.check([c[2] for c in batch], limit=len(batch))   # the deck's candidates always get checked
        for h, key, url, q, s in batch:
            if health is not None and health.is_dead(url):
                continue
            if per_listing.get(key, 0) >= DECK_MAX_PER_LISTING:
                continue
            per_listing[key] = per_listing.get(key, 0) + 1
            deck_candidates.append((h, key, url, q, s))
            if len(deck_candidates) >= DECK_SIZE:
                break

    if health is not None:
        # Browseable listings' photos: a rolling slice per run (oldest check first, within
        # the budget) so every photo is re-verified within a couple of weeks without
        # hammering the CDNs. After the deck so the deck's checks are never starved.
        health.check([u for k in browseable for u, _, _ in entries.get(k, [])])

    scales: list[float] = []
    rows: list[np.ndarray] = []
    index: list[dict] = []
    for key in (k for k in entries if k in browseable):
        live = [(u, q, s) for u, q, s in entries[key] if health is None or not health.is_dead(u)]
        if not live:
            continue
        index.append({"k": key, "o": len(rows), "u": [u for u, _, _ in live]})
        for _, q, s in live:
            rows.append(q)
            scales.append(s)

    out_dir.mkdir(parents=True, exist_ok=True)
    matrix = np.stack(rows) if rows else np.zeros((0, DIM), dtype=np.int8)
    (out_dir / "ranking.bin").write_bytes(np.asarray(scales, dtype="<f4").tobytes() + matrix.astype(np.int8).tobytes())
    (out_dir / "ranking-index.json").write_text(
        json.dumps({"version": 1, "dim": DIM, "count": len(rows), "listings": index}, ensure_ascii=False, separators=(",", ":"))
    )
    deck = [
        {"k": k, "u": u, "s": round(s, 8), "v": base64.b64encode(q.tobytes()).decode()}
        for _, k, u, q, s in sorted(deck_candidates, key=lambda t: t[0])
    ]
    (out_dir / "deck.json").write_text(json.dumps({"version": 1, "dim": DIM, "photos": deck}, separators=(",", ":")))

    # every photo URL of a listing we still show that is known dead — card strips hide these
    dead: list[str] = []
    if health is not None:
        shown = {u for r in listings for u in r.get("photo_urls", [])}
        dead = sorted(health.dead_among(shown))
    (out_dir / "dead-photos.json").write_text(json.dumps(dead, separators=(",", ":")))
    if health is not None:
        health.save()
    return {"listings": len(index), "photos": len(rows), "deck": len(deck), "dead": len(dead)}


def check_consistency(listings: list[dict], out_dir: pathlib.Path, minimum: float = 0.6) -> float:
    """Fail loudly (so the run doesn't deploy) if the ranking index doesn't line up with the
    listings the site will show — the visible symptom is match scores for only a handful of
    listings. Returns the matched fraction."""
    browseable = {listing_key(r) for r in listings if is_browseable(r)}
    indexed = {l["k"] for l in json.loads((out_dir / "ranking-index.json").read_text())["listings"]}
    if not browseable or not indexed:
        return 1.0   # no style data at all (first run, no embeddings yet): nothing to compare
    fraction = len(browseable & indexed) / len(indexed)
    if fraction < minimum:
        raise SystemExit(
            f"ranking index and listings disagree: only {len(browseable & indexed)} of {len(indexed)} indexed "
            f"listings are browseable listings with the same key ({fraction:.0%}) — refusing to ship"
        )
    return fraction


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--embeddings", type=pathlib.Path, required=True)
    parser.add_argument("--listings", type=pathlib.Path, required=True)
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    parser.add_argument("--photo-health", type=pathlib.Path, help="cache of which photo URLs still work (created if missing); enables dead-photo filtering")
    parser.add_argument("--health-budget", type=int, default=2500, help="most photos to (re)probe this run")
    args = parser.parse_args()
    health = PhotoHealth(args.photo_health, dt.datetime.now(dt.timezone.utc).date(), args.health_budget) if args.photo_health else None
    listings = json.loads(args.listings.read_text())
    # The site matches ranking-index.json to listings.json by listing key, so the two must
    # always agree. Keys are agency-namespaced in memory (migrate_rows), so persist that to the
    # listings file that gets deployed — otherwise a code-only deploy ships new keys in one file
    # and old keys in the other and almost nothing gets a match score (this happened once).
    if migrate_rows(listings):
        args.listings.write_text(json.dumps(listings, ensure_ascii=False, indent=2))
    stats = build(args.embeddings, listings, args.out_dir, health)
    check_consistency(listings, args.out_dir)
    ranking = (args.out_dir / "ranking.bin").stat().st_size / 1e6
    print(f"ranking: {stats['listings']} listings, {stats['photos']} photos ({ranking:.1f} MB); deck: {stats['deck']} photos; dead photos hidden: {stats['dead']}")


if __name__ == "__main__":
    main()
