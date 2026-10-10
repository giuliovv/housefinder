"""One scraper for bespoke agency websites, driven by a small per-site selector config (`Theme`).

Many agencies run a one-off WordPress/custom site that no shared platform parser fits. Their pages are all
server-rendered cards (a link, an address, a price, bed/bath counts), so a site is a few CSS selectors plus a
fixture test rather than a new parser. Photos on the detail page are found heuristically (`gather_photos`): the page's
`og:image` names the property's photo folder/id, and only images from the same place are kept, which leaves out
"similar properties" thumbnails and site furniture.

Same ground rules as every parser: honest User-Agent, polite delay, robots.txt respected (the agencies listed here
were checked), stop at a bot challenge. See PLAN.md.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from . import http
from .attributes import extract_attributes
from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm


@dataclass(frozen=True)
class Theme:
    card: str                       # CSS selector for one listing card
    address: str                    # selector (inside the card) whose text is the address; several matches are joined
    price: str                      # selector for the price text (may contain "£x pw (£y pcm)")
    link: str | None = None         # selector for the detail link inside the card; None = the card itself is the <a>
    beds: str | None = None         # selector whose first number is the bedroom count
    baths: str | None = None
    status: str | None = None       # selector for a "Let Agreed" style pill
    photos_scope: str | None = None  # selector for the detail page's main content (keeps out related-property blocks)
    description: str | None = None
    id_from_url: str = r"/([^/]+)/?$"  # regex over the detail url; group 1 is the source id
    address_sep: str = ", "


_NEXT_TEXT = {"next", ">", "›", "»", "next ›", "next »", "next page"}
_IMG_EXT = re.compile(r"\.(?:jpe?g|png|webp)(?:\?|$)", re.IGNORECASE)
_JUNK = re.compile(r"logo|icon|avatar|sprite|flag|placeholder|favicon|badge|banner|team|staff|blank", re.IGNORECASE)
_SIZE_SUFFIX = re.compile(r"-\d{2,4}x\d{2,4}(?=\.\w+$)")


def _text(node: Tag | None) -> str:
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip() if node is not None else ""


def next_url(soup: BeautifulSoup, page_url: str) -> str | None:
    link = soup.select_one('a[rel="next"], link[rel="next"], a.next, li.next a, .pagination .next a')
    if link is None:
        link = next((a for a in soup.find_all("a", href=True) if _text(a).lower() in _NEXT_TEXT), None)
    href = link.get("href") if link is not None else None
    if not href or href.startswith("#") or href.startswith("javascript"):
        return None
    return urljoin(page_url, href)


def _largest(url: str) -> str:
    """WordPress thumbnails carry a -768x429 suffix; the un-suffixed file is the full image."""
    return _SIZE_SUFFIX.sub("", url)


def gather_photos(soup: BeautifulSoup, page_url: str, scope: str | None = None) -> list[str]:
    """The property's own photos. `og:image` anchors the search (same folder, or sharing its long number)."""
    root = (soup.select_one(scope) if scope else None) or soup
    for junk in root.select("footer, nav, header, [class*=similar], [class*=related], [class*=recommend]"):
        junk.decompose()
    urls: list[str] = []
    for el in root.find_all(["img", "source", "a"]):
        for attr in ("src", "data-src", "data-lazy-src", "data-original", "href", "srcset", "data-srcset"):
            raw = el.get(attr)
            if not raw:
                continue
            first = raw.split(",")[0].strip().split(" ")[0]
            if _IMG_EXT.search(first) and not _JUNK.search(first):
                urls.append(_largest(urljoin(page_url, first)))
    og = soup.find("meta", attrs={"property": "og:image"})
    anchor = urljoin(page_url, og["content"]) if og is not None and og.get("content") else None
    ordered = list(dict.fromkeys(urls))
    if anchor:
        folder = anchor.rsplit("/", 1)[0]
        numbers = set(re.findall(r"\d{5,}", anchor.rsplit("/", 1)[1]))
        mine = [u for u in ordered if u.rsplit("/", 1)[0] == folder or any(n in u for n in numbers)]
        if len(mine) >= 2:
            ordered = mine
        if anchor not in ordered:
            ordered.insert(0, anchor)
    # the largest group sharing one folder is the gallery
    if ordered:
        by_folder: dict[str, list[str]] = {}
        for u in ordered:
            by_folder.setdefault(u.rsplit("/", 1)[0], []).append(u)
        biggest = max(by_folder.values(), key=len)
        if len(biggest) >= 3:
            ordered = biggest
    return ordered[:30]


class ThemedScraper(PlatformScraper):
    platform = "themed"

    def __init__(self, theme: Theme, user_agent: str | None = None) -> None:
        self.theme = theme
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        seen: set[str] = set()
        url: str | None = search_url
        for _ in range(max_pages):
            if url is None:
                return
            soup = BeautifulSoup(http.get(url, user_agent=self.user_agent), "html.parser")
            new = 0
            for card in soup.select(self.theme.card):
                summary = self._parse_card(agency, card, url)
                if summary is not None and summary.source_id not in seen:
                    seen.add(summary.source_id)
                    new += 1
                    yield summary
            nxt = next_url(soup, url)
            if new == 0 or nxt == url:
                return
            url = nxt

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        t = self.theme
        if t.link is None and card.name == "a":
            link_el = card
        else:
            link_el = card.select_one(t.link or "a[href]") or card.find_parent("a")  # some sites wrap the card in the link
        href = link_el.get("href") if link_el is not None else None
        if not href:
            return None
        url = urljoin(page_url, href)
        m = re.search(t.id_from_url, urlparse(url).path)
        if m is None:
            return None
        address = t.address_sep.join(x for x in (_text(n) for n in card.select(t.address)) if x)
        price_text = _text(card.select_one(t.price))
        if not address or not price_text:
            return None

        def count(selector: str | None) -> int | None:
            node = card.select_one(selector) if selector else None
            n = re.search(r"\d+", _text(node)) if node is not None else None
            return int(n.group()) if n else None

        img = card.select_one("img")
        thumb = (img.get("src") or img.get("data-src")) if img is not None else None
        return ListingSummary(
            source_id=m.group(1),
            agency=agency,
            platform=self.platform,
            url=url,
            address=address,
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=count(t.beds),
            bathrooms=count(t.baths),
            receptions=None,
            thumbnail_url=urljoin(page_url, thumb) if thumb else None,
            status=_text(card.select_one(t.status)) or None if t.status else None,
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        t = self.theme
        desc_el = soup.select_one(t.description) if t.description else None
        description = _text(desc_el)
        photos = gather_photos(soup, summary.url, t.photos_scope)
        if not photos and summary.thumbnail_url:
            photos = [summary.thumbnail_url]
        return ListingDetail(
            summary=summary,
            description=description,
            key_features=[],
            photo_urls=photos,
            attributes=extract_attributes(soup, description=description, features=[], address=summary.address),
        )
