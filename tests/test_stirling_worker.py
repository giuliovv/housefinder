import datetime as dt
from ops.stirling_worker import due_at


def test_shared_block_survives_new_worker():
    assert due_at({}, {'blocked': {'stirlingackroyd': '2026-10-16'}}) == dt.datetime(2026, 10, 19)


def test_reservation_survives_retry():
    assert due_at({'next_attempt_at': '2026-10-22T12:00:00'}, {}) == dt.datetime(2026, 10, 22, 12)


def test_recent_github_scrape_prevents_duplicate():
    assert due_at({}, {'runs': {'2026-10-18': {'stirlingackroyd': 397}}}) == dt.datetime(2026, 10, 20)
