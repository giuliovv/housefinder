import datetime as dt

from scraper import history

D = [dt.date(2026, 10, 10) + dt.timedelta(days=i) for i in range(6)]


def row(sid, price=1000, status=None, agency="a", addr="1 High St, London, E1 6AB"):
    return {"summary": {"platform": "p", "source_id": sid, "agency": agency, "url": f"https://x/{sid}", "address": addr,
                        "price_pcm": price, "status": status, "bedrooms": 2, "bathrooms": 1}}


def run(h, day, rows_by_agency, truncated=False):
    history.update(h, {a: (rs, truncated) for a, rs in rows_by_agency.items()}, day)


def test_first_run_dates_are_not_exact_but_later_new_listings_are():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1")]})
    run(h, D[1], {"a": [row("1"), row("2")]})
    assert h["listings"]["p:1"]["first_seen_exact"] is False   # may have been up for weeks
    assert h["listings"]["p:2"]["first_seen_exact"] is True
    assert h["listings"]["p:2"]["first_seen"] == D[1].isoformat()


def test_new_agency_inventory_is_never_exact_even_on_later_runs():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1")]})
    run(h, D[1], {"a": [row("1")], "b": [row("9", agency="b")]})
    assert h["listings"]["p:9"]["first_seen_exact"] is False


def test_price_and_status_changes_are_recorded_once_each():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1", 1000)]})
    run(h, D[1], {"a": [row("1", 1000)]})
    run(h, D[2], {"a": [row("1", 950)]})
    run(h, D[3], {"a": [row("1", 950, status="Let Agreed")]})
    rec = h["listings"]["p:1"]
    assert rec["price_history"] == [[D[0].isoformat(), 1000], [D[2].isoformat(), 950]]
    assert [s for _, s in rec["status_history"]] == ["available", "Let Agreed"]
    assert rec["unavailable_on"] == D[3].isoformat()


def test_disappearance_needs_two_misses_and_is_dated_to_the_first_miss():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1"), row("2")]})
    run(h, D[1], {"a": [row("2")]})
    assert "ended" not in h["listings"]["p:1"]
    run(h, D[2], {"a": [row("2")]})
    assert h["listings"]["p:1"]["ended"] == {"date": D[1].isoformat(), "reason": "disappeared"}
    assert h["listings"]["p:1"]["last_seen"] == D[0].isoformat()


def test_failed_or_truncated_agency_never_ends_listings():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1")], "b": [row("5", agency="b")]})
    for d in D[1:4]:
        run(h, d, {"a": []}, truncated=True)      # a hit the cap
        # b not scraped at all (search failed)
    assert not h["listings"]["p:1"].get("ended") and not h["listings"]["p:5"].get("ended")


def test_relisted_listing_is_revived_and_counted():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1")]})
    run(h, D[1], {"a": []})
    run(h, D[2], {"a": []})
    run(h, D[3], {"a": [row("1")]})
    rec = h["listings"]["p:1"]
    assert "ended" not in rec and rec["relisted"] == 1 and rec["misses"] == 0


def test_same_day_rerun_is_idempotent_and_runs_are_logged():
    h = history.empty_history(D[0])
    run(h, D[0], {"a": [row("1")]})
    snapshot = repr(h)
    run(h, D[0], {"a": [row("1")]})
    assert repr(h) == snapshot
    assert h["runs"][D[0].isoformat()] == {"a": 1}
    assert h["listings"]["p:1"]["area"] == "E1"
