import datetime as dt

from scraper import health

TODAY = dt.date(2026, 10, 12)
D = lambda n: (TODAY - dt.timedelta(days=n)).isoformat()  # noqa: E731


def hist(**per_agency):
    runs = {}
    for agency, counts in per_agency.items():
        for i, c in enumerate(reversed(counts)):
            runs.setdefault(D(i), {})[agency] = c
    return {"runs": runs, "blocked": {}, "failed": {}}


def keys(alerts):
    return [a.key for a in alerts]


def test_healthy_agencies_raise_nothing():
    assert health.agency_alerts(hist(a=[40, 41, 40, 42, 40, 41]), ["a"], TODAY) == []


def test_a_collapsing_agency_is_flagged_but_normal_wobble_is_not():
    assert keys(health.agency_alerts(hist(a=[40, 41, 40, 42, 40, 3]), ["a"], TODAY)) == [f"agency-dropped:a:{TODAY.isoformat()}"]
    assert health.agency_alerts(hist(a=[40, 41, 40, 42, 40, 30]), ["a"], TODAY) == []
    assert health.agency_alerts(hist(tiny=[5, 5, 5, 5, 0]), ["tiny"], TODAY) == []     # too small a baseline to judge


def test_a_new_block_alerts_once_for_that_day_and_known_blocked_agencies_stay_quiet():
    h = hist(a=[40, 40, 40])
    h["blocked"] = {"a": TODAY.isoformat(), "aspire": TODAY.isoformat()}
    assert keys(health.agency_alerts(h, ["a", "aspire"], TODAY)) == [f"agency-blocked:a:{TODAY.isoformat()}"]


def test_an_agency_silently_missing_for_days_is_stale_unless_a_block_explains_it():
    h = {"runs": {D(6): {"a": 41}, D(5): {"a": 40, "b": 20}}, "blocked": {"b": D(4)}, "failed": {"a": D(1)}}
    out = health.agency_alerts(h, ["a", "b"], TODAY)
    assert [a.key for a in out] == [f"agency-stale:a:{D(5)}"] and "last failure" in out[0].detail


def test_data_shrinking_is_critical_and_state_is_recorded():
    st = {"daily": {D(1): {"total": 3000, "browseable": 2000}}}
    rows = [{"x": 1}] * 1200
    out = health.data_alerts(rows, st, TODAY)
    assert [a.key for a in out] == [f"data-shrank:{TODAY.isoformat()}"] and out[0].severity == "critical"
    assert st["daily"][TODAY.isoformat()]["browseable"] == 1200
    assert health.data_alerts([{"x": 1}] * 1900, {"daily": {D(1): {"total": 3000, "browseable": 2000}}}, TODAY) == []


def test_run_failure_always_alerts_and_agency_checks_only_run_after_a_good_scrape():
    kw = dict(history=hist(a=[40, 40, 40, 40, 40, 1]), listings=[], health={}, agency_keys=["a"], today=TODAY, run_id="9", run_url="u")
    assert keys(health.evaluate(job_status="failure", scraped=True, **kw)) == ["run-failed:9"]
    assert keys(health.evaluate(job_status="success", scraped=True, **kw)) == [f"agency-dropped:a:{TODAY.isoformat()}"]
    assert health.evaluate(job_status="success", scraped=False, **kw) == []      # a code-only push says nothing about the agencies
