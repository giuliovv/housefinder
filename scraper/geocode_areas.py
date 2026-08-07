"""One-off/occasional script: geocode every postcode area (outward code) that
appears in listings.json to a lat/lon centroid, via postcodes.io (free, no
API key, no auth). Only re-run when new areas show up in the dataset — this
hits a public third party API, so it isn't part of the regular export
pipeline.

Usage:
    python -m scraper.geocode_areas --listings frontend/public/data/listings.json --out frontend/public/data/area-centroids.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import time

import requests

_OUTWARD_CODE_RE = re.compile(r"^[A-Z]{1,2}\d[A-Z\d]?$")


def extract_postcode_area(address: str) -> str | None:
    last = address.split(",")[-1].strip().upper()
    return last if last and _OUTWARD_CODE_RE.match(last) else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listings", type=pathlib.Path, default=pathlib.Path("frontend/public/data/listings.json"))
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("frontend/public/data/area-centroids.json"))
    args = parser.parse_args()

    listings = json.loads(args.listings.read_text())
    areas = sorted({
        area
        for l in listings
        if (area := extract_postcode_area(l["summary"]["address"])) is not None
    })

    existing: dict[str, dict] = {}
    if args.out.exists():
        existing = json.loads(args.out.read_text())

    centroids = dict(existing)
    for area in areas:
        if area in centroids:
            continue
        resp = requests.get(f"https://api.postcodes.io/outcodes/{area}", timeout=10)
        if resp.status_code != 200:
            print(f"  ! {area}: HTTP {resp.status_code}, skipping")
            continue
        result = resp.json()["result"]
        centroids[area] = {"lat": result["latitude"], "lon": result["longitude"]}
        print(f"  {area}: {result['latitude']:.4f}, {result['longitude']:.4f}")
        time.sleep(0.2)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(centroids, sort_keys=True, indent=2))
    print(f"wrote {len(centroids)} area centroids to {args.out}")


if __name__ == "__main__":
    main()
