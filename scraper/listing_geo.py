"""Where each listing is, for the "draw your area" filter on the site.

Best source first, per listing:
  exact  coordinates scraped from the listing (attrs lat/lon)
  postcode  full postcode in the advert, looked up in bulk on postcodes.io
  street  "street, district" via Nominatim (1 request/second, cached, time-budgeted per run)
  area  centroid of the postcode district (only a fallback: the pin is a few km out at worst)

Output `listing-geo.json`: {listing_key: [lat, lon, precision]} with precision "e"/"p"/"s"/"a".
The cache (lookups that have been answered, including "not found") lives outside the site data.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import time

import requests

from .geocode_areas import extract_postcode_area
from .http import USER_AGENT
from .keys import listing_key, migrate_history

# Greater London; anything geocoded outside is a wrong match (another "High Street") and is dropped
BOUNDS = (51.2, 51.75, -0.6, 0.35)


def in_london(lat: float, lon: float) -> bool:
    return BOUNDS[0] <= lat <= BOUNDS[1] and BOUNDS[2] <= lon <= BOUNDS[3]


_OUTWARD_ANYWHERE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(?:\d[A-Z]{2})?\s*$")


def district_of(address: str, recorded: str | None = None) -> str | None:
    """Postcode district of a listing: end of the address ("…, London W9", "…, E1"), else what history recorded
    (truncated addresses lose it)."""
    m = _OUTWARD_ANYWHERE.search(address.upper().strip())
    return extract_postcode_area(address) or (m.group(1) if m else None) or recorded or None


def street_query(address: str, area: str | None = None) -> str | None:
    """'Flat 3, 12 Royal Mint Street, Tower Hill, London, E1' -> 'Royal Mint Street, E1, London'."""
    parts = [p.strip() for p in address.split(",") if p.strip()]
    street = next((p for p in parts if re.search(r"\b(road|street|st|lane|avenue|ave|gardens|square|place|terrace|grove|crescent|way|row|walk|mews|close|court|park|hill|drive|rise|villas|embankment|yard|gate)\b", p, re.I)), None)
    if not street:
        return None
    street = re.sub(r"^(?:flat|apartment|apt|unit)\s*\w+\s*", "", street, flags=re.I)
    street = re.sub(r"^\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+", "", street)  # house number: the street is what matters
    return f"{street}, {area}, London" if area else f"{street}, London"


def bulk_postcodes(postcodes: list[str]) -> dict[str, tuple[float, float] | None]:
    out: dict[str, tuple[float, float] | None] = {}
    for i in range(0, len(postcodes), 100):
        chunk = postcodes[i : i + 100]
        resp = requests.post("https://api.postcodes.io/postcodes", json={"postcodes": chunk}, timeout=30,
                             headers={"User-Agent": USER_AGENT})
        resp.raise_for_status()
        for item in resp.json()["result"]:
            r = item["result"]
            out[item["query"]] = (r["latitude"], r["longitude"]) if r and r.get("latitude") else None
        time.sleep(0.3)
    return out


def nominatim(query: str) -> tuple[float, float] | None:
    resp = requests.get("https://nominatim.openstreetmap.org/search", timeout=20,
                        params={"q": query, "format": "jsonv2", "limit": 1, "countrycodes": "gb"},
                        headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    hits = resp.json()
    return (float(hits[0]["lat"]), float(hits[0]["lon"])) if hits else None


def build(rows: list[dict], history: dict, centroids: dict, cache: dict, max_minutes: float,
          *, lookup_postcodes=bulk_postcodes, lookup_street=nominatim, sleep=time.sleep) -> dict:
    """Mutates `cache` (pc:<postcode> / st:<query> -> [lat, lon] or None) and returns the geo map."""
    records = history.get("listings") or {}
    attrs_by_key = {k: (v.get("attrs") or {}) for k, v in records.items()}
    area_by_key = {k: v.get("area") for k, v in records.items()}
    geo: dict[str, list] = {}
    need_pc: dict[str, str] = {}
    todo_street: list[tuple[str, str]] = []
    for row in rows:
        s = row["summary"]
        key = listing_key(row)
        a = attrs_by_key.get(key, {})
        if a.get("lat") is not None and a.get("lon") is not None and in_london(a["lat"], a["lon"]):
            geo[key] = [a["lat"], a["lon"], "e"]
            continue
        pc = a.get("postcode")
        if pc:
            need_pc[key] = pc.replace(" ", "")
        q = street_query(s["address"], district_of(s["address"], area_by_key.get(key)))
        if q:
            todo_street.append((key, q))

    wanted = sorted({pc for pc in need_pc.values() if f"pc:{pc}" not in cache})
    if wanted:
        for pc, hit in lookup_postcodes(wanted).items():
            cache[f"pc:{pc.replace(' ', '')}"] = list(hit) if hit else None
    for key, pc in need_pc.items():
        hit = cache.get(f"pc:{pc}")
        if hit and in_london(*hit):
            geo[key] = [hit[0], hit[1], "p"]

    deadline = time.monotonic() + max_minutes * 60
    for key, q in todo_street:
        if key in geo:
            continue
        ck = f"st:{q}"
        if ck not in cache and time.monotonic() < deadline:
            try:
                hit = lookup_street(q)
            except requests.RequestException:
                hit = None
                continue  # transient: don't cache a failure as "not found"
            cache[ck] = list(hit) if hit else None
            sleep(1.1)
        hit = cache.get(ck)
        if hit and in_london(*hit):
            geo[key] = [round(hit[0], 5), round(hit[1], 5), "s"]

    for row in rows:
        key = listing_key(row)
        if key not in geo:
            c = centroids.get(district_of(row["summary"]["address"], area_by_key.get(key)) or "")
            if c:
                geo[key] = [c["lat"], c["lon"], "a"]
    return geo


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listings", type=pathlib.Path, default=pathlib.Path("frontend/public/data/listings.json"))
    ap.add_argument("--history", type=pathlib.Path, default=pathlib.Path("analytics/history.json"))
    ap.add_argument("--centroids", type=pathlib.Path, default=pathlib.Path("frontend/public/data/area-centroids.json"))
    ap.add_argument("--cache", type=pathlib.Path, default=pathlib.Path("analytics/geocode-cache.json"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("frontend/public/data/listing-geo.json"))
    ap.add_argument("--max-minutes", type=float, default=15)
    args = ap.parse_args()

    rows = json.loads(args.listings.read_text())
    history = json.loads(args.history.read_text()) if args.history.exists() else {}
    if "listings" in history:
        migrate_history(history)  # the history may predate the agency-namespaced keys
    centroids = json.loads(args.centroids.read_text())
    cache = json.loads(args.cache.read_text()) if args.cache.exists() else {}
    geo = build(rows, history, centroids, cache, args.max_minutes)
    args.cache.parent.mkdir(parents=True, exist_ok=True)
    args.cache.write_text(json.dumps(cache))
    args.out.write_text(json.dumps(geo, separators=(",", ":")))
    kinds = {}
    for v in geo.values():
        kinds[v[2]] = kinds.get(v[2], 0) + 1
    print(f"located {len(geo)}/{len(rows)} listings: {kinds}")


if __name__ == "__main__":
    main()
