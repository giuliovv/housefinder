"""Offline tests against pages captured 2026-10-08 from squiresestates.co.uk."""
import pathlib

from scraper import http
from scraper.estatetrack import EstateTrackScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"
SEARCH = (FIXTURES / "estatetrack_search.html").read_text()
DETAIL = (FIXTURES / "estatetrack_detail.html").read_text()


def test_search_parses_cards(monkeypatch) -> None:
    monkeypatch.setattr(http, "get", lambda url, **kw: SEARCH if url.endswith("/to-rent") else (_ for _ in ()).throw(RuntimeError("404")))
    rows = list(EstateTrackScraper().search("squires", "https://squiresestates.co.uk/properties/to-rent", max_pages=3))

    assert len(rows) == len({r.source_id for r in rows}) >= 8
    first = rows[0]
    assert first.source_id == "north-crescent-london-n3"
    assert first.url == "https://squiresestates.co.uk/property-to-rent/north-crescent-london-n3"
    assert first.address == "North Crescent, London, N3"
    assert first.price_pcm == 3875
    assert (first.bedrooms, first.bathrooms, first.receptions) == (3, 3, 2)
    assert first.status == "Let Agreed"
    assert any(r.status is None for r in rows)  # not every card has a badge


def test_search_pages_until_no_new_cards(monkeypatch) -> None:
    requested = []

    def fake_get(url, **kw):
        requested.append(url)
        return SEARCH  # every page identical -> page 2 adds nothing new -> stop

    monkeypatch.setattr(http, "get", fake_get)
    list(EstateTrackScraper().search("squires", "https://x.example/properties/to-rent", max_pages=10))

    assert requested == ["https://x.example/properties/to-rent", "https://x.example/properties/to-rent/page/2"]


def test_detail_reads_json_ld(monkeypatch) -> None:
    monkeypatch.setattr(http, "get", lambda url, **kw: DETAIL)
    scraper = EstateTrackScraper()
    monkeypatch.setattr(http, "get", lambda url, **kw: SEARCH)
    summary = next(iter(scraper.search("squires", "https://squiresestates.co.uk/properties/to-rent", max_pages=1)))
    monkeypatch.setattr(http, "get", lambda url, **kw: DETAIL)

    detail = scraper.detail("squires", summary)

    assert len(detail.photo_urls) == len(set(detail.photo_urls)) >= 8
    assert all(u.startswith("https://") and "epc" not in u.lower() for u in detail.photo_urls)
    assert detail.description.startswith("Stunning and ultra modern 3 bedroom")
    assert "Off street parking" in detail.key_features
