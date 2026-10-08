"""Embed listing photos and descriptions with CLIP (via fastembed's ONNX
export of OpenAI's ViT-B/32 — same model, no PyTorch dependency, which
matters on this host: onnxruntime is a ~15MB wheel vs. PyTorch's hundreds of
MB, and this box is genuinely memory/disk constrained).

Image and text embeddings land in the *same* 512-dim space by construction
(that's what CLIP is), so a listing's description can be compared directly
against photos, and a user's learned "style" preference vector (built from
swiped photos) can later be compared against both.

Caps photos per listing (see MAX_PHOTOS_PER_LISTING). It was 30 when the
dataset was ~250 listings; with ~3,000 listings embedding time is dominated
by photos, and for the style deck diversity across listings matters more than
depth within one, so new listings are capped at 12. Already-embedded
listings keep whatever they have. The Browse grid's per-card like/dislike
only works on a photo that's actually embedded, so photos past the cap show
without rate buttons.

Usage:
    python -m scraper.embeddings --in frontend/public/data/listings.json \
        --out frontend/public/data/embeddings.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor

from fastembed import ImageEmbedding, TextEmbedding

MAX_PHOTOS_PER_LISTING = 12
DOWNLOAD_THREADS = 4
IMAGE_MODEL = "Qdrant/clip-ViT-B-32-vision"
TEXT_MODEL = "Qdrant/clip-ViT-B-32-text"
# Lighter than scraper/http.py's 1.5s (these are static CDN assets, not the
# agencies' own dynamic search/listing pages), but still not zero — no
# reason to hammer a third party just because it's *likely* built for it.
IMAGE_DOWNLOAD_DELAY_SECONDS = 0.3


def _listing_key(listing: dict) -> str:
    s = listing["summary"]
    return f"{s['platform']}:{s['source_id']}"


def _download_image(url: str, dest: pathlib.Path) -> bool:
    """Returns False (and leaves dest untouched) on any failure — a broken
    photo URL shouldn't kill the whole batch."""
    import requests

    full_url = f"https:{url}" if url.startswith("//") else url
    try:
        time.sleep(IMAGE_DOWNLOAD_DELAY_SECONDS)
        resp = requests.get(full_url, headers={"User-Agent": "house-finder-embeddings/0.1"}, timeout=15)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        return True
    except Exception as exc:  # noqa: BLE001 - genuinely want to skip and continue on any failure
        print(f"  ! failed to download {full_url}: {exc}")
        return False


def _write_atomic(path: pathlib.Path, data: dict) -> None:
    """Write-then-rename, so a kill mid-write can't leave a truncated file that
    the next --incremental run would fail to parse."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="infile", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--limit", type=int, default=None, help="only process the first N listings (for a quick test run)")
    parser.add_argument("--incremental", action="store_true", help="reuse entries already in --out for listings that haven't changed; only embed new ones, and drop entries for listings no longer in --in")
    parser.add_argument("--checkpoint-every", type=int, default=20, help="write --out after every N newly embedded listings, so an interrupted run can be resumed with --incremental")
    args = parser.parse_args()

    listings = json.loads(args.infile.read_text())
    if args.limit is not None:
        listings = listings[: args.limit]
    # Off-market/unverified listings (see scraper/refresh.py) are embedded
    # too: the swipe deck is built from embeddings and only cares how a
    # place looks; the frontend hides them from Browse separately.
    print(f"loaded {len(listings)} listings")

    previous: dict[str, dict] = {}
    if args.incremental and args.out.exists():
        previous = json.loads(args.out.read_text())
    result: dict[str, dict] = {_listing_key(l): previous[_listing_key(l)] for l in listings if _listing_key(l) in previous}
    if not result and not listings:
        raise SystemExit("no listings to embed")
    if len(result) == len(listings):
        print(f"all {len(listings)} listings already embedded, nothing to do")
        args.out.write_text(json.dumps(result, ensure_ascii=False))
        return
    print(f"reusing {len(result)} existing, embedding {len(listings) - len(result)} new")

    print("loading CLIP models (first run downloads ~0.6GB, cached after)...")
    img_model = ImageEmbedding(IMAGE_MODEL)
    txt_model = TextEmbedding(TEXT_MODEL)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)

        for i, listing in enumerate(listings, 1):
            key = _listing_key(listing)
            if key in result:
                continue
            photo_urls = listing["photo_urls"][:MAX_PHOTOS_PER_LISTING]
            print(f"[{i}/{len(listings)}] {key} — {listing['summary']['address']} ({len(photo_urls)} photos)")

            # Download this listing's photos in parallel (they're static CDN
            # assets; the per-download delay still applies in each thread),
            # then embed them one by one so a corrupt image only skips itself.
            paths = [tmp / f"{i}_{j}.jpg" for j in range(len(photo_urls))]
            with ThreadPoolExecutor(DOWNLOAD_THREADS) as pool:
                ok = list(pool.map(_download_image, photo_urls, paths))
            photo_entries = []
            for url, local_path, downloaded in zip(photo_urls, paths, ok):
                if not downloaded:
                    continue
                try:
                    embedding = next(img_model.embed([str(local_path)]))
                except Exception as exc:  # noqa: BLE001 - corrupt/unsupported image, skip it
                    print(f"  ! failed to embed {url}: {exc}")
                    continue
                photo_entries.append({"url": url, "embedding": [round(float(x), 5) for x in embedding]})
                local_path.unlink(missing_ok=True)

            text = (listing["description"] + " " + " ".join(listing["key_features"])).strip()
            text_embedding = next(txt_model.embed([text])) if text else None

            result[key] = {
                "photos": photo_entries,
                "text_embedding": [round(float(x), 5) for x in text_embedding] if text_embedding is not None else None,
            }
            if len(result) % args.checkpoint_every == 0:
                _write_atomic(args.out, result)

    _write_atomic(args.out, result)
    total_photos = sum(len(v["photos"]) for v in result.values())
    print(f"wrote embeddings for {len(result)} listings ({total_photos} photos) to {args.out}")


if __name__ == "__main__":
    main()
