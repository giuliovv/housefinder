"""Foxtons (central London lettings only) — read from the Next.js page data of their public search pages.

Deliberately narrow, because Foxtons' website terms restrict reuse of their content and this is a conscious,
owner-accepted risk (see PLAN.md, 2026-10-09). The safeguards are built in, not optional:

  * **Kill switch** — `scraper/killswitch.py`: switching "foxtons" off stops scraping and removes its listings from
    the site (also instantly, without a deploy, through `/killswitch.json`). `ops/killswitch.py` flips it.
  * **Only what robots.txt allows.** The robots rules are fetched on every run and every URL is checked against
    them (wildcards included); if our paths ever become disallowed the run stops. The JSON API under /api/ is
    disallowed and is never touched — only the server-rendered search pages are read.
  * **Central London only**: a fixed list of central areas, and only listings in central postcode districts.
  * **Light**: a few dozen page requests, at most one every 3 seconds, no detail pages (the search page already
    carries photos, price, beds and location), identifying User-Agent, stops at the first bot challenge.
  * Rows that Foxtons shows as already let are skipped.
"""
from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from urllib.parse import urlparse

import requests

from . import http
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary

BASE = "https://www.foxtons.co.uk"
SEARCH_PATH = "/properties-to-rent"
# Foxtons' own area slugs (checked 2026-10-09); a search for an area also lists neighbouring places, so results are
# filtered to central postcode districts below.
CENTRAL_AREAS = [
    "pimlico", "victoria", "westminster", "belgravia", "knightsbridge", "chelsea", "kensington", "south-kensington",
    "earls-court", "mayfair", "marylebone", "soho", "fitzrovia", "covent-garden", "holborn", "bloomsbury",
    "clerkenwell", "barbican", "st-pauls", "moorgate", "london-bridge", "bermondsey", "waterloo", "vauxhall",
    "nine-elms", "paddington", "bayswater", "notting-hill", "st-johns-wood", "aldgate",
]
CENTRAL_DISTRICT = re.compile(r"^(SW1[A-Z]?|W1[A-Z]?|WC[12][A-Z]?|EC[1-4][A-Z]?|SE1|SW3|SW5|SW7|SW10|W2|W8|W11|NW1|NW8)$")
MAX_PAGES_PER_AREA = 15
MIN_DELAY_SECONDS = 3.0
http.HOST_DELAY["www.foxtons.co.uk"] = MIN_DELAY_SECONDS

_NEXT_DATA = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
_FLAGS = {"hasBalcony": "Balcony", "hasPatio": "Patio", "hasRoofTerrace": "Roof terrace", "hasGarden": "Garden"}


class Disallowed(http.Blocked):
    """robots.txt no longer allows what we fetch: treated like a block (the agency is backed off and an alert fires)."""


