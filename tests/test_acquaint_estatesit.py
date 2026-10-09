"""Offline tests: Acquaint (ashdownmarks.co.uk, homefullstop.com) and EstatesIT
(lyonslondon.co.uk, londonwideestates.com) pages captured 2026-10-08."""
import pathlib

from bs4 import BeautifulSoup

from scraper import http
from scraper.acquaint import AcquaintScraper
from scraper.estatesit import EstatesItScraper

F = pathlib.Path(__file__).parent / "fixtures"
read = lambda n: (F / n).read_text()  # noqa: E731


def _acq_rows(name, monkeypatch):
    monkeypatch.setattr(http, "get", lambda url, **kw: read(name))
    monkeypatch.setattr(http, "post", lambda url, data, **kw: "<html></html>")
    return list(AcquaintScraper().search("x", "https://www.example.com/properties.aspx?mode=1", max_pages=1))


def test_acquaint_card(monkeypatch):
    rows = _acq_rows("acquaint_search.html", monkeypatch)
    r = rows[0]
    assert len(rows) == 9
    assert r.source_id == "ashd728" and r.address == "Cadogan Street, Chelsea SW3"
    assert r.price_text == "£6,950 pw" and r.price_pcm == round(6950 * 52 / 12, 2)
    assert (r.bedrooms, r.bathrooms) == (5, 4)
    assert r.status == "New Instruction"
    assert r.url == "https://www.example.com/property-for-rent-cadogan-street-london-pi-ashd728.htm"


def test_acquaint_price_found_even_without_the_price_class(monkeypatch):
    rows = _acq_rows("acquaint_search_noprice_class.html", monkeypatch)
    assert len(rows) == 9 and all(r.price_pcm for r in rows)
    assert rows[0].price_text.startswith("£")


def test_acquaint_paging_posts_the_viewstate_and_stops_when_nothing_new(monkeypatch):
    page1, calls = read("acquaint_search.html"), []
    monkeypatch.setattr(http, "get", lambda url, **kw: page1)

    def fake_post(url, data, **kw):
        calls.append(data)
        return page1  # same cards again -> nothing new -> stop

    monkeypatch.setattr(http, "post", fake_post)
    rows = list(AcquaintScraper().search("x", "https://www.example.com/properties.aspx?mode=1", max_pages=5))
    assert len(rows) == 9 and len(calls) == 1
    assert calls[0]["__EVENTTARGET"].endswith("lnkPageNext") and calls[0]["__VIEWSTATE"]


def test_acquaint_detail(monkeypatch):
    rows = _acq_rows("acquaint_search.html", monkeypatch)
    monkeypatch.setattr(http, "get", lambda url, **kw: read("acquaint_detail.html"))
    d = AcquaintScraper().detail("x", rows[0])
    assert d.description.startswith("A spectacular five bedroom")
    assert "Lift to all floors" in d.key_features
    assert len(d.photo_urls) == len(set(d.photo_urls)) >= 20
    assert all("/728-" in u and "THUMB" not in u.upper() for u in d.photo_urls)
    assert d.attributes.get("floor_area_sqft") == 2958 and d.attributes.get("epc") == "B"


def test_estatesit_both_card_layouts(monkeypatch):
    for name, expect_first, expect_beds in (("estatesit_search.html", "PC_LYONS_000216", 4), ("estatesit_search_variant.html", "PC_LONWI_001669", 2)):
        monkeypatch.setattr(http, "get", lambda url, name=name, **kw: read(name))
        rows = list(EstatesItScraper().search("x", "https://example.com/results?q=1", max_pages=1))
        assert rows and rows[0].source_id == expect_first
        assert rows[0].bedrooms == expect_beds and rows[0].price_pcm and rows[0].url.startswith("https://example.com/property/")
    assert rows[0].price_text == "£4,000 pcm" and rows[0].status is None      # "To Rent" is availability, not a status


def test_estatesit_pages_by_offset(monkeypatch):
    requested = []

    def fake_get(url, **kw):
        requested.append(url)
        return read("estatesit_search.html") if "offset" not in url else "<html></html>"

    monkeypatch.setattr(http, "get", fake_get)
    rows = list(EstatesItScraper().search("x", "https://example.com/results?querytype=8", max_pages=5))
    assert len(rows) == 12 and requested[1].endswith("&offset=12")


def test_estatesit_detail_keeps_largest_unique_photos(monkeypatch):
    monkeypatch.setattr(http, "get", lambda url, **kw: read("estatesit_search.html"))
    summary = next(iter(EstatesItScraper().search("x", "https://example.com/results", max_pages=1)))
    monkeypatch.setattr(http, "get", lambda url, **kw: read("estatesit_detail.html"))
    d = EstatesItScraper().detail("x", summary)
    bases = [u.split("?")[0] for u in d.photo_urls]
    assert len(bases) == len(set(bases)) >= 10
    assert all(u.endswith("?size=1200%2C800&format=webp") for u in d.photo_urls)   # always a large variant, never a 100px strip thumbnail
    assert d.description


def test_acquaint_address_loses_a_price_the_theme_puts_in_the_title():
    from scraper.acquaint import _clean_address

    assert _clean_address("Sibley Grove, London Price £3,200 pcm") == "Sibley Grove, London"
    assert _clean_address("Brixton, Tulse Hill Price £2,300 pcm") == "Brixton, Tulse Hill"
    assert _clean_address("Addison Road, Holland Park") == "Addison Road, Holland Park"
    assert _clean_address("Some Road Price POA") == "Some Road"
