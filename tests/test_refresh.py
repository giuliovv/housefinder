import datetime as dt

from scraper.refresh import merge

D1 = dt.date(2026, 10, 10)
D2 = dt.date(2026, 10, 11)
D3 = dt.date(2026, 10, 12)


def row(sid, agency="a", status=None):
    return {"summary": {"platform": "p", "source_id": sid, "agency": agency, "status": status}, "description": "", "key_features": [], "photo_urls": []}


def by_id(rows):
    return {r["summary"]["source_id"]: r for r in rows}


def test_new_listing_gets_first_and_last_seen():
    out = by_id(merge([], {"a": ([row("1")], False)}, D1))
    assert out["1"]["first_seen"] == "2026-10-10" and out["1"]["last_seen"] == "2026-10-10"
    assert out["1"]["off_market"] is False


def test_first_seen_is_preserved_and_last_seen_advances():
    first = merge([], {"a": ([row("1")], False)}, D1)
    out = by_id(merge(first, {"a": ([row("1")], False)}, D2))
    assert out["1"]["first_seen"] == "2026-10-10" and out["1"]["last_seen"] == "2026-10-11"


def test_listing_goes_off_market_only_after_two_misses():
    state = merge([], {"a": ([row("1"), row("2")], False)}, D1)
    state = merge(state, {"a": ([row("2")], False)}, D2)
    assert by_id(state)["1"]["off_market"] is False
    state = merge(state, {"a": ([row("2")], False)}, D3)
    assert by_id(state)["1"]["off_market"] is True
    assert by_id(state)["2"]["off_market"] is False


def test_reappearing_listing_comes_back_on_market():
    state = merge([], {"a": ([row("1")], False)}, D1)
    state = merge(state, {"a": ([], False)}, D2)
    state = merge(state, {"a": ([], False)}, D3)
    assert by_id(state)["1"]["off_market"] is True
    state = by_id(merge(state, {"a": ([row("1")], False)}, D3))
    assert state["1"]["off_market"] is False and state["1"]["missed_runs"] == 0


def test_failed_agency_is_untouched():
    state = merge([], {"a": ([row("1", "a")], False), "b": ([row("2", "b")], False)}, D1)
    for d in (D2, D3):
        state = merge(state, {"a": ([row("1", "a")], False)}, d)  # b's search failed both days
    assert by_id(state)["2"]["off_market"] is False and by_id(state)["2"]["missed_runs"] == 0


def test_truncated_agency_does_not_count_misses():
    state = merge([], {"a": ([row("1"), row("2")], False)}, D1)
    for d in (D2, D3):
        state = merge(state, {"a": ([row("2")], True)}, d)
    assert by_id(state)["1"]["off_market"] is False


def test_listing_that_becomes_let_agreed_goes_off_market_but_to_let_does_not():
    state = merge([], {"a": ([row("1"), row("2", status="To Let")], False)}, D1)
    out = by_id(merge(state, {"a": ([row("1", status="Let Agreed"), row("2", status="To Let")], False)}, D2))
    assert out["1"]["off_market"] is True and out["1"]["off_market_since"] == "2026-10-11"
    assert out["2"]["off_market"] is False


def test_listing_already_let_when_first_seen_is_kept_as_off_market():
    out = by_id(merge([], {"a": ([row("1", status="Let"), row("2")], False)}, D1))
    assert out["1"]["off_market"] is True and out["2"]["off_market"] is False


def test_unverified_when_agency_stops_being_scraped_but_listing_is_kept():
    state = merge([], {"a": ([row("1", "a")], False), "b": ([row("2", "b")], False)}, D1)
    day = D1
    for _ in range(4):
        day += dt.timedelta(days=1)
        state = merge(state, {"a": ([row("1", "a")], False)}, day)  # b keeps failing
    out = by_id(state)
    assert out["1"]["unverified"] is False
    assert out["2"]["unverified"] is True and out["2"]["off_market"] is False


def test_legacy_listings_without_dates_are_unverified_and_baselined():
    out = by_id(merge([row("1")], {"a": ([], False)}, D1))
    assert out["1"]["unverified"] is True and out["1"]["first_seen"] == "2026-10-10"


def test_listings_unseen_for_retention_period_are_dropped():
    state = merge([], {"a": ([row("1"), row("2")], False)}, D1)
    later = D1 + dt.timedelta(days=91)
    out = by_id(merge(state, {"a": ([row("2")], False)}, later))
    assert set(out) == {"2"}


def test_stale_injected_results_are_ignored(tmp_path):
    import json
    from scraper.refresh import _load_injected

    now = dt.datetime(2026, 10, 12, 12, 0)
    path = tmp_path / "x.json"
    def write(scraped_at):
        path.write_text(json.dumps({"scraped_at": scraped_at.isoformat(), "agencies": {"a": {"rows": [row("1")], "truncated": False}}}))
    write(now - dt.timedelta(hours=5))
    assert set(_load_injected(path, now)) == {"a"}
    write(now - dt.timedelta(hours=40))
    assert _load_injected(path, now) == {}
    assert _load_injected(tmp_path / "missing.json", now) == {}


def test_agreement_signed_counts_as_unavailable():
    out = by_id(merge([], {"a": ([row("1", status="Agreement Signed")], False)}, D1))
    assert out["1"]["off_market"] is True


def test_blocked_response_is_detected_not_parsed_as_empty(monkeypatch):
    import pytest
    import requests

    from scraper import http

    class Resp:
        status_code = 202
        text = '<html><head><meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/?r=%2Fx"></head></html>'

        def raise_for_status(self):
            pass

    monkeypatch.setattr(requests, "get", lambda *a, **k: Resp())
    http._last_request_at.clear()
    with pytest.raises(http.Blocked):
        http.get("https://example.com/search")


def test_zero_results_from_an_agency_with_known_listings_counts_as_failed(monkeypatch):
    from scraper import export
    from scraper.agencies import AgencyConfig

    class Empty:
        def search(self, *a, **k):
            return iter(())

    monkeypatch.setattr(export, "build_scraper", lambda cfg: Empty())
    cfg = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="https://x")
    known = {"p:1": {"summary": {"agency": "a"}}}
    assert export.scrape_agency(cfg, 10, 2, known) is None           # looks blocked
    assert export.scrape_agency(cfg, 10, 2, {}) == ([], False)        # genuinely new/empty agency is fine
