"""Parser for agency sites built on Expert Agent's website platform
("eapow" — Joomla-based, server-rendered, no browser needed).

Many small independent agencies share this template (found via
scraper/discover.py): lettings results at `<site>/properties-to-let`, cards
with id `eapow-listing-<id>`, detail pages at `/properties-to-let/property/
<id>-<slug>`, photos hosted on Alto's media S3 bucket. Unlike Property Hive
there's no theme variation to parameterise — the markup is the same across
the agencies checked (circaproperty.co.uk, houghtonestates.com,
messilaresidential.com, ...) — see tests/fixtures/expertagent_*.html.

Pagination: results are paged by an item offset, `?limitstart=N`. The page
shows no usable "next" link, so we keep asking for the next offset until a
page adds nothing new.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from bs4 import BeautifulSoup, Tag

from . import http
from .base import PlatformScraper
from .attributes import extract_attributes
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm

_ID_RE = re.compile(r"eapow-listing-(\d+)")


class ExpertAgentScraper(PlatformScraper):
    platform = "expertagent"

    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        seen: set[str] = set()
        page_size = 0
        for page in range(max_pages):
            url = search_url if page == 0 else f"{search_url}{'&' if '?' in search_url else '?'}limitstart={page * page_size}"
            soup = BeautifulSoup(http.get(url, user_agent=self.user_agent), "html.parser")
            cards = soup.select('[id^="eapow-listing-"]')
            new = 0
            for card in cards:
                summary = self._parse_card(agency, card, url)
                if summary is None or summary.source_id in seen:
                    continue
                seen.add(summary.source_id)
                new += 1
                yield summary
            if page == 0:
                page_size = len(cards)
            if new == 0 or page_size == 0:
                return

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        match = _ID_RE.search(card.get("id", ""))
        link = card.select_one('a[href*="/property/"]')
        if match is None or link is None:
            return None
        price_text = _text(card.select_one(".eapow-overview-price")) or ""
        counts = [_first_int(n.get_text()) for n in card.select(".eapow-listings-icons .IconNum")]
        counts += [None] * (3 - len(counts))
        thumb = card.select_one("img.eapow-overview-thumb")
        banner = card.select_one(".eapow-bannertopright img[alt]")
        return ListingSummary(
            source_id=match.group(1),
            agency=agency,
            platform=self.platform,
            url=urljoin(page_url, link["href"]),
            address=_text(card.select_one("h3")) or "",
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=counts[0],
            bathrooms=counts[1],
            receptions=counts[2],
            thumbnail_url=(thumb.get("data-src") or thumb.get("src")) if thumb else None,
            status=banner["alt"].strip() if banner else None,
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        desc = soup.select_one(".eapow-desc-wrapper")
        description = " ".join(_text(p) or "" for p in desc.select("p")).strip() if desc else ""
        # Two gallery templates are in use across agencies (a "splide" slider
        # and a "flexslider"); photos are hosted on varying CDNs (Alto media,
        # estateweb, portalimages, expertagent). Each photo can appear twice
        # (main slide + thumbnail strip), and some sites mix in floorplans/EPCs.
        photos: list[str] = []
        for img in soup.select(".splide__slide img, .flexslider img"):
            src = img.get("data-src") or img.get("src") or ""
            if (
                src.startswith("http")
                and re.search(r"\.(?:jpe?g|png|webp)(?:\?|$)", src, re.IGNORECASE)
                and not re.search(r"floorplan|epc|brochure|/thumbs?/", src, re.IGNORECASE)
                and src not in photos
            ):
                photos.append(src)
        features = [t for li in soup.select(".eapow-star-items li") if (t := _text(li))]
        return ListingDetail(
            summary=summary,
            description=description,
            key_features=features,
            photo_urls=photos,
            attributes=extract_attributes(soup, description=description, features=features, address=summary.address),
        )


def _text(node: Tag | None) -> str | None:
    return node.get_text(" ", strip=True) if node else None


def _first_int(text: str) -> int | None:
    m = re.search(r"\d+", text)
    return int(m.group()) if m else None
