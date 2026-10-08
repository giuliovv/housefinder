"""Find candidate agencies to scrape: London estate agents with a website from
OpenStreetMap, then fingerprint each site's platform from its homepage.

There is no directory of which agencies run which website platform, and the
platform vendors don't publish client lists, so this is how candidates are
found. The fingerprint is a hint, not proof — a hit still needs a real check
(a lettings results page with listings, saved as a fixture, before a parser
is written; see PLAN.md). Uses the project's identifying User-Agent and
respects a blanket `Disallow: /` for `*` in robots.txt.

Usage:
    python -m scraper.discover --out /tmp/agency-candidates.json
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor

import requests

from .http import USER_AGENT

# Greater London bounding box (south, west, north, east)
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
LONDON_BBOX = "51.28,-0.51,51.69,0.33"
PLATFORM_PATTERNS = {
    "propertyhive": r"plugins/propertyhive|propertyhive",
    "homeflow": r"homeflow",
    "street": r"street\.co\.uk|streetgroup|spectre",
    "expertagent": r"expertagent|eaweb|expert agent",
    "jupix": r"jupix",
    "apex27": r"apex27",
    "dezrez": r"dezrez",
    "vebra": r"vebra",
    "reapit": r"reapit",
    "gnomen": r"gnomen",
    "estatetrack": r"estate-track\.co\.uk",
}


def osm_agency_sites() -> dict[str, dict]:
    """host -> {name, lat, lon}, for estate agents in London that list a website."""
    q = (
        f'[out:json][timeout:90];(node["office"="estate_agent"]({LONDON_BBOX});'
        f'way["office"="estate_agent"]({LONDON_BBOX});node["shop"="estate_agent"]({LONDON_BBOX}););out tags center;'
    )
    # the public Overpass servers are often overloaded; try the mirrors in turn
    last: Exception | None = None
    for endpoint in OVERPASS_ENDPOINTS:
        try:
            r = requests.post(endpoint, data={"data": q}, headers={"User-Agent": USER_AGENT}, timeout=120)
            r.raise_for_status()
            break
        except requests.RequestException as exc:
            last = exc
    else:
        raise RuntimeError(f"all Overpass endpoints failed: {last}")
    sites: dict[str, dict] = {}
    for e in r.json()["elements"]:
        tags = e.get("tags", {})
        site = tags.get("website") or tags.get("contact:website") or tags.get("url")
        if not site:
            continue
        if not site.startswith("http"):
            site = "http://" + site
        host = urllib.parse.urlparse(site).netloc.lower().removeprefix("www.")
        centre = e.get("center") or e
        sites.setdefault(host, {"name": tags.get("name", ""), "lat": centre.get("lat"), "lon": centre.get("lon")})
    return sites


def fingerprint(host: str) -> dict:
    out: dict = {"host": host}
    try:
        r = requests.get(f"https://{host}/", headers={"User-Agent": USER_AGENT}, timeout=12)
        out["status"] = r.status_code
        body = r.text[:400_000]
        out["cloudflare_challenge"] = r.status_code == 403 and bool(re.search(r"just a moment|cf_chl", body, re.I))
        out["platforms"] = [k for k, p in PLATFORM_PATTERNS.items() if re.search(p, body, re.I)]
        robots = requests.get(f"https://{host}/robots.txt", headers={"User-Agent": USER_AGENT}, timeout=8)
        group = re.search(r"user-agent:\s*\*\s*(.*?)(?=user-agent:|\Z)", robots.text if robots.status_code == 200 else "", re.I | re.S)
        out["robots_blocks_all"] = bool(group and re.search(r"^\s*disallow:\s*/\s*$", group.group(1), re.I | re.M))
    except Exception as exc:  # noqa: BLE001 - an unreachable candidate is just a non-result
        out["status"] = 0
        out["error"] = type(exc).__name__
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()
    sites = osm_agency_sites()
    print(f"{len(sites)} candidate sites from OpenStreetMap")
    with ThreadPoolExecutor(16) as pool:  # one request per host, so still polite
        results = list(pool.map(fingerprint, sites))
    for r in results:
        r.update(sites[r["host"]])
    args.out.write_text(json.dumps(results, indent=1))
    print(f"wrote {len(results)} fingerprints to {args.out}")


if __name__ == "__main__":
    main()
