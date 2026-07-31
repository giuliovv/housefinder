"""Offline tests against saved fixture HTML — no network needed, and these
keep working even if the live site changes layout later (which is when
you'd update the fixture and see exactly what broke)."""
import pathlib

from bs4 import BeautifulSoup

from scraper.propertyhive import HEALTHYPIXELS_THEME, VECO_THEME, PropertyHiveScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def test_parses_search_card_healthypixels() -> None:
    html = (FIXTURES / "propertyhive_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(HEALTHYPIXELS_THEME.card_selector)
    scraper = PropertyHiveScraper(theme=HEALTHYPIXELS_THEME)

    summary = scraper._parse_card("properly", card)

    assert summary is not None
    assert summary.platform == "propertyhive"
    assert summary.agency == "properly"
    assert summary.url.startswith("https://properties.properly.space/property/")
    assert summary.address
    assert summary.price_pcm is not None and summary.price_pcm > 0
    assert summary.bedrooms is not None


def test_parses_search_card_veco() -> None:
    html = (FIXTURES / "parkgate_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(VECO_THEME.card_selector)
    scraper = PropertyHiveScraper(theme=VECO_THEME)

    summary = scraper._parse_card("parkgate", card)

    assert summary is not None
    assert summary.platform == "propertyhive"
    assert summary.agency == "parkgate"
    assert summary.url.startswith("https://www.parkgate.co.uk/property/")
    assert summary.address
    assert summary.price_pcm is not None and summary.price_pcm > 0
    assert summary.bedrooms is not None
    assert summary.bathrooms is not None
    assert summary.receptions is not None


def test_parses_detail_page_healthypixels() -> None:
    html = (FIXTURES / "propertyhive_detail.html").read_text()
    soup = BeautifulSoup(html, "html.parser")

    description = soup.select_one(HEALTHYPIXELS_THEME.description_selector).get_text(strip=True)
    key_features = [li.get_text(strip=True) for li in soup.select(HEALTHYPIXELS_THEME.features_item_selector)]
    photo_urls = []
    for fig in soup.select(HEALTHYPIXELS_THEME.gallery_container_selector):
        link = fig.select_one("a[href]")
        if link is not None:
            photo_urls.append(link["href"])

    assert description
    assert len(key_features) > 0
    assert len(photo_urls) > 0
    assert all(u.endswith((".jpg", ".jpeg", ".png")) for u in photo_urls)


def test_parses_detail_page_veco() -> None:
    html = (FIXTURES / "parkgate_detail.html").read_text()
    soup = BeautifulSoup(html, "html.parser")

    description_el = soup.select_one(VECO_THEME.description_selector)
    description = " ".join(p.get_text(strip=True) for p in description_el.select("p"))
    key_features = [li.get_text(strip=True) for li in soup.select(VECO_THEME.features_item_selector)]

    gallery = soup.select_one(VECO_THEME.gallery_container_selector)
    photo_urls = []
    for child in gallery.select(":scope > div"):
        link = child.select_one("a[href]")
        if link is not None and "wp-content" in link["href"]:
            photo_urls.append(link["href"])

    assert "Kingston Hill" in description or "Richmond Park" in description
    # this exact listing's h2 heading text ("FULL DETAILS") must NOT leak
    # into the extracted description — regression check for the bug this
    # theme's naive .get_text() would have hit (see propertyhive.py comment)
    assert "FULL DETAILS" not in description
    assert "Seven Bedroom House" in key_features
    assert len(photo_urls) > 0
    assert all("wp-content/uploads" in u for u in photo_urls)


def test_search_finds_all_cards_and_pagination_link_healthypixels() -> None:
    html = (FIXTURES / "propertyhive_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")

    cards = soup.select(HEALTHYPIXELS_THEME.card_selector)
    assert len(cards) == 12  # "Showing 1-12 of 40 properties" at fixture-capture time

    next_link = soup.select_one("a.next.page-numbers")
    assert next_link is not None
    assert "/page/2/" in next_link["href"]


def test_search_finds_all_cards_and_pagination_link_veco() -> None:
    html = (FIXTURES / "parkgate_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")

    cards = soup.select(VECO_THEME.card_selector)
    assert len(cards) == 12  # "Showing 1-12 of 46 properties" at fixture-capture time

    next_link = soup.select_one("a.next.page-numbers")
    assert next_link is not None
    assert "/page/2/" in next_link["href"]
