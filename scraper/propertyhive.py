"""Parser for agency sites built on the PropertyHive WordPress plugin.

Server-rendered — plain requests + BeautifulSoup, no browser needed. This is
the cheap platform to scrape at scale; contrast with homeflow.py.

PropertyHive is a *plugin*, not a hosted platform like Homeflow — the theme
each agency runs restyles its output, and themes can diverge far enough that
one selector set doesn't cover both. Confirmed directly: properly.space's
theme wraps each listing in `.listing-a` with `.bedroom`/`.bathroom`
classes; Parkgate (parkgate.co.uk, a different real agency on the same
plugin, found via PropertyHive's own site showcase) wraps listings in
`li.property` with `.room-bedrooms .room-count` instead — different enough
that reusing the first theme's selectors on the second silently returns
nothing, not an error. So `PropertyHiveTheme` parameterises the selectors
rather than assuming "one PropertyHive parser" covers every agency on the
plugin; add a new preset here if a third theme shows up, don't guess that
an existing one will match.

Both presets verified against real, live sites — see
tests/fixtures/propertyhive_*.html (healthypixels) and
tests/fixtures/parkgate_*.html (veco).
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
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


@dataclass(frozen=True)
class PropertyHiveTheme:
    name: str
    card_selector: str
    card_link_selector: str        # relative to a card
    card_address_selector: str     # relative to a card
    card_price_selector: str       # relative to a card
    card_thumb_selector: str       # relative to a card
    card_bedrooms_selector: str    # relative to a card
    card_bathrooms_selector: str   # relative to a card
    card_receptions_selector: str  # relative to a card
    card_status_selector: str      # relative to a card
    description_selector: str      # on the detail page
    features_item_selector: str    # on the detail page
    gallery_container_selector: str  # on the detail page — direct children (or their <a>/<img>) are photos


# properly.space's theme
HEALTHYPIXELS_THEME = PropertyHiveTheme(
    name="healthypixels",
    card_selector=".listing-a",
    card_link_selector="a[href]",
    card_address_selector=".address",
    card_price_selector=".price",
    card_thumb_selector=".thumbnail img",
    card_bedrooms_selector=".bedroom",
    card_bathrooms_selector=".bathroom",
    card_receptions_selector=".reception",
    card_status_selector=".status-badge",
    description_selector=".property-description",
    features_item_selector=".property-features li",
    gallery_container_selector=".property-gallery > div",
)

# parkgate.co.uk's theme ("veco" — per the image filename prefix, e.g.
# veco-1ff000f4-....jpg — likely a WordPress real-estate theme brand)
VECO_THEME = PropertyHiveTheme(
    name="veco",
    # NOT just "li.property" — the theme's own offcanvas nav menu has
    # <li class="property offcanvas--item menu-item ...">, a literal nav
    # link labeled "Property" that happens to share the class name. Scoping
    # to the real listings wrapper (<ul class="properties clear">) is what
    # actually excludes it — caught by the offline test finding 14 cards
    # instead of the fixture's real count of 12.
    card_selector="ul.properties li.property",
    card_link_selector="h3 a[href]",
    card_address_selector="h3 a",
    card_price_selector=".price",
    card_thumb_selector=".thumbnail img",
    card_bedrooms_selector=".room-bedrooms .room-count",
    card_bathrooms_selector=".room-bathrooms .room-count",
    card_receptions_selector=".room-receptions .room-count",
    card_status_selector=".property-card__flag",
    description_selector=".single-prop__description__inner",
    features_item_selector=".single-prop__features li",
    gallery_container_selector=".single-prop__slider",
)


class PropertyHiveScraper(PlatformScraper):
    platform = "propertyhive"

    def __init__(self, theme: PropertyHiveTheme = HEALTHYPIXELS_THEME) -> None:
        self.theme = theme

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        url: str | None = search_url
        pages_fetched = 0
        while url and pages_fetched < max_pages:
            html = http.get(url)
            soup = BeautifulSoup(html, "html.parser")
            for card in soup.select(self.theme.card_selector):
                summary = self._parse_card(agency, card)
                if summary is not None:
                    yield summary
            pages_fetched += 1
            # Same WordPress pagination convention across both known themes —
            # if a third theme breaks this, it becomes a per-theme field too.
            next_link = soup.select_one("a.next.page-numbers")
            url = urljoin(url, next_link["href"]) if next_link else None

    def _parse_card(self, agency: str, card: Tag) -> ListingSummary | None:
        t = self.theme
        link = card.select_one(t.card_link_selector)
        if link is None:
            return None
        detail_url = link["href"]
        source_id = detail_url.rstrip("/").rsplit("/", 1)[-1]

        price_text = _text(card.select_one(t.card_price_selector)) or ""
        thumb = card.select_one(t.card_thumb_selector)

        return ListingSummary(
            source_id=source_id,
            agency=agency,
            platform=self.platform,
            url=detail_url,
            address=_text(card.select_one(t.card_address_selector)) or "",
            price_text=price_text,
            price_pcm=parse_price_pcm(price_text),
            bedrooms=_int(card.select_one(t.card_bedrooms_selector)),
            bathrooms=_int(card.select_one(t.card_bathrooms_selector)),
            receptions=_int(card.select_one(t.card_receptions_selector)),
            thumbnail_url=thumb["src"] if thumb and thumb.has_attr("src") else None,
            status=_text(card.select_one(t.card_status_selector)),
        )

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        t = self.theme
        html = http.get(summary.url)
        soup = BeautifulSoup(html, "html.parser")

        description_el = soup.select_one(t.description_selector)
        # Both themes put a "Key features"/"Full details"-style <h2> heading
        # inside the same container as the actual text — pull paragraph text
        # only so that heading doesn't pollute the CLIP text embedding later.
        if description_el is not None:
            paragraphs = description_el.select("p")
            description = " ".join(_text(p) or "" for p in paragraphs).strip() or _text(description_el) or ""
        else:
            description = ""

        key_features = [_text(li) for li in soup.select(t.features_item_selector)]

        photo_urls: list[str] = []
        gallery = soup.select_one(t.gallery_container_selector)
        if gallery is not None:
            # Prefer each thumbnail's full-resolution lightbox link over the
            # <img src> itself, same reasoning as the healthypixels theme;
            # fall back to <img src> directly if there's no wrapping <a>.
            children = gallery.select(":scope > div") or [gallery]
            for child in children:
                link = child.select_one("a[href]")
                img = child.select_one("img[src]")
                if link is not None and "wp-content" in link.get("href", ""):
                    photo_urls.append(link["href"])
                elif img is not None and "wp-content" in img.get("src", ""):
                    photo_urls.append(img["src"])

        return ListingDetail(
            summary=summary,
            description=description,
            key_features=[f for f in key_features if f],
            photo_urls=photo_urls,
        )
