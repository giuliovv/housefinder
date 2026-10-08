"""Parser for agency sites on the Estate-Track Next.js template (e.g.
squiresestates.co.uk, collins-sarwar.com, homeviewestates.com).

Server-rendered, no browser needed. Results are at `<site>/properties/to-rent`
paged as `/page/N`; each card links to `/property-to-rent/<slug>`. The detail
page carries a schema.org `RealEstateListing` JSON-LD block with everything we
need (address, photos, bedrooms, description, amenities) — much sturdier than
the Tailwind markup, which is utility-class soup that changes freely.
robots.txt allows everything except `/api/`.
"""
from __future__ import annotations

import json
import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from . import http
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm

_SLUG_RE = re.compile(r"^/property-to-rent/([^/?#]+)")


class EstateTrackScraper(PlatformScraper):
    platform = "estatetrack"

    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        base = search_url.rstrip("/")
        seen: set[str] = set()
        for page in range(1, max_pages + 1):
            url = base if page == 1 else f"{base}/page/{page}"
            try:
                html = http.get(url, user_agent=self.user_agent)
            except Exception:  # noqa: BLE001 - past the last page the site 404s
                if page == 1:
                    raise
                return
            new = 0
            for card in _cards(BeautifulSoup(html, "html.parser")):
                summary = self._parse_card(agency, card, url)
                if summary is None or summary.source_id in seen:
                    continue
                seen.add(summary.source_id)
                new += 1
                yield summary
            if new == 0:
                return

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        link = card.select_one('a[href^="/property-to-rent/"]')
        match = _SLUG_RE.match(link["href"]) if link else None
        if link is None or match is None:
            return None
        price_el = card.find(string=re.compile(r"£\s*[\d,]+"))
        price_text = price_el.strip() if price_el else ""
        counts = [_first_int(s.get_text()) for s in card.select("span.font-bold")]
        counts += [None] * (3 - len(counts))
        badge = card.select_one('div[class*="rounded-full"]')
        return ListingSummary(
            source_id=match.group(1),
            agency=agency,
            platform=self.platform,
            url=urljoin(page_url, link["href"]),
            address=_text(card.select_one("h2")) or "",
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=counts[0],
            bathrooms=counts[1],
            receptions=counts[2],
            thumbnail_url=None,
            status=_text(badge),
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        listing = _listing_jsonld(soup)
        if listing is None:
            return ListingDetail(summary=summary, description="")
        item = (listing.get("offers") or {}).get("itemOffered") or {}
        photos = [u for u in item.get("image", []) if isinstance(u, str) and not re.search(r"floorplan|epc", u, re.I)]
        features = [f["name"] for f in item.get("amenityFeature", []) if isinstance(f, dict) and f.get("name")]
        return ListingDetail(
            summary=summary,
            description=re.sub(r"\s+", " ", listing.get("description") or "").strip(),
            key_features=features,
            photo_urls=list(dict.fromkeys(photos)),
        )


def _cards(soup: BeautifulSoup) -> list[Tag]:
    """One element per listing: the nearest ancestor of each card link that
    also holds the price (the card's `group` wrapper)."""
    cards: list[Tag] = []
    for a in soup.select('a[href^="/property-to-rent/"]'):
        node = a
        while node is not None and not (node.name == "div" and node.find(string=re.compile(r"£\s*[\d,]+"))):
            node = node.parent
        if node is not None and node not in cards:
            cards.append(node)
    return cards


def _listing_jsonld(soup: BeautifulSoup) -> dict | None:
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or "")
        except json.JSONDecodeError:
            continue
        for item in data if isinstance(data, list) else data.get("@graph", [data]):
            if isinstance(item, dict) and item.get("@type") == "RealEstateListing":
                return item
    return None


def _text(node: Tag | None) -> str | None:
    return node.get_text(" ", strip=True) if node else None


def _first_int(text: str) -> int | None:
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None
