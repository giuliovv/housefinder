"""Offline tests for the selector-driven scraper (pages captured 2026-10-10)."""
import pathlib
import re

from bs4 import BeautifulSoup

from scraper import http
from scraper.themed import ThemedScraper, gather_photos, next_url
from scraper.themes import THEMES

F = pathlib.Path(__file__).parent / "fixtures"


def _rows(name: str, theme: str, monkeypatch, url: str):
    html = (F / f"themed_{name}.html").read_text()
    monkeypatch.setattr(http, "get", lambda u, **kw: html)
    return list(ThemedScraper(THEMES[theme]).search("x", url, max_pages=1))


def test_glp_cards(monkeypatch) -> None:
    rows = _rows("glp", "glp", monkeypatch, "https://www.greaterlondonproperties.co.uk/to-rent/")
    assert len(rows) >= 20
    r = rows[0]
    assert r.source_id.isdigit() and r.url.startswith("https://www.greaterlondonproperties.co.uk/property/to-let/")
    assert r.price_pcm and r.price_pcm > 300 and r.bedrooms is not None
    assert r.status in {"Available", "Let Agreed", "Under Offer", "Let"} or r.status


def test_plaza_card_is_wrapped_in_its_link(monkeypatch) -> None:
    rows = _rows("plaza", "plaza", monkeypatch, "https://plazaestates.co.uk/property-to-rent/")
    assert len(rows) >= 8
    r = rows[0]
    assert r.url.startswith("https://plazaestates.co.uk/") and r.address
    assert r.price_text.startswith("£") and r.price_pcm and r.price_pcm > 1000
    assert r.bedrooms is not None


def test_next_page_is_found_by_text_or_rel() -> None:
    soup = BeautifulSoup('<div><a href="/p/2/">2</a><a href="/p/2/">Next</a></div>', "html.parser")
    assert next_url(soup, "https://x.test/p/") == "https://x.test/p/2/"
    assert next_url(BeautifulSoup("<a href='#'>Next</a>", "html.parser"), "https://x.test/") is None
    assert next_url(BeautifulSoup('<link rel="next" href="/page/3/">', "html.parser"), "https://x.test/page/2/") == "https://x.test/page/3/"


def test_photo_gathering_keeps_the_gallery_and_drops_related_and_furniture() -> None:
    html = """<html><head><meta property="og:image" content="https://s.test/up/2026/1_555_IMG.jpg"></head><body>
    <header><img src="https://s.test/logo.png"></header>
    <div class="gallery"><img src="https://s.test/up/2026/1_555_IMG-768x429.jpg"><img data-src="https://s.test/up/2026/2_555_IMG.jpg">
      <a href="https://s.test/up/2026/3_555_IMG.jpg">x</a></div>
    <div class="similar-properties"><img src="https://s.test/up/2025/9_777_IMG.jpg"></div>
    <footer><img src="https://s.test/up/2024/team.jpg"></footer></body></html>"""
    photos = gather_photos(BeautifulSoup(html, "html.parser"), "https://s.test/p/555/")
    assert photos == ["https://s.test/up/2026/1_555_IMG.jpg", "https://s.test/up/2026/2_555_IMG.jpg", "https://s.test/up/2026/3_555_IMG.jpg"]
    assert not any("777" in p or "logo" in p or "team" in p for p in photos)


def test_photos_named_after_one_reference_are_collected_across_cdn_size_variants() -> None:
    html = """<html><head><meta property="og:image" content="https://cdn.test/o/up/2026/09/NHG260579_08.jpg"></head><body>
    <img src="https://cdn.test/o/tr:w-1600/up/2026/09/NHG260579_01.jpg"><img data-src="https://cdn.test/o/tr:w-800/up/2026/09/NHG260579_01.jpg">
    <img data-src="https://cdn.test/o/tr:w-1600/up/2026/09/NHG260579_02.jpg"><img src="https://cdn.test/o/tr:w-1600/up/2026/09/NHG260579_08.jpg">
    <img src="https://cdn.test/o/tr:w-400/up/2024/10/shutterstock_209.jpg"></body></html>"""
    photos = gather_photos(BeautifulSoup(html, "html.parser"), "https://x.test/p/")
    assert photos == [f"https://cdn.test/o/up/2026/09/NHG260579_{n}.jpg" for n in ("01", "02", "08")]
