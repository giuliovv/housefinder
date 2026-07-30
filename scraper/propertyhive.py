"""Parser for agency sites built on the PropertyHive WordPress plugin.

Server-rendered — plain requests + BeautifulSoup, no browser needed. This is
the cheap platform to scrape at scale; contrast with homeflow.py.

Verified against a real listing (properties.properly.space) on 2026-07-29 —
see tests/fixtures/propertyhive_*.html for the exact markup this was built
against. WordPress plugin markup is versioned per-site but shared across
every agency using PropertyHive, so this should generalise, not just work
for one site — that's the whole point of targeting the platform layer.
"""
from __future__ import annotations

from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from . import http
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm


def _text(node: Tag | None) -> str | None:
    return node.get_text(strip=True) if node else None


def _int(node: Tag | None) -> int | None:
    txt = _text(node)
    return int(txt) if txt and txt.isdigit() else None


class PropertyHiveScraper(PlatformScraper):
    platform = "propertyhive"

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        url: str | None = search_url
        pages_fetched = 0
        while url and pages_fetched < max_pages:
            html = http.get(url)
            soup = BeautifulSoup(html, "html.parser")
            for card in soup.select(".listing-a"):
                summary = self._parse_card(agency, card)
                if summary is not None:
                    yield summary
            pages_fetched += 1
            next_link = soup.select_one("a.next.page-numbers")
            url = urljoin(url, next_link["href"]) if next_link else None

    def _parse_card(self, agency: str, card: Tag) -> ListingSummary | None:
        link = card.select_one("a[href]")
        if link is None:
            return None
        detail_url = link["href"]
        source_id = detail_url.rstrip("/").rsplit("/", 1)[-1]

        price_text = _text(card.select_one(".price")) or ""
        thumb = card.select_one(".thumbnail img")

        return ListingSummary(
            source_id=source_id,
            agency=agency,
            platform=self.platform,
            url=detail_url,
            address=_text(card.select_one(".address")) or "",
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=_int(card.select_one(".bedroom")),
            bathrooms=_int(card.select_one(".bathroom")),
            receptions=_int(card.select_one(".reception")),
            thumbnail_url=thumb["src"] if thumb and thumb.has_attr("src") else None,
            status=_text(card.select_one(".status-badge")),
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        html = http.get(summary.url)
        soup = BeautifulSoup(html, "html.parser")

        description = _text(soup.select_one(".property-description")) or ""
        key_features = [_text(li) for li in soup.select(".property-features li")]
        # Each gallery thumbnail sits inside an <a href> to the full-resolution
        # image (fancybox lightbox markup) — prefer that over the -768x512
        # thumbnail the <img src> itself points to.
        photo_urls = []
        for fig in soup.select(".property-gallery > div"):
            link = fig.select_one("a[href]")
            img = fig.select_one("img[src]")
            if link is not None:
                photo_urls.append(link["href"])
            elif img is not None:
                photo_urls.append(img["src"])

        return ListingDetail(
            summary=summary,
            description=description,
            key_features=[f for f in key_features if f],
            photo_urls=photo_urls,
        )
