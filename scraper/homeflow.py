"""Parser for agency sites built on the Homeflow platform.

Client-side rendered — cards don't exist in the raw HTML (verified: a plain
HTTP GET of a Homeflow search page returns no `.property-card` markup at
all), so this needs a real browser. Playwright is reused across pages/detail
fetches rather than relaunched each time, since browser startup dominates
cost otherwise.

Pagination is `/page-N` appended to the search path (e.g.
`/properties/lettings/page-2`) — verified against two real sites
(innercityestates.com, johndwood.co.uk) on 2026-07-29 and 2026-08-07, not
documented anywhere; confirmed by diffing the set of property IDs returned
per page and following the discovered "next" link rather than assuming the
URL pattern holds everywhere. Both known themes share this same convention.

Homeflow is a fully hosted platform (unlike PropertyHive, which is a
self-hosted WordPress plugin), but it still offers bespoke themes to bigger
clients — johndwood.co.uk (a substantial multi-branch prime-London agency)
uses a completely different card/detail markup ("panel" theme below) from
innercityestates.com's stock template ("standard" theme). Unlike the two
PropertyHive themes, these two aren't just different class names on the same
shape: the panel theme's search cards don't expose bedroom/bathroom/reception
counts at all (bedrooms is embedded in a free-text title like "5 bedroom
terraced house to rent"; bathrooms/receptions aren't on the card whatsoever),
so `detail()` enriches the summary from the detail page's spec list rather
than leaving those fields None. That's a real structural difference, not
just cosmetic, so themes are handled as separate code paths (`_parse_card_*`
/ `_detail_*` methods) rather than forced into one selector-only config.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import replace
from urllib.parse import urljoin

from playwright.sync_api import Browser, sync_playwright

from .base import PlatformScraper
from .models import ListingDetail, ListingSummary
from .price import parse_price_pcm

_NEXT_PAGE_RE = re.compile(r"/page-(\d+)$")
_PANEL_ID_RE = re.compile(r"/properties/(\d+)/")
_PANEL_BEDROOMS_RE = re.compile(r"(\d+)\s*bedroom", re.IGNORECASE)


class HomeflowScraper(PlatformScraper):
    platform = "homeflow"

    def __init__(self, theme: str = "standard", browser: Browser | None = None) -> None:
        if theme not in ("standard", "panel"):
            raise ValueError(f"unknown homeflow theme: {theme!r}")
        self.theme = theme
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
        card_selector = ".property-card" if self.theme == "standard" else ".results-page .card"
        page = self._browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            url: str | None = search_url
            pages_fetched = 0
            seen_ids: set[str] = set()
            while url and pages_fetched < max_pages:
                # domcontentloaded + an explicit wait for the actual card
                # markup, not "networkidle" — johndwood.co.uk's heavier
                # analytics/chat-widget stack keeps background connections
                # open indefinitely, so networkidle reliably times out there
                # even though the content we need has long since rendered.
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_selector(card_selector, timeout=15_000)
                page.wait_for_timeout(800)

                cards = page.query_selector_all(card_selector)
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
        if self.theme == "panel":
            return self._parse_card_panel(agency, page_url, card)
        return self._parse_card_standard(agency, page_url, card)

    def _parse_card_standard(self, agency: str, page_url: str, card) -> ListingSummary | None:
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

    def _parse_card_panel(self, agency: str, page_url: str, card) -> ListingSummary | None:
        link = card.query_selector(".card__link")
        if link is None:
            return None
        href = link.get_attribute("href") or ""
        detail_url = urljoin(page_url, href)
        # No id attribute on this theme's card — Homeflow's own numeric
        # property id lives in the URL path instead (e.g.
        # /properties/21961151/lettings/NGL230001).
        id_match = _PANEL_ID_RE.search(href)
        if id_match is None:
            return None
        source_id = id_match.group(1)

        price_el = card.query_selector(".card__heading")
        price_text = price_el.inner_text().strip() if price_el else ""
        address_el = card.query_selector(".card__text-content")
        address = address_el.inner_text().strip() if address_el else ""
        # Bedroom count isn't its own field on this theme's card — it's
        # embedded in a free-text title like "5 bedroom terraced house to
        # rent". Bathrooms/receptions aren't on the card at all; detail()
        # enriches those from the spec list on the property page instead of
        # leaving them permanently None for every panel-theme listing.
        title_el = card.query_selector(".card__text-title")
        bedrooms_match = _PANEL_BEDROOMS_RE.search(title_el.inner_text()) if title_el else None
        thumb = card.query_selector(".card-image__content")

        return ListingSummary(
            source_id=source_id,
            agency=agency,
            platform=self.platform,
            url=detail_url,
            address=address,
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=int(bedrooms_match.group(1)) if bedrooms_match else None,
            bathrooms=None,
            receptions=None,
            thumbnail_url=thumb.get_attribute("src") if thumb else None,
            status=None,
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        if self.theme == "panel":
            return self._detail_panel(agency, summary)
        return self._detail_standard(agency, summary)

    def _detail_standard(self, agency: str, summary: ListingSummary) -> ListingDetail:
        page = self._browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            page.goto(summary.url, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_selector(".property-description", timeout=15_000)
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

    def _detail_panel(self, agency: str, summary: ListingSummary) -> ListingDetail:
        page = self._browser.new_page(viewport={"width": 1400, "height": 1000})
        try:
            page.goto(summary.url, wait_until="domcontentloaded", timeout=30_000)
            page.wait_for_selector(".details-frame__description-container--inner", timeout=15_000)
            page.wait_for_timeout(800)

            description_el = page.query_selector(".details-frame__description-container--inner")
            description = description_el.inner_text().strip() if description_el else ""

            # This theme has no separate bullet-point features list — the
            # narrative description is all there is.
            key_features: list[str] = []

            photo_urls = list(dict.fromkeys(
                img.get_attribute("src")
                for img in page.query_selector_all(".slider-wrapper .slide img")
                if img.get_attribute("src")
            ))

            # Enrich bed/bath/reception from the detail page's spec list —
            # this theme's search card doesn't expose bathrooms/receptions
            # at all, and only embeds bedrooms in a free-text title, so
            # without this every panel-theme listing would silently have
            # bathrooms=None/receptions=None in the exported dataset.
            spec = {"bedroom": None, "bathroom": None, "reception": None}
            for item in page.query_selector_all(".details-panel__spec-list-item"):
                icon = item.query_selector("[class*='icon-']")
                number_el = item.query_selector(".details-panel__spec-list-number")
                if icon is None or number_el is None:
                    continue
                icon_class = icon.get_attribute("class") or ""
                text = number_el.inner_text().strip()
                if not text.isdigit():
                    continue
                for key in spec:
                    if f"icon-{key}" in icon_class:
                        spec[key] = int(text)

            enriched_summary = replace(
                summary,
                bedrooms=spec["bedroom"] if spec["bedroom"] is not None else summary.bedrooms,
                bathrooms=spec["bathroom"],
                receptions=spec["reception"],
            )

            return ListingDetail(
                summary=enriched_summary,
                description=description,
                key_features=key_features,
                photo_urls=[u for u in photo_urls if u],
            )
        finally:
            page.close()
