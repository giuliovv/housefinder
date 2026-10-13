from scraper.price_changes import build, series


def test_tiny_moves_are_not_changes() -> None:
    assert series([["2026-10-09", 4506.67], ["2026-10-10", 4502.33]]) == [["2026-10-09", 4506.67]]


def test_real_moves_are_kept_in_order_and_compared_with_the_last_kept_price() -> None:
    pts = [["2026-10-13", 2850], ["2026-10-09", 2950], ["2026-10-11", 2940]]
    assert series(pts) == [["2026-10-09", 2950.0], ["2026-10-13", 2850.0]]
    # 2940 is within 2% of 2950, and 2850 is measured against 2950 (the last kept price), not against 2940


def test_build_keeps_only_homes_with_two_or_more_distinct_prices() -> None:
    history = {"listings": {
        "a:1": {"price_history": [["2026-10-09", 1150], ["2026-10-13", 1400]]},
        "a:2": {"price_history": [["2026-10-09", 2000]]},
        "a:3": {"price_history": []},
        "a:4": {"price_history": [["2026-10-09", None], ["2026-10-10", 2000], ["2026-10-12", 1900]]},
    }}
    assert set(build(history)) == {"a:1", "a:4"}
    assert build(history)["a:4"] == [["2026-10-10", 2000.0], ["2026-10-12", 1900.0]]
