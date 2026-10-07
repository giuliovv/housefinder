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


def test_listing_already_let_when_first_seen_is_not_stored():
    out = by_id(merge([], {"a": ([row("1", status="Let"), row("2")], False)}, D1))
    assert set(out) == {"2"}


def test_old_off_market_listings_are_pruned_and_not_readded():
    state = merge([], {"a": ([row("1"), row("2")], False)}, D1)
    state = merge(state, {"a": ([row("1", status="Let"), row("2")], False)}, D2)
    later = D2 + dt.timedelta(days=15)
    out = by_id(merge(state, {"a": ([row("1", status="Let"), row("2")], False)}, later))
    assert set(out) == {"2"}
