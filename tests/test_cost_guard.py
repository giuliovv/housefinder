import datetime as dt

from ops import cost_guard as g


def test_normal_traffic_is_ok_and_big_traffic_escalates() -> None:
    assert g.decide(3.0, 3_000, 0.3) == "ok"
    assert g.decide(g.WARN_GB, 10, 1) == "warn"
    assert g.decide(1, g.WARN_REQUESTS, 1) == "warn"
    assert g.decide(g.HARD_GB, 10, 1) == "hard"
    assert g.decide(1, g.HARD_REQUESTS, 1) == "hard"
    assert g.decide(1, 10, g.DAY_HARD_GB) == "hard"  # one huge day is abuse whatever the month says


NOW = dt.datetime(2026, 10, 14, 12, tzinfo=dt.timezone.utc)
U = {"month_gb": 320.0, "month_requests": 4_000_000, "day_gb": 90.0}


def test_alerts_say_what_happened_and_how_to_undo_it() -> None:
    assert g.alert_for("ok", U, NOW) is None
    warn = g.alert_for("warn", U, NOW)
    assert warn["severity"] == "warning" and warn["key"] == "cf-warn:2026-10"
    done = g.alert_for("hard", U, NOW, (True, "done"))
    assert done["severity"] == "critical" and "DISABLED" in done["detail"] and "enable" in done["detail"]
    failed = g.alert_for("hard", U, NOW, (False, "AccessDenied"))
    assert "could NOT disable" in failed["detail"] and "AccessDenied" in failed["detail"]
