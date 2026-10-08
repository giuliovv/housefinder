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

    monkeypatch.setattr(requests, "request", lambda *a, **k: Resp())
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


def test_blocked_agency_stops_immediately_and_is_recorded(monkeypatch):
    from scraper import export, http
    from scraper.agencies import AgencyConfig

    class Blocking:
        def search(self, *a, **k):
            raise http.Blocked("challenge")

    monkeypatch.setattr(export, "build_scraper", lambda cfg: Blocking())
    export.BLOCKED.clear()
    cfg = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="https://x")
    assert export.scrape_agency(cfg, 10, 2, {}) is None
    assert export.BLOCKED == {"a"}


def test_backoff_skips_recently_blocked_agencies_then_retries_after_three_days():
    from scraper.agencies import AgencyConfig
    from scraper.refresh import not_backing_off

    a = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="x")
    b = AgencyConfig(key="b", name="B", platform="propertyhive", search_url="x")
    blocked = {"a": "2026-10-08"}
    assert [c.key for c in not_backing_off([a, b], blocked, dt.date(2026, 10, 10))] == ["b"]
    assert [c.key for c in not_backing_off([a, b], blocked, dt.date(2026, 10, 11))] == ["a", "b"]


def test_restore_attributes_from_history_without_requests():
    from scraper.refresh import restore_attributes

    rows = [row("1"), row("2"), {**row("3"), "attributes": {}}]
    hist = {"listings": {"p:1": {"attrs": {"furnished": "unfurnished"}}, "p:3": {"attrs": {"epc": "C"}}}}
    assert restore_attributes(rows, hist) == 1
    assert rows[0]["attributes"] == {"furnished": "unfurnished"}
    assert "attributes" not in rows[1]                 # unknown to history: left for a normal fetch
    assert rows[2]["attributes"] == {}                 # already has the key (even if empty): untouched


def test_agency_scraped_today_is_skipped_unless_forced(capsys):
    from scraper.agencies import AgencyConfig
    from scraper.refresh import not_done_today

    a = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="x")
    b = AgencyConfig(key="b", name="B", platform="propertyhive", search_url="x")
    hist = {"runs": {"2026-10-08": {"a": 12}, "2026-10-07": {"b": 5}}}
    today = dt.date(2026, 10, 8)
    assert [c.key for c in not_done_today([a, b], hist, today, force=False)] == ["b"]
    assert [c.key for c in not_done_today([a, b], hist, today, force=True)] == ["a", "b"]
    assert [c.key for c in not_done_today([a, b], None, today, force=False)] == ["a", "b"]


def test_failed_agency_counts_as_attempted_today():
    from scraper.agencies import AgencyConfig
    from scraper.refresh import not_done_today

    a = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="x")
    b = AgencyConfig(key="b", name="B", platform="propertyhive", search_url="x")
    hist = {"runs": {}, "failed": {"a": "2026-10-08", "b": "2026-10-07"}}
    assert [c.key for c in not_done_today([a, b], hist, dt.date(2026, 10, 8), force=False)] == ["b"]


def _run_main(monkeypatch, tmp_path, hist, agencies, scrape_result):
    """Drive refresh.main() with a fake scraper; returns (exit, listings text, history)."""
    import json
    import sys

    from scraper import export, refresh

    listings = tmp_path / "listings.json"
    listings.write_text(json.dumps([row("1", agency="a")]))
    hp = tmp_path / "history.json"
    hp.write_text(json.dumps(hist))
    monkeypatch.setattr(refresh, "AGENCIES", {c.key: c for c in agencies})
    monkeypatch.setattr(refresh, "scrape_agency", lambda cfg, *a, **k: scrape_result(cfg))
    monkeypatch.setattr(sys, "argv", ["refresh", "--listings", str(listings), "--history", str(hp)])
    export.BLOCKED.clear()
    try:
        refresh.main()
        code = 0
    except SystemExit as e:
        code = e.code
    return code, listings.read_text(), json.loads(hp.read_text())


