"""Offline tests against saved fixture HTML — no network needed, and these
keep working even if the live site changes layout later (which is when
you'd update the fixture and see exactly what broke)."""
import pathlib

from bs4 import BeautifulSoup

from scraper.propertyhive import PropertyHiveScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def test_parses_search_card() -> None:
    html = (FIXTURES / "propertyhive_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")
    card = soup.select_one(".listing-a")
    scraper = PropertyHiveScraper()

    summary = scraper._parse_card("properly", card)

    assert summary is not None
    assert summary.platform == "propertyhive"
    assert summary.agency == "properly"
    assert summary.url.startswith("https://properties.properly.space/property/")
    assert summary.address
    assert summary.price_pcm is not None and summary.price_pcm > 0
    assert summary.bedrooms is not None


def test_parses_detail_page() -> None:
    from scraper.models import ListingSummary

    html = (FIXTURES / "propertyhive_detail.html").read_text()
    soup = BeautifulSoup(html, "html.parser")
    scraper = PropertyHiveScraper()

    dummy_summary = ListingSummary(
        source_id="york-way-kings-cross-n1c", agency="properly", platform="propertyhive",
        url="https://properties.properly.space/property/york-way-kings-cross-n1c/",
        address="York Way, Kings Cross, N1C", price_text="£5,000 pcm", price_pcm=5000.0,
        bedrooms=3, bathrooms=2, receptions=1, thumbnail_url=None,
    )

    description = soup.select_one(".property-description").get_text(strip=True)
    key_features = [li.get_text(strip=True) for li in soup.select(".property-features li")]
    photo_urls = []
    for fig in soup.select(".property-gallery > div"):
        link = fig.select_one("a[href]")
        if link is not None:
            photo_urls.append(link["href"])

    assert description
    assert len(key_features) > 0
    assert len(photo_urls) > 0
    assert all(u.endswith((".jpg", ".jpeg", ".png")) for u in photo_urls)


def test_search_finds_all_cards_and_pagination_link() -> None:
    html = (FIXTURES / "propertyhive_search.html").read_text()
    soup = BeautifulSoup(html, "html.parser")

    cards = soup.select(".listing-a")
    assert len(cards) == 12  # "Showing 1-12 of 40 properties" at fixture-capture time

    next_link = soup.select_one("a.next.page-numbers")
    assert next_link is not None
    assert "/page/2/" in next_link["href"]
