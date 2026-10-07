"""Builds one composite "contact sheet" image per listing — its photos
arranged in a grid — so a vision-capable model can be shown a whole flat's
general character in a single look instead of one photo at a time.

This is specifically for *interactive* review (Claude Code's own vision,
already covered by whatever plan is paying for this session) rather than a
separate per-image API call — the whole point is avoiding the "budget
appetite for VLM calls per listing" cost PLAN.md flagged for Phase 3.
Combining photos trades per-photo fine detail for coverage-in-one-glance,
which is the right tradeoff for *general* flat character (overall style,
brightness, period vs modern) rather than fine-grained single-photo facts
like exact sink size — see PLAN.md's Phase 3 note before assuming this
replaces a real object-detection pass for that level of detail.

Deliberately writes montages to a scratch directory, not
frontend/public/data/ — these are a working aid for the extraction pass,
not something the frontend ships to users.

Usage:
    python -m scraper.montage --in frontend/public/data/listings.json \
        --out-dir /tmp/montages
"""
from __future__ import annotations

import argparse
import io
import json
import math
import pathlib
import time

import requests
from PIL import Image

MAX_PHOTOS_PER_MONTAGE = 9
CELL_WIDTH = 360
CELL_HEIGHT = 270
# Same politeness pattern as scraper/embeddings.py — these are the same
# agency CDNs, no reason to hit them harder just because this script is new.
IMAGE_DOWNLOAD_DELAY_SECONDS = 0.3


def _listing_key(listing: dict) -> str:
    s = listing["summary"]
    return f"{s['platform']}:{s['source_id']}"


def _download_image(url: str) -> Image.Image | None:
    full_url = f"https:{url}" if url.startswith("//") else url
    try:
        time.sleep(IMAGE_DOWNLOAD_DELAY_SECONDS)
        resp = requests.get(full_url, headers={"User-Agent": "house-finder-montage/0.1"}, timeout=15)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 - one broken photo shouldn't kill the montage
        print(f"  ! failed to download {full_url}: {exc}")
        return None


def _fit_cover(img: Image.Image, width: int, height: int) -> Image.Image:
    """Resize+crop to fill the cell exactly (like CSS object-fit: cover) —
    letterboxing would waste cell space that could otherwise show more of
    each room."""
    src_ratio = img.width / img.height
    dst_ratio = width / height
    if src_ratio > dst_ratio:
        new_height = height
        new_width = round(height * src_ratio)
    else:
        new_width = width
        new_height = round(width / src_ratio)
    img = img.resize((new_width, new_height), Image.LANCZOS)
    left = (new_width - width) // 2
    top = (new_height - height) // 2
    return img.crop((left, top, left + width, top + height))


def build_montage(photo_urls: list[str]) -> Image.Image | None:
    urls = photo_urls[:MAX_PHOTOS_PER_MONTAGE]
    images = [img for url in urls if (img := _download_image(url)) is not None]
    if not images:
        return None

    cols = math.ceil(math.sqrt(len(images)))
    rows = math.ceil(len(images) / cols)
    canvas = Image.new("RGB", (cols * CELL_WIDTH, rows * CELL_HEIGHT), "white")
    for i, img in enumerate(images):
        cell = _fit_cover(img, CELL_WIDTH, CELL_HEIGHT)
        x = (i % cols) * CELL_WIDTH
        y = (i // cols) * CELL_HEIGHT
        canvas.paste(cell, (x, y))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="infile", type=pathlib.Path, required=True)
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    parser.add_argument("--limit", type=int, default=None, help="only process the first N listings (for a quick test run)")
    args = parser.parse_args()

    listings = json.loads(args.infile.read_text())
    if args.limit is not None:
        listings = listings[: args.limit]
    args.out_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    for i, listing in enumerate(listings, 1):
        key = _listing_key(listing)
        safe_key = key.replace(":", "_").replace("/", "_")
        out_path = args.out_dir / f"{safe_key}.jpg"
        if out_path.exists():
            continue
        print(f"[{i}/{len(listings)}] {key} — {listing['summary']['address']} ({len(listing['photo_urls'])} photos)")
        montage = build_montage(listing["photo_urls"])
        if montage is None:
            print(f"  ! no usable photos for {key}, skipping")
            continue
        montage.save(out_path, "JPEG", quality=85)
        written += 1

    print(f"wrote {written} montages to {args.out_dir}")


if __name__ == "__main__":
    main()
