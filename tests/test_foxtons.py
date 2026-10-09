"""Offline tests for the Foxtons parser (a real Pimlico search page captured 2026-10-09, trimmed) and its safeguards."""
import json
import pathlib

import pytest

from scraper import foxtons, http, killswitch
from scraper.foxtons import FoxtonsScraper, Disallowed, parse_robots, robots_allows, to_summary

F = pathlib.Path(__file__).parent / "fixtures"
ROBOTS = parse_robots((F / "foxtons_robots.txt").read_text())


def _items() -> list[dict]:
    html = (F / "foxtons_search.html").read_text()
    return foxtons.next_data(html)["data"]


def test_only_available_central_lettings_become_summaries() -> None:
    summaries = [to_summary("foxtons", i) for i in _items()]
    kept = [s for s in summaries if s]
    assert len(kept) == 3  # 3 available Pimlico homes; 2 recently-let skipped; the SW11 copy is not central
    s = kept[0]
    assert s.platform == "foxtons" and s.source_id.startswith(("chpk", "b2rc", "btrc", "myfr"))
    assert s.url == f"https://www.foxtons.co.uk/properties-to-rent/{s.address.split(', ')[-1].lower()}/{s.source_id}"
    assert s.price_text.startswith("£") and s.price_text.endswith("pcm") and s.price_pcm and s.price_pcm > 300
    assert s.thumbnail_url and s.thumbnail_url.startswith("https://web-prod-page-assets.foxtons.co.uk/")


def test_detail_needs_no_request_and_carries_photos_and_location(monkeypatch) -> None:
    monkeypatch.setattr(http, "get", lambda url, **kw: pytest.fail(f"unexpected request {url}"))
    scraper = FoxtonsScraper()
    item = next(i for i in _items() if not i["isRecentLet"] and i["postcodeShort"].startswith("SW1"))
    s = to_summary("foxtons", item)
    scraper._items[s.source_id] = item
    d = scraper.detail("foxtons", s)
    assert len(d.photo_urls) >= 3
    assert d.attributes.get("lat") and d.attributes.get("lon")


def test_robots_rules_match_what_foxtons_publishes() -> None:
    assert robots_allows(ROBOTS, "/properties-to-rent/pimlico")
    assert robots_allows(ROBOTS, "/properties-to-rent/pimlico?page=2")
    assert not robots_allows(ROBOTS, "/api/v2/property-search/pins?FreeText=london")
    assert not robots_allows(ROBOTS, "/properties-to-rent/pimlico?order_by=price")
    assert not robots_allows(ROBOTS, "/properties-to-rent/london/2/bedroom/x")


def test_search_pages_through_areas_stops_on_irrelevant_pages_and_dedupes(monkeypatch) -> None:
    page = (F / "foxtons_search.html").read_text()
    empty = page.replace('"data": [', '"data": [], "x": [', 1)  # a page with no results
    fetched: list[str] = []

    def fake_get(url, **kw):
        fetched.append(url)
        if url.endswith("/robots.txt"):
            return (F / "foxtons_robots.txt").read_text()
        return page if "pimlico" in url or "victoria" in url else empty

    monkeypatch.setattr(http, "get", fake_get)
    rows = list(FoxtonsScraper(areas=["pimlico", "victoria", "chelsea"]).search("foxtons", foxtons.BASE + "/properties-to-rent"))
    assert len({r.source_id for r in rows}) == len(rows) == 3  # victoria repeats pimlico's homes: deduped
    assert not any("/api/" in u for u in fetched)


def test_search_stops_cold_if_robots_ever_disallows_our_paths(monkeypatch) -> None:
    monkeypatch.setattr(http, "get", lambda url, **kw: "User-agent: *\nDisallow: /properties-to-rent\n" if url.endswith("robots.txt") else pytest.fail("fetched a page"))
    with pytest.raises(Disallowed):
        list(FoxtonsScraper(areas=["pimlico"]).search("foxtons", foxtons.BASE))


def test_kill_switch_purges_only_the_disabled_agency(tmp_path) -> None:
    f = tmp_path / "killswitch.json"
    f.write_text(json.dumps({"disabled": ["foxtons"]}))
    assert killswitch.load(f) == {"foxtons"}
    rows = [{"summary": {"agency": "foxtons"}}, {"summary": {"agency": "dexters"}}]
    assert killswitch.purge(rows, killswitch.load(f)) == [{"summary": {"agency": "dexters"}}]
    assert killswitch.load(tmp_path / "missing.json") == set()
    f.write_text("not json")
    assert killswitch.load(f) == set()
