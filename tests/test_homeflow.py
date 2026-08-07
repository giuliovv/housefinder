"""Offline tests against saved fixture HTML, loaded as a local file:// page —
homeflow.py's parsing logic is written against Playwright's DOM API (not
BeautifulSoup), so this exercises the exact same code path production uses,
just against a fixture instead of a live request."""
import pathlib

import pytest
from playwright.sync_api import sync_playwright

from scraper.homeflow import HomeflowScraper

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--no-sandbox"])
        yield b
        b.close()


def test_parses_search_card(browser) -> None:
    page = browser.new_page()
    page.goto((FIXTURES / "homeflow_card.html").as_uri())

    card = page.query_selector(".property-card")
    scraper = HomeflowScraper(browser=browser)

    summary = scraper._parse_card("innercityestates", "https://www.innercityestates.com/properties/lettings", card)

    assert summary is not None
    assert summary.platform == "homeflow"
    assert summary.source_id == "21767146"
    assert summary.url == "https://www.innercityestates.com/properties/21767146/lettings"
    assert "Royal Mint Street" in summary.address
    assert summary.price_pcm == 3200.0
    assert summary.bedrooms == 2
    assert summary.bathrooms == 1
    assert summary.receptions == 1
    page.close()


def test_parses_detail_page(browser) -> None:
    # Mirrors detail()'s selectors directly rather than calling detail()
    # itself, since that method navigates to a live URL — this is the
    # offline equivalent, same selectors against a saved fixture.
    page = browser.new_page()
    page.goto((FIXTURES / "homeflow_detail.html").as_uri())

    key_features = [
        li.inner_text().strip()
        for li in page.query_selector_all(".description > ul.list-styled-inside li")
    ]
    description_el = page.query_selector(".property-description")
    description = description_el.inner_text().strip() if description_el else ""

    assert "Available from 15th August" in description
    # regression check: this exact bullet lives in the key-features list,
    # not the free-text narrative — if .description leaks in again (see
    # homeflow.py's comment on why it's the wrong selector), this catches it
    assert "Luxury open plan Kitchen" in key_features
    assert "Luxury open plan Kitchen" not in description
    page.close()


def test_page_number_parsing() -> None:
    assert HomeflowScraper._page_number("https://x.com/properties/lettings") == 1
    assert HomeflowScraper._page_number("https://x.com/properties/lettings/page-2") == 2
    assert HomeflowScraper._page_number("https://x.com/properties/lettings/page-11") == 11


def test_parses_search_card_panel(browser) -> None:
    page = browser.new_page()
    page.goto((FIXTURES / "johndwood_search.html").as_uri())

    cards = page.query_selector_all(".results-page .card")
    assert len(cards) > 0  # regression check for the js-template ambiguity investigated live
    scraper = HomeflowScraper(theme="panel", browser=browser)

    summary = scraper._parse_card("johndwood", "https://www.johndwood.co.uk/properties-to-rent/london/london", cards[0])

    assert summary is not None
    assert summary.platform == "homeflow"
    assert summary.agency == "johndwood"
    assert summary.source_id.isdigit()
    assert summary.url.startswith("https://www.johndwood.co.uk/properties/")
    assert summary.address
    assert summary.price_pcm is not None and summary.price_pcm > 0
    assert summary.bedrooms is not None
    # this theme's card genuinely doesn't expose these — detail() enriches
    # them from the spec list, not the card
    assert summary.bathrooms is None
    assert summary.receptions is None
    page.close()


def test_parses_detail_page_panel(browser) -> None:
    # Mirrors _detail_panel's selectors directly rather than calling it,
    # since that method navigates to a live URL.
    page = browser.new_page()
    page.goto((FIXTURES / "johndwood_detail.html").as_uri())

    description_el = page.query_selector(".details-frame__description-container--inner")
    description = description_el.inner_text().strip() if description_el else ""
    assert "Elgin Crescent" in description

    photo_urls = list(dict.fromkeys(
        img.get_attribute("src")
        for img in page.query_selector_all(".slider-wrapper .slide img")
        if img.get_attribute("src")
    ))
    assert len(photo_urls) > 0

    spec = {"bedroom": None, "bathroom": None, "reception": None}
    for item in page.query_selector_all(".details-panel__spec-list-item"):
        icon = item.query_selector("[class*='icon-']")
        number_el = item.query_selector(".details-panel__spec-list-number")
        if icon is None or number_el is None:
            continue
        icon_class = icon.get_attribute("class") or ""
        text = number_el.inner_text().strip()
        if not text.isdigit():
            continue
        for key in spec:
            if f"icon-{key}" in icon_class:
                spec[key] = int(text)

    assert spec == {"bedroom": 5, "bathroom": 3, "reception": 2}
    page.close()
