"""Offline tests against pages captured 2026-10-08 from circaproperty.co.uk."""
import pathlib

from bs4 import BeautifulSoup

from scraper import http
from scraper.expertagent import ExpertAgentScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
SEARCH = (FIXTURES / "expertagent_search.html").read_text()
DETAIL = (FIXTURES / "expertagent_detail.html").read_text()


def test_parses_search_cards() -> None:
    soup = BeautifulSoup(SEARCH, "html.parser")
    scraper = ExpertAgentScraper()
    cards = soup.select('[id^="eapow-listing-"]')
    assert len(cards) == 4
    first = scraper._parse_card("circa", cards[0], "https://www.circaproperty.co.uk/properties-to-let")
    assert first is not None
    assert first.source_id == "34873435"
    assert first.url == "https://www.circaproperty.co.uk/properties-to-let/property/34873435-portway-london"
    assert first.address == "Portway, London"
    assert first.price_pcm == 2600
    assert (first.bedrooms, first.bathrooms, first.receptions) == (3, 1, 1)
    assert first.status == "Agreement Signed"
    assert first.thumbnail_url and first.thumbnail_url.startswith("https://")


def test_detail_has_unique_photos_description_and_features(monkeypatch) -> None:
    monkeypatch.setattr(http, "get", lambda url, **kw: DETAIL)
    scraper = ExpertAgentScraper()
    card = BeautifulSoup(SEARCH, "html.parser").select_one('[id^="eapow-listing-"]')
    summary = scraper._parse_card("circa", card, "https://www.circaproperty.co.uk/properties-to-let")

    detail = scraper.detail("circa", summary)

    assert len(detail.photo_urls) == len(set(detail.photo_urls)) >= 8
    assert all(u.startswith("https://") for u in detail.photo_urls)
    assert "Portway" in detail.description
    assert "Newly refurbished throughout" in detail.key_features


def test_search_pages_by_offset_until_nothing_new(monkeypatch) -> None:
    requested = []

    def fake_get(url, **kw):
        requested.append(url)
        return SEARCH if "limitstart" not in url else "<html></html>"

    monkeypatch.setattr(http, "get", fake_get)
    got = list(ExpertAgentScraper().search("circa", "https://x.example/properties-to-let", max_pages=10))

    assert len({s.source_id for s in got}) == 4
    assert requested == ["https://x.example/properties-to-let", "https://x.example/properties-to-let?limitstart=4"]
