"""Parser for agency sites built on the Homeflow platform.

Client-side rendered — cards don't exist in the raw HTML (verified: a plain
HTTP GET of a Homeflow search page returns no `.property-card` markup at
all), so this needs a real browser. Playwright is reused across pages/detail
fetches rather than relaunched each time, since browser startup dominates
cost otherwise.

Pagination is `/page-N` appended to the search path (e.g.
`/properties/lettings/page-2`) — verified against a real site
(innercityestates.com) on 2026-07-29, not documented anywhere; confirmed by
diffing the set of property IDs returned per page and following the
discovered "next" link rather than assuming the URL pattern holds everywhere.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from urllib.parse import urljoin

from playwright.sync_api import Browser, sync_playwright

from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm

_NEXT_PAGE_RE = re.compile(r"/page-(\d+)$")


class HomeflowScraper(PlatformScraper):
    platform = "homeflow"

    def __init__(self, browser: Browser | None = None) -> None:
        self._owns_browser = browser is None
        self._playwright = None
        if browser is None:
            self._playwright = sync_playwright().start()
            browser = self._playwright.chromium.launch(args=["--no-sandbox"])
        self._browser = browser

    def close(self) -> None:
        if self._owns_browser:
            self._browser.close()
            if self._playwright is not None:
                self._playwright.stop()

    def __enter__(self) -> "HomeflowScraper":
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        page = self._browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            url: str | None = search_url
            pages_fetched = 0
            seen_ids: set[str] = set()
            while url and pages_fetched < max_pages:
                page.goto(url, wait_until="networkidle", timeout=30_000)
                page.wait_for_timeout(800)

                cards = page.query_selector_all(".property-card")
                for card in cards:
                    summary = self._parse_card(agency, url, card)
                    if summary is not None and summary.source_id not in seen_ids:
                        seen_ids.add(summary.source_id)
                        yield summary
                pages_fetched += 1

                # Multiple page-N links exist (numbered pagination); pick the
                # one whose page number is exactly current+1 rather than
                # assuming the first match is "next".
                candidates = page.eval_on_selector_all(
                    'a[href*="/page-"]', "els => els.map(e => e.href)"
                )
                current_n = self._page_number(url)
                next_url = None
                for href in candidates:
                    n = self._page_number(href)
                    if n == current_n + 1:
                        next_url = href
                        break
                url = next_url
        finally:
            page.close()

    @staticmethod
    def _page_number(url: str) -> int:
        m = _NEXT_PAGE_RE.search(url)
        return int(m.group(1)) if m else 1

    def _parse_card(self, agency: str, page_url: str, card) -> ListingSummary | None:
        card_id = card.get_attribute("id") or ""
        source_id = card_id.replace("property-", "") if card_id else None
        link = card.query_selector("a.link-wrapper")
        if source_id is None or link is None:
            return None
        detail_url = urljoin(page_url, link.get_attribute("href") or "")

        price_el = card.query_selector(".price")
        # The "Let" / "Let Agreed" status, when present, is a nested
        # <span class="property-status..."> *inside* .price rather than its
        # own element — pull it out separately so price_text stays clean and
        # parse_price_pcm doesn't have to cope with trailing status words.
        status_el = price_el.query_selector(".property-status") if price_el else None
        status = status_el.inner_text().strip() if status_el else None
        price_text = price_el.inner_text().replace(status, "").strip() if (price_el and status) else (
            price_el.inner_text().strip() if price_el else ""
        )
        address = (card.query_selector(".display-address").inner_text().strip()
                   if card.query_selector(".display-address") else "")
        thumb = card.query_selector("img")

        return ListingSummary(
            source_id=source_id,
            agency=agency,
            platform=self.platform,
            url=detail_url,
            address=address,
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=self._icon_count(card, "bed"),
            bathrooms=self._icon_count(card, "bath"),
            receptions=self._icon_count(card, "couch"),
            thumbnail_url=thumb.get_attribute("data-src") or thumb.get_attribute("src") if thumb else None,
            status=status,
        )

    @staticmethod
    def _icon_count(card, icon_class: str) -> int | None:
        el = card.query_selector(f".icon.{icon_class} .d-inline-block")
        if el is None:
            return None
        txt = el.inner_text().strip()
        return int(txt) if txt.isdigit() else None

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        page = self._browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            page.goto(summary.url, wait_until="networkidle", timeout=30_000)
            page.wait_for_timeout(800)

            # Direct-child combinator matters here: the key-features <ul> is a
            # direct child of .description, but there's a second
            # .list-styled-inside <ul> nested inside
            # .material-information-content (the collapsed "Utilities /
            # Material information" panel) that we deliberately don't want
            # mixed in.
            key_features = [
                li.inner_text().strip()
                for li in page.query_selector_all(".description > ul.list-styled-inside li")
            ]
            # NOT .description (that's the whole panel: key features +
            # material-information + this narrative all mixed together).
            # The actual free-text narrative lives in its own
            # .property-description element further down the page.
            description_el = page.query_selector(".property-description")
            description = description_el.inner_text().strip() if description_el else ""

            photo_urls = list(dict.fromkeys(
                img.get_attribute("data-src") or img.get_attribute("src")
                for img in page.query_selector_all(".property-show-slider-container img")
                if img.get_attribute("data-src") or img.get_attribute("src")
            ))

            return ListingDetail(
                summary=summary,
                description=description,
                key_features=[f for f in key_features if f],
                photo_urls=[u for u in photo_urls if u],
            )
        finally:
            page.close()
