"""Median rent per square metre by postcode district (E1, SW7, ...) for the private /prices map.

Uses every listing that has both a monthly rent and a floor area. Districts with fewer than MIN_N such
listings are left out rather than shown from thin data.

Usage: python scripts/area_prices.py
"""
from __future__ import annotations

import json
import pathlib
import statistics

from scraper.geocode_areas import extract_postcode_area

DATA = pathlib.Path("frontend/public/data")
SQFT_PER_SQM = 10.7639
MIN_N = 4


def main() -> None:
    listings = json.loads((DATA / "listings.json").read_text())
    centroids = json.loads((DATA / "area-centroids.json").read_text())
    by_area: dict[str, list[float]] = {}
    for l in listings:
        s, a = l["summary"], l.get("attributes") or {}
        sqft, pcm = a.get("floor_area_sqft"), s.get("price_pcm")
        area = extract_postcode_area(s.get("address") or "") or (a.get("postcode") or "").split(" ")[0].upper() or None
        if not (sqft and pcm and area in centroids):
            continue
        if not (150 <= sqft <= 3500 and 500 <= pcm <= 25000):
            continue
        by_area.setdefault(area, []).append(pcm / (sqft / SQFT_PER_SQM))
    out = {
        area: {**centroids[area], "n": len(v), "pcmPerSqm": round(statistics.median(v), 1)}
        for area, v in sorted(by_area.items())
        if len(v) >= MIN_N
    }
    (DATA / "area-prices.json").write_text(json.dumps(out, separators=(",", ":")))
    allv = sorted(x["pcmPerSqm"] for x in out.values())
    print(f"{len(out)} districts (of {len(by_area)} with any data); £/m²/month {allv[0]}–{allv[-1]}, median {statistics.median(allv):.1f}")


if __name__ == "__main__":
    main()
