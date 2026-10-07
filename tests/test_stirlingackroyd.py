"""Offline tests for the Stirling Ackroyd Property Hive theme and the London
address filter, against fixtures captured 2026-10-07."""
import pathlib

from bs4 import BeautifulSoup

from scraper.export import is_london
from scraper.propertyhive import STIRLINGACKROYD_THEME, PropertyHiveScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


def test_parses_search_cards() -> None:
    soup = BeautifulSoup((FIXTURES / "stirlingackroyd_search.html").read_text(), "html.parser")
    cards = soup.select(STIRLINGACKROYD_THEME.card_selector)
    assert len(cards) >= 12
    scraper = PropertyHiveScraper(theme=STIRLINGACKROYD_THEME)

    summary = scraper._parse_card("stirlingackroyd", cards[0])

    assert summary is not None
    assert summary.url.startswith("https://www.stirlingackroyd.com/property-to-rent/")
    assert summary.address and "London" in summary.address
    assert summary.price_pcm and summary.price_pcm > 0
    assert summary.bedrooms and summary.bathrooms is not None
    assert soup.select_one("a.next.page-numbers") is not None


def test_parses_detail_page_with_reapit_cdn_photos(monkeypatch) -> None:
    html = (FIXTURES / "stirlingackroyd_detail.html").read_text()
    monkeypatch.setattr("scraper.propertyhive.http.get", lambda url, **kw: html)
    scraper = PropertyHiveScraper(theme=STIRLINGACKROYD_THEME)
    soup = BeautifulSoup((FIXTURES / "stirlingackroyd_search.html").read_text(), "html.parser")
    summary = scraper._parse_card("stirlingackroyd", soup.select_one(STIRLINGACKROYD_THEME.card_selector))

    detail = scraper.detail("stirlingackroyd", summary)

    assert len(detail.photo_urls) >= 10
    assert all(u.startswith("https://assets.reapit.net/") for u in detail.photo_urls)
    assert len(set(detail.photo_urls)) == len(detail.photo_urls)
    assert "penthouse" in detail.description.lower()


def test_is_london() -> None:
    assert is_london("Hamilton Gardens, London, NW8 9PU")
    assert is_london("Rochester Row, SW1P 1JU")
    assert not is_london("Frimley Road, Ash Vale, Surrey, GU12 5PP")
    assert not is_london("The Crescent, Egham, Surrey, TW20 9PN")