def parse_robots(text: str) -> list[tuple[bool, re.Pattern]]:
    """Rules of the `*` group as (allow?, compiled pattern), wildcard (`*`) and end-anchor (`$`) aware."""
    rules: list[tuple[bool, re.Pattern]] = []
    applies = False
    seen_rule = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        field, value = (p.strip() for p in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if seen_rule:
                applies = False
                seen_rule = False
            applies = applies or value == "*"
        elif field in ("allow", "disallow") and applies:
            seen_rule = True
            if value:
                pattern = re.escape(value).replace(r"\*", ".*")
                if pattern.endswith(r"\$"):
                    pattern = pattern[:-2] + "$"
                rules.append((field == "allow", re.compile(pattern)))
    return rules


def robots_allows(rules: list[tuple[bool, re.Pattern]], path_and_query: str) -> bool:
    """Longest matching rule wins; allow beats disallow on a tie; no match means allowed."""
    best: tuple[int, bool] | None = None
    for allow, pattern in rules:
        m = pattern.match(path_and_query)
        if m:
            key = (len(pattern.pattern), allow)
            if best is None or key > best:
                best = key
    return True if best is None else best[1]


def next_data(html: str) -> dict:
    m = _NEXT_DATA.search(html)
    if m is None:
        raise ValueError("no __NEXT_DATA__ in the page (layout changed?)")
    return json.loads(m.group(1))["props"]["pageProps"]["pageData"]["data"]


def to_summary(agency: str, item: dict) -> ListingSummary | None:
    """None for anything we don't want: not a letting, already let, not advertised, or not central."""
    if item.get("instructionType") != "letting" or item.get("isRecentLet") or not item.get("canWebAdvertise"):
        return None
    district = (item.get("postcodeShort") or "").upper()
    if not CENTRAL_DISTRICT.match(district):
        return None
    ref = item.get("propertyReference")
    pcm = item.get("pricePcm")
    if not ref or not pcm:
        return None
    street = (item.get("streetName") or "").strip()
    area = (item.get("locationName") or "").strip()
    address = ", ".join(p for p in (street, area, district) if p)
    photos = _photos(item)
    return ListingSummary(
        source_id=ref,
        agency=agency,
        platform="foxtons",
        url=f"{BASE}{SEARCH_PATH}/{district.lower()}/{ref}",
        address=address,
        price_text=f"£{int(round(pcm)):,} pcm",
        price_pcm=float(pcm),
        bedrooms=item.get("bedrooms"),
        bathrooms=item.get("bathrooms"),
        receptions=None,
        thumbnail_url=photos[0] if photos else None,
        status="Under offer" if item.get("isUnderOffer") else None,
    )


def _photos(item: dict) -> list[str]:
    assets = ((item.get("propertyBlob") or {}).get("assetInfo") or {}).get("assets") or {}
    return [p["src"] for p in (assets.get("photos") or []) if p.get("src")]


class FoxtonsScraper(PlatformScraper):
    platform = "foxtons"

    def __init__(self, user_agent: str | None = None, areas: list[str] | None = None) -> None:
        self.user_agent = user_agent
        self.areas = areas or CENTRAL_AREAS
        self._items: dict[str, dict] = {}
        self._rules: list[tuple[bool, re.Pattern]] | None = None

    def _check_robots(self, path_and_query: str) -> None:
        if self._rules is None:
            self._rules = parse_robots(http.get(f"{BASE}/robots.txt", user_agent=self.user_agent))
        if not robots_allows(self._rules, path_and_query):
            raise Disallowed(f"robots.txt disallows {path_and_query}; not fetching")

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        seen: set[str] = set()
        for area in self.areas:
            for page in range(1, MAX_PAGES_PER_AREA + 1):
                path = f"{SEARCH_PATH}/{area}" + (f"?page={page}" if page > 1 else "")
                self._check_robots(path)
                data = next_data(http.get(BASE + path, timeout=30, user_agent=self.user_agent))
                items = data.get("data") or []
                central = 0
                for item in items:
                    summary = to_summary(agency, item)
                    if summary is None:
                        continue
                    central += 1
                    if summary.source_id in seen:
                        continue
                    seen.add(summary.source_id)
                    self._items[summary.source_id] = item
                    yield summary
                # stop paging an area once its pages stop being on-topic (the tail is neighbouring areas)
                # or it has run out of pages
                if page >= (data.get("totalPages") or 1) or not items or central == 0:
                    break

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        """No request: the search result already holds everything we show."""
        item = self._items[summary.source_id]
        blob = item.get("propertyBlob") or {}
        features = [str(b) for b in (blob.get("bulletPoints") or []) if b]
        features += [label for key, label in _FLAGS.items() if item.get(key)]
        attrs: dict = {"property_type": {"flats": "flat", "houses": "house"}.get(item.get("typeGroup") or "", None)}
        if blob.get("floorArea"):
            attrs["floor_area_sqft"] = int(blob["floorArea"])
        loc = item.get("location") or {}
        if loc.get("lat") is not None and loc.get("lon") is not None:
            attrs["lat"], attrs["lon"] = round(float(loc["lat"]), 6), round(float(loc["lon"]), 6)
        if features:
            attrs["amenities"] = sorted({a for a, k in (("balcony", "Balcony"), ("garden", "Garden")) if k in features})
        attrs = {k: v for k, v in attrs.items() if v not in (None, [])}
        return ListingDetail(summary=summary, description="", key_features=features, photo_urls=_photos(item), attributes=attrs)
