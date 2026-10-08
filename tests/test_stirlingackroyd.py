"""Offline tests for the Stirling Ackroyd Property Hive theme and the London
address filter, against fixtures captured 2026-10-07."""
import pathlib

from bs4 import BeautifulSoup

from scraper.london import is_london
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


# --- Property Hive "stock" theme (sturgeslondon.co.uk, thomasjamesestateagents.co.uk), captured 2026-10-07

def test_stock_theme_search_card() -> None:
    from scraper.propertyhive import STOCK_THEME

    soup = BeautifulSoup((FIXTURES / "stock_search_sturges.html").read_text(), "html.parser")
    cards = soup.select(STOCK_THEME.card_selector)
    assert len(cards) == 12
    summary = PropertyHiveScraper(theme=STOCK_THEME)._parse_card("sturges", cards[0])
    assert summary is not None
    assert summary.url.startswith("https://www.sturgeslondon.co.uk/property/")
    assert summary.price_pcm and summary.bedrooms and summary.bathrooms is not None
    assert soup.select_one("a.next.page-numbers") is not None


def test_stock_theme_detail_photos_and_description(monkeypatch) -> None:
    from scraper.propertyhive import STOCK_THEME

    html = (FIXTURES / "stock_detail_sturges.html").read_text()
    monkeypatch.setattr("scraper.propertyhive.http.get", lambda url, **kw: html)
    scraper = PropertyHiveScraper(theme=STOCK_THEME)
    soup = BeautifulSoup((FIXTURES / "stock_search_sturges.html").read_text(), "html.parser")
    summary = scraper._parse_card("sturges", soup.select_one(STOCK_THEME.card_selector))

    detail = scraper.detail("sturges", summary)

    assert len(detail.photo_urls) >= 6 and len(set(detail.photo_urls)) == len(detail.photo_urls)
    assert detail.description


def test_bedrooms_fall_back_to_description_when_card_has_none(monkeypatch) -> None:
    from dataclasses import replace

    from scraper.propertyhive import STOCK_THEME

    html = (FIXTURES / "stock_detail_thomasjames.html").read_text()
    monkeypatch.setattr("scraper.propertyhive.http.get", lambda url, **kw: html)
    scraper = PropertyHiveScraper(theme=STOCK_THEME)
    soup = BeautifulSoup((FIXTURES / "stock_search_sturges.html").read_text(), "html.parser")
    summary = replace(scraper._parse_card("x", soup.select_one(STOCK_THEME.card_selector)), bedrooms=None, bathrooms=None)

    detail = scraper.detail("x", summary)

    assert detail.summary.bedrooms == 4


def test_is_london_district_names_and_outer_postcodes() -> None:
    for yes in ["Coborn Road, Mile End", "Portnall Road, Maida Vale", "The Green, Chingford", "Romford Road, Stratford",
                "Stag Lane, Edgware", "Foxley Lane, Purley", "High St, Bromley, BR1 1AA", "Heath Road, Romford RM1 2AB"]:
        assert is_london(yes), yes
    for no in ["Churchfield Road, Walton-On-Thames", "Bonham Drive, Orsett, Grays", "Westville Road, Thames Ditton",
               "High Street, Richmond, North Yorkshire", "Kingston Road, Epsom, KT17 4AB", "Egham, Surrey, TW20 9PN"]:
        assert not is_london(no), no