def test_main_succeeds_quietly_when_only_failures_remain_after_skipping_done_agencies(monkeypatch, tmp_path):
    from scraper.agencies import AgencyConfig

    today = dt.datetime.now(dt.timezone.utc).date().isoformat()
    done = AgencyConfig(key="done", name="D", platform="propertyhive", search_url="x")
    flaky = AgencyConfig(key="flaky", name="F", platform="propertyhive", search_url="x")
    hist = {"version": 1, "started": today, "runs": {today: {"done": 5}}, "listings": {}}
    code, _, saved = _run_main(monkeypatch, tmp_path, hist, [done, flaky], lambda cfg: None)   # flaky fails
    assert code == 0                                  # not "every agency failed": `done` was merely skipped
    assert saved["failed"] == {"flaky": today}        # and the failure is remembered so it isn't retried today


def test_main_still_fails_when_every_agency_genuinely_fails(monkeypatch, tmp_path):
    from scraper.agencies import AgencyConfig

    a = AgencyConfig(key="a", name="A", platform="propertyhive", search_url="x")
    code, _, _ = _run_main(monkeypatch, tmp_path, {"version": 1, "started": "x", "runs": {}, "listings": {}}, [a], lambda cfg: None)
    assert code not in (0, None)


def test_implausible_prices_are_caught_but_real_prime_rents_are_not():
    from scraper.price import implausible_reason as bad

    assert bad(273832, 3)                      # the annual-rent-labelled-per-week case (~£21k per bedroom per week)
    assert bad(200_000, 8) and bad(100, 1)     # absolute limits
    assert bad(91000, 7) is None               # Dexters, Addison Road: £21,000 pw for 7 beds
    assert bad(65000, 4) is None               # Mayfair: £15,000 pw for 4 beds
    assert bad(34996, 11) is None
    assert bad(1600, 1) is None and bad(None, 2) is None
    assert bad(60000, None) is None            # unknown bedrooms: only the absolute caps apply


def test_scrape_agency_clears_and_flags_an_implausible_price(monkeypatch):
    from scraper import export
    from scraper.agencies import AgencyConfig
    from scraper.models import ListingDetail, ListingSummary

    def summ(sid, pcm):
        return ListingSummary(source_id=sid, agency="a", platform="p", url=f"https://x/{sid}", address="Young Street, London, W8",
                              price_text="£63,192 per week", price_pcm=pcm, bedrooms=3, bathrooms=2, receptions=None, thumbnail_url=None)

    class Fake:
        def search(self, *a, **k):
            return iter([summ("1", 273832.0), summ("2", 3000.0)])

        def detail(self, agency, summary):
            return ListingDetail(summary=summary, description="")

    monkeypatch.setattr(export, "build_scraper", lambda cfg: Fake())
    rows, _ = export.scrape_agency(AgencyConfig(key="a", name="A", platform="propertyhive", search_url="x"), 10, 1, {})
    by_id = {r["summary"]["source_id"]: r["summary"] for r in rows}
    assert by_id["1"]["price_pcm"] is None and by_id["1"]["price_flag"]
    assert by_id["1"]["price_text"] == "£63,192 per week"      # the advertised text is kept for display
    assert by_id["2"]["price_pcm"] == 3000.0 and by_id["2"]["price_flag"] is None


def test_stored_rows_get_the_price_check_without_any_scrape():
    from scraper.refresh import apply_price_checks

    def priced(sid, pcm, beds):
        r = row(sid)
        r["summary"].update(price_pcm=pcm, bedrooms=beds)
        return r

    bad, fine = priced("1", 273832, 3), priced("2", 3000, 3)
    assert apply_price_checks([bad, fine]) == 1
    assert bad["summary"]["price_pcm"] is None and bad["summary"]["price_flag"]
    assert fine["summary"]["price_pcm"] == 3000
    assert apply_price_checks([bad, fine]) == 0          # idempotent
