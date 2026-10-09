"""Parser for agency sites built on the Starberry CMS (Dexters,
Jonathan Arron, Battersea & Nine Elms, ...) — server-rendered, no browser.

Results live at `<site>/property-lettings/properties-to-rent-in-london`
(Dexters) paged as `/page-N`; each card is `li.result[data-property-id]`
linking to `/property-for-rent/<slug>/<id>`. Prices are shown weekly and
monthly ("£21,000 Pw / £91,000 Pcm"), the monthly figure being in a
`data-price` attribute. Detail pages host each photo in several sizes on a
Rackspace CDN; we keep the largest of each. robots.txt only disallows CMS
internals (Joomla-style paths).
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

_STATUS_CLASSES = {
    "let-agreed": "Let Agreed",
    "under-offer": "Under Offer",
    "let": "Let",
    "reserved": "Reserved",
    "sstc": "SSTC",
}


class StarberryScraper(PlatformScraper):
    platform = "starberry"

    def __init__(self, user_agent: str | None = None) -> None:
        self.user_agent = user_agent

    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        base = search_url.rstrip("/")
        seen: set[str] = set()
        for page in range(1, max_pages + 1):
            url = base if page == 1 else f"{base}/page-{page}"
            try:
                html = http.get(url, user_agent=self.user_agent)
            except Exception:  # noqa: BLE001 - past the last page the site 404s
                if page == 1:
                    raise
                return
            new = 0
            for card in BeautifulSoup(html, "html.parser").select("[data-property-id]"):
                summary = self._parse_card(agency, card, url)
                if summary is None or summary.source_id in seen:
                    continue
                seen.add(summary.source_id)
                new += 1
                yield summary
            if new == 0:
                return

    def _parse_card(self, agency: str, card: Tag, page_url: str) -> ListingSummary | None:
        # Three card layouts exist across Starberry themes (Dexters: li.result,
        # Jonathan Arron: figure.card, Battersea & Nine Elms: li.property).
        link = card.select_one('a[href*="/property-for-rent/"]')
        if link is None:
            return None
        title = card.select_one("h2, h3, .item-address, .property-title")
        area = card.select_one(".address-area-post")
        if title is not None:
            holder = title.select_one("a") or title
            # the area ("West Kensington, W14") is a child span of the same link;
            # take only the link's own text for the street part
            street = "".join(holder.find_all(string=True, recursive=False)).strip() if area else ""
            if not street:
                street = _text(holder) or ""
            address = ", ".join(p for p in (re.sub(r"\s+", " ", street).strip(" ,"), _text(area)) if p)
        else:
            address = ""
        # Fourth layout (Robinson Jackson, "nurtur" images): `.property-content h4` holds the price as its own
        # text and the address in a trailing <span> (an earlier span only carries the "Fees apply" link).
        heading = card.select_one(".property-content h4") if not address else None
        if heading is not None:
            spans = [t for sp in heading.find_all("span", recursive=False) if "fees-apply" not in (sp.get("class") or []) and (t := _text(sp))]
            address = spans[-1] if spans else ""

        price_el = card.select_one(".price, .meta-price")
        # the card appends the "(Tenant Info)" link text to the price; drop it
        raw_price = _text(price_el) or ""
        if not raw_price and heading is not None:
            raw_price = "".join(heading.find_all(string=True, recursive=False))
        price_text = re.sub(r"\s*\(Tenant Info\)", "", re.sub(r"\s+", " ", raw_price)).strip()
        monthly = self._monthly_price(card, price_text)

        def count(label: str, icon: str) -> int | None:
            node = card.select_one(f"li.{label}")
            if node is None:
                icon_el = card.select_one(f"i[class*='{icon}']")
                node = icon_el.parent if icon_el else None
            m = re.search(r"\d+", _text(node) or "")
            return int(m.group()) if m else None

        beds = count("Bedrooms", "icon-bedroom")
        if beds is None:  # figure.card has no counts; the image alt says "3 bedroom Flat to rent in ..."
            alt = (card.select_one("img") or {}).get("alt", "") if card.select_one("img") else ""
            m = re.search(r"(\d+) bedroom", alt, re.IGNORECASE)
            beds = int(m.group(1)) if m else None

        classes = set(card.get("class", []))
        status = next((label for key, label in _STATUS_CLASSES.items() if key in classes), None)
        img = card.select_one("img")
        return ListingSummary(
            source_id=card["data-property-id"],
            agency=agency,
            platform=self.platform,
            url=urljoin(page_url, link["href"]),
            address=address,
            price_text=price_text,
            price_pcm=monthly,
            bedrooms=beds,
            bathrooms=count("Bathrooms", "icon-bathroom"),
            receptions=count("Receptions", "icon-reception"),
            thumbnail_url=img.get("src") if img else None,
            status=status,
        )

    @staticmethod
    def _monthly_price(card: Tag, price_text: str) -> float | None:
        """`.price-qualifier[data-price]` holds one number; whether it is weekly
        or monthly depends on the text after it ("£21,000 Pw / £91,000 Pcm"
        puts the monthly one in the qualifier, "£4,616 per week" the weekly)."""
        qualifier = card.select_one(".price-qualifier[data-price]")
        if qualifier is None:
            return parse_price_pcm(price_text)
        try:
            amount = float(qualifier["data-price"])
        except ValueError:
            return parse_price_pcm(price_text)
        following = (qualifier.find_next_sibling(class_="price-text") or qualifier.next_sibling)
        unit = following.get_text(" ") if hasattr(following, "get_text") else str(following or "")
        weekly = bool(re.search(r"week|\bpw\b", unit, re.IGNORECASE)) and not re.search(r"pcm|month", unit, re.IGNORECASE)
        return round(amount * 52 / 12, 2) if weekly else amount

    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        soup = BeautifulSoup(http.get(summary.url, user_agent=self.user_agent), "html.parser")
        entry = soup.select_one(".section-entry")
        description = " ".join(t for p in entry.select("p") if (t := _text(p))) if entry else ""
        return ListingDetail(
            summary=summary,
            description=description,
            photo_urls=_photos(soup, summary.source_id),
            attributes=extract_attributes(soup, description=description, address=summary.address),
        )


def _photos(soup: BeautifulSoup, property_id: str) -> list[str]:
    """Each photo appears in several sizes (and in 'similar properties' strips
    for other ids); keep this property's photos, largest size of each."""
    best: dict[str, tuple[int, str]] = {}
    order: list[str] = []
    urls = [i.get("data-src") or i.get("src") or "" for i in soup.select("img")]
    urls += [a.get("href", "") for a in soup.select("a[href]")]
    for url in urls:
        if f"/{property_id}_" not in url or not re.search(r"\.(?:jpe?g|png|webp)(?:\?|$)", url, re.I):
            continue
        name = url.rsplit("/", 1)[-1]
        m = re.search(r"property_image\.(\d+)cm", url)
        width = int(m.group(1)) if m else 0
        if name not in best:
            order.append(name)
        if name not in best or width > best[name][0]:
            best[name] = (width, url)
    # Variants without a size code (property_image.x / .940x) are the odd
    # extras — floorplans/EPCs — not gallery photos.
    return [best[n][1] for n in order if best[n][0] > 0]


def _text(node: Tag | None) -> str | None:
    return node.get_text(" ", strip=True) if node else None
