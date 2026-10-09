"""Offline tests: Starberry CMS pages captured 2026-10-08 (Dexters, plus the
two other card layouts used by Jonathan Arron and Battersea & Nine Elms)."""
import pathlib

from bs4 import BeautifulSoup

from scraper import http
from scraper.starberry import StarberryScraper, _photos

F = pathlib.Path(__file__).parent / "fixtures"


def _first(name: str, monkeypatch):
    html = (F / name).read_text()
    monkeypatch.setattr(http, "get", lambda url, **kw: html)
    return list(StarberryScraper().search("x", "https://example.com/property-lettings/properties-to-rent-in-london", max_pages=1))


def test_dexters_card(monkeypatch) -> None:
    rows = _first("starberry_search.html", monkeypatch)
    assert len(rows) == 18
    r = rows[0]
    assert r.source_id == "272924"
    assert r.address == "Addison Road, West Kensington, W14"  # area span not duplicated
    assert r.price_pcm == 91000  # monthly figure from "£21,000 Pw / £91,000 Pcm"
    assert (r.bedrooms, r.bathrooms, r.receptions) == (7, 7, 3)
    assert r.url.endswith("/property-for-rent/property-to-rent-in-addison-road-london-w14/272924")


def test_figure_card_weekly_price_and_bedrooms_from_alt(monkeypatch) -> None:
    rows = _first("starberry_search_figure.html", monkeypatch)
    r = rows[1]
    assert r.address == "Duke Street, Mayfair, London, W1K"
    assert r.price_pcm == round(4900 * 52 / 12, 2)
    assert r.bedrooms == 3


def test_li_property_card(monkeypatch) -> None:
    rows = _first("starberry_search_li.html", monkeypatch)
    r = rows[0]
    assert r.address == "Holmby House, Battersea Power Staion, SW11"
    assert r.price_pcm == round(4616 * 52 / 12, 2)
    assert (r.bedrooms, r.bathrooms) == (5, 5)


def test_detail_keeps_largest_unique_photos_of_this_property(monkeypatch) -> None:
    html = (F / "starberry_detail.html").read_text()
    assert len(_photos(BeautifulSoup(html, "html.parser"), "272924")) == 18  # the 3 extra images (floorplan/EPC-style variants) are dropped
    assert all("858cm626" in u for u in _photos(BeautifulSoup(html, "html.parser"), "272924"))
    monkeypatch.setattr(http, "get", lambda url, **kw: html)
    summary = _first("starberry_search.html", monkeypatch)[0]
    monkeypatch.setattr(http, "get", lambda url, **kw: html)
    detail = StarberryScraper().detail("x", summary)
    assert detail.description.startswith("This exceptional seven bedroom")


def test_nurtur_layout_price_and_address_in_the_heading(monkeypatch) -> None:
    """Robinson Jackson: price is the h4's own text, address a trailing span, beds/baths in the overlay."""
    rows = _first("starberry_search_nurtur.html", monkeypatch)
    assert len(rows) >= 10
    r = rows[0]
    assert r.address and "," in r.address
    assert r.price_pcm and r.price_pcm > 300
    assert r.price_text.startswith("£")
    assert r.bedrooms is not None
