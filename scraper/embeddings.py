"""Embed listing photos and descriptions with CLIP (via fastembed's ONNX
export of OpenAI's ViT-B/32 — same model, no PyTorch dependency, which
matters on this host: onnxruntime is a ~15MB wheel vs. PyTorch's hundreds of
MB, and this box is genuinely memory/disk constrained).

Image and text embeddings land in the *same* 512-dim space by construction
(that's what CLIP is), so a listing's description can be compared directly
against photos, and a user's learned "style" preference vector (built from
swiped photos) can later be compared against both.

Caps photos per listing (see MAX_PHOTOS_PER_LISTING) as a safety ceiling
against a pathological listing with hundreds of photos, not as a real
budget constraint — set high enough (30) to cover every listing in the
dataset in full (max observed: 24), since the Browse grid's per-card
like/dislike only works on a photo that's actually embedded: a low cap
here meant the rate buttons vanished the moment someone paged past photo 3
of what's usually a 10+ photo gallery.

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

from fastembed import ImageEmbedding, TextEmbedding

MAX_PHOTOS_PER_LISTING = 30
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="infile", type=pathlib.Path, required=True)
    parser.add_argument("--out", type=pathlib.Path, required=True)
    parser.add_argument("--limit", type=int, default=None, help="only process the first N listings (for a quick test run)")
    args = parser.parse_args()

    listings = json.loads(args.infile.read_text())
    if args.limit is not None:
        listings = listings[: args.limit]
    print(f"loaded {len(listings)} listings")

    print("loading CLIP models (first run downloads ~0.6GB, cached after)...")
    img_model = ImageEmbedding(IMAGE_MODEL)
    txt_model = TextEmbedding(TEXT_MODEL)

    result: dict[str, dict] = {}
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = pathlib.Path(tmpdir)

        for i, listing in enumerate(listings, 1):
            key = _listing_key(listing)
            photo_urls = listing["photo_urls"][:MAX_PHOTOS_PER_LISTING]
            print(f"[{i}/{len(listings)}] {key} — {listing['summary']['address']} ({len(photo_urls)} photos)")

            photo_entries = []
            for j, url in enumerate(photo_urls):
                local_path = tmp / f"{i}_{j}.jpg"
                if not _download_image(url, local_path):
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

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False))
    total_photos = sum(len(v["photos"]) for v in result.values())
    print(f"wrote embeddings for {len(result)} listings ({total_photos} photos) to {args.out}")


if __name__ == "__main__":
    main()
