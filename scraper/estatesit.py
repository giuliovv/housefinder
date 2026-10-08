"""Parser for agency sites on the EstatesIT website platform (lyonslondon.co.uk,
londonwideestates.com, ...) — server-rendered.

Results: `<site>/results?querytype=8&market=1&displayperpage=12` paged with
`&offset=N`. Cards are `.results-list-item` (id like `PC_LYONS_000216`), linking
to `/property/<area>/<ref>/1`. The card's address is only "London, Greater London,
W2" — a postcode district, which is what the analytics area uses anyway.
Photos are served resized (`?size=1920,1281`); we keep the largest per photo.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from . import http
from .attributes import extract_attributes
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm


class EstatesItScraper(PlatformScraper):
    platform = "estatesit"

    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        seen: set[str] = set()
        offset = 0
        for _ in range(max_pages):
            url = search_url if offset == 0 else f"{search_url}{'&' if '?' in search_url else '?'}offset={offset}"
            soup = BeautifulSoup(http.get(url, user_agent=self.user_agent), "html.parser")
            cards = soup.select(".results-list-item, div.results-list[id]")
            new = 0
            for card in cards:
                summary = self._parse_card(agency, card, url)
                if summary is not None and summary.source_id not in seen:
                    seen.add(summary.source_id)
                    new += 1
                    yield summary
            if new == 0:
                return
            offset += len(cards)

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        link = card.select_one('a[href*="/property/"]')
        if link is None or not card.get("id"):
            return None
        # Two theme variants: the price is in `.results_priceask`, or just text in the h3
        price_el = card.select_one(".results_priceask") or card.select_one("h3")
        price_text = re.sub(r"\s*Tenancy Info\s*$", "", _text(price_el) or "").strip()
        price_text = re.sub(r"^(?:To Rent|To Let|For Rent|Let Agreed|Under Offer|Let)\s*-\s*", "", price_text, flags=re.IGNORECASE)

        def count(css: str) -> int | None:
            m = re.search(r"\d+", _text(card.select_one(css)) or "")
            return int(m.group()) if m else None

        # the fees pop-up link's title carries the headline: "2 Bedroom Apartment to rent on ..."
        fees = card.select_one("a.pop-up-link[title]")
        beds_from_title = re.search(r"(\d+) Bedroom", fees["title"]) if fees else None

        status_el = card.select_one('[class*="results_propstat"]')
        status = _text(status_el)
        if status and status.lower() in ("to rent", "to let", "for rent"):
            status = None  # that's just "available", not a status
        img = card.select_one("img")
        thumb = (img.get("src") if img and img.get("src", "").startswith("http") else None)
        return ListingSummary(
            source_id=card["id"],
            agency=agency,
            platform=self.platform,
            url=urljoin(page_url, link["href"]),
            address=_text(card.select_one("h2")) or "",
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=count(".bedroom") if count(".bedroom") is not None else (int(beds_from_title.group(1)) if beds_from_title else None),
            bathrooms=count(".bathroom"),
            receptions=count(".receptions"),
            thumbnail_url=thumb,
            status=status,
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        section = soup.select_one("#description")
        description = " ".join(t for p in section.select("p") if (t := _text(p))) if section else ""
        features = [t for li in (section.select("li") if section else []) if (t := _text(li))]
        # The page lists each photo several times at different sizes (down to
        # 100px strip thumbnails). The image host resizes on request, so ask for a
        # large version of every distinct photo instead of picking whichever
        # variant happened to be in the page.
        bases: list[str] = []
        for img in soup.select("img[src]"):
            src = img["src"]
            if "/PHOTOS/" in src:
                base = src.split("?")[0]
                if base not in bases:
                    bases.append(base)
        return ListingDetail(
            summary=summary,
            description=description,
            key_features=features,
            photo_urls=[f"{b}?size=1200%2C800&format=webp" for b in bases],
            attributes=extract_attributes(soup, description=description, features=features, address=summary.address),
        )


def _text(node: Tag | None) -> str | None:
    return node.get_text(" ", strip=True) if node else None
