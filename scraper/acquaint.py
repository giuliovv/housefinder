"""Parser for agency sites on the Acquaint CRM's ASP.NET website template
(ashdownmarks.co.uk, homefullstop.com, astberrys.co.uk, ...) — server-rendered.

Lettings results are at `<site>/properties.aspx?mode=1&menuID=N`; each card is
`.item` with a `.property-list-image-container`, linking to a static-looking
`property-for-rent-<slug>-pi-<code>.htm` page. Paging is an ASP.NET postback
(`lnkPageNext` with the page's __VIEWSTATE), which is just a form submission,
so we make it the way a browser would: GET the first page keeping the cookie
session, POST each next page. Rents are usually weekly ("Price £6,950 pw").
Photos are `<id>-<n>.jpg` on the vendor's image host (thumbnails carry THUMB).
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag

from . import http
from .attributes import extract_attributes
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm

_CODE_RE = re.compile(r"-pi-([a-z0-9]+)\.htm", re.IGNORECASE)
_NEXT_TARGET = "ctl00$ContentPlaceHolderMain$lnkPageNext"


class AcquaintScraper(PlatformScraper):
    platform = "acquaint"

    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        session = requests.Session()
        seen: set[str] = set()
        html = http.get(search_url, user_agent=self.user_agent, session=session)
        for _ in range(max_pages):
            soup = BeautifulSoup(html, "html.parser")
            new = 0
            for card in soup.select(".item"):
                summary = self._parse_card(agency, card, search_url)
                if summary is not None and summary.source_id not in seen:
                    seen.add(summary.source_id)
                    new += 1
                    yield summary
            nxt = soup.select_one('a[id$="lnkPageNext"]')
            form = soup.select_one("form")
            if new == 0 or nxt is None or form is None or "aspNetDisabled" in (nxt.get("class") or []):
                return
            data = {i["name"]: i.get("value", "") for i in form.select("input[name]") if i.get("type") in ("hidden", "text", None)}
            data["__EVENTTARGET"] = _NEXT_TARGET
            data["__EVENTARGUMENT"] = ""
            html = http.post(urljoin(search_url, form.get("action") or search_url), data, user_agent=self.user_agent, session=session)

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        link = card.select_one('h3 a[href*="property-for-rent-"]')
        if link is None:
            return None
        match = _CODE_RE.search(link["href"])
        if match is None:
            return None
        price_text = _price_text(card)
        status_el = card.select_one('[class*="status-text"]')
        status = _text(status_el)

        def count(icon: str) -> int | None:
            el = card.select_one(f"i.{icon}")
            m = re.search(r"\d+", _text(el.parent) or "") if el is not None else None
            return int(m.group()) if m else None

        img = card.select_one("img")
        return ListingSummary(
            source_id=match.group(1).lower(),
            agency=agency,
            platform=self.platform,
            url=urljoin(page_url, link["href"]),
            address=_clean_address(_text(link) or ""),
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=count("icon-bedrooms"),
            bathrooms=count("icon-bathrooms"),
            receptions=None,
            thumbnail_url=img.get("src") if img else None,
            status=status,
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        desc_el = soup.select_one("#ContentPlaceHolderMain_lblPropertyMainDescription")
        description = re.sub(r"\s+", " ", desc_el.get_text(" ", strip=True)).strip() if desc_el else ""
        features = [t for li in soup.select("ul.property-features li") if (t := _text(li))]
        number = re.search(r"(\d+)$", summary.source_id)
        photos: list[str] = []
        for img in soup.select("img[src]"):
            src = img["src"]
            if number and re.search(rf"/{number.group(1)}-\d+\.(?:jpe?g|png)$", src, re.IGNORECASE) and src not in photos:
                photos.append(src)
        return ListingDetail(
            summary=summary,
            description=description,
            key_features=features,
            photo_urls=photos,
            attributes=extract_attributes(soup, description=description, features=features, address=summary.address),
        )


def _clean_address(text: str) -> str:
    """Some themes put the price inside the title link ("Sibley Grove, London Price £3,200 pcm")."""
    return re.sub(r"\s*Price\s*(?:£|POA|price on).*$", "", text, flags=re.IGNORECASE).strip()


def _price_text(card: Tag) -> str:
    """Most sites put the price in `.price span`; some (homefullstop.com) don't
    use that class at all, so fall back to the "Price £x pw" text on the card."""
    el = card.select_one(".price span")
    text = _text(el) if el is not None else None
    if not text:
        m = re.search(r"Price\s*(£\s*[\d,]+(?:\.\d+)?\s*(?:pw|pcm|p/w|per week|per month)?|POA|price on application)", card.get_text(" ", strip=True), re.IGNORECASE)
        text = m.group(1) if m else ""
    return re.sub(r"^\s*Price\s*", "", text, flags=re.IGNORECASE).strip()


def _text(node: Tag | None) -> str | None:
    return node.get_text(" ", strip=True) if node else None
