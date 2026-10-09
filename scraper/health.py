"""Health report for a refresh run: turn "something is off" into alerts.

The guards in refresh.py stop bad data from being *written*; they don't tell anyone
a scrape broke. This runs at the end of every workflow run (even a failed one) and
writes alert files to S3 (`alerts/pending/`) for the host-side watcher to deliver
(see ops/housefinder_watch.py), plus a heartbeat so a run that never happens is
noticed too. Standard library only — it must work when the rest of the job didn't.

What counts as an alert (kept few and specific, because every alert wakes a human):
  run-failed      the workflow job itself failed.
  agency-dropped  an agency returned < 50% of its recent typical count (or none) —
                  usually a changed layout or a block, which the zero-result guard
                  keeps from corrupting data but not from silently going stale.
  agency-blocked  an agency started answering with a bot challenge today.
  agency-stale    an agency has had no successful scrape for 3+ days without a
                  recorded reason.
  data-shrank     the browseable listing count fell > 25% day on day.
Four Homeflow agencies are blocked by Cloudflare and known to be: they're skipped
rather than alerting forever, and recovering is not an alert.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import statistics
from dataclasses import asdict, dataclass

EXPECTED_BLOCKED = frozenset({"innercityestates", "johndwood", "tatesestates", "aspire"})
DROP_RATIO = 0.5
MIN_BASELINE = 10
BASELINE_RUNS = 5
STALE_DAYS = 3
SHRINK_RATIO = 0.75
MIN_LISTINGS_FOR_SHRINK = 500


@dataclass
class Alert:
    key: str          # stable id, used by the watcher to avoid re-alerting
    severity: str     # "critical" | "warning"
    title: str
    detail: str


def agency_alerts(history: dict, agency_keys: list[str], today: dt.date) -> list[Alert]:
    runs: dict[str, dict[str, int]] = history.get("runs", {})
    blocked = history.get("blocked", {})
    failed = history.get("failed", {})
    today_s = today.isoformat()
    alerts: list[Alert] = []
    for agency in agency_keys:
        if agency in EXPECTED_BLOCKED:
            continue
        series = sorted((d, c[agency]) for d, c in runs.items() if agency in c)
        if blocked.get(agency) == today_s:
            alerts.append(Alert(f"agency-blocked:{agency}:{today_s}", "warning", f"{agency} started blocking us",
                                "It answered with a bot challenge today; the scraper backs off for 3 days and never tries to get past it."))
            continue
        if not series:
            continue  # never scraped successfully: nothing to compare against
        last_date, last_count = series[-1]
        previous = [c for _, c in series[:-1]][-BASELINE_RUNS:]
        if previous and last_date == today_s:
            baseline = statistics.median(previous)
            if baseline >= MIN_BASELINE and last_count < baseline * DROP_RATIO:
                alerts.append(Alert(f"agency-dropped:{agency}:{today_s}", "warning", f"{agency} returned far fewer listings",
                                    f"{last_count} today vs a typical {baseline:.0f} (last {len(previous)} runs: {previous}). Likely a layout change or partial block."))
        age = (today - dt.date.fromisoformat(last_date)).days
        if age >= STALE_DAYS and agency not in blocked:
            why = f" (last failure: {failed[agency]})" if agency in failed else ""
            alerts.append(Alert(f"agency-stale:{agency}:{last_date}", "warning", f"{agency} hasn't scraped for {age} days",
                                f"Last good scrape {last_date}{why}; no block recorded."))
    return alerts


def data_alerts(listings: list[dict], health: dict, today: dt.date) -> list[Alert]:
    total = len(listings)
    browseable = sum(1 for l in listings if not l.get("off_market") and not l.get("unverified"))
    daily = health.setdefault("daily", {})
    earlier = [(d, v) for d, v in sorted(daily.items()) if d < today.isoformat()]
    alerts = []
    if earlier:
        prev_date, prev = earlier[-1]
        if prev["browseable"] >= MIN_LISTINGS_FOR_SHRINK and browseable < prev["browseable"] * SHRINK_RATIO:
            alerts.append(Alert(f"data-shrank:{today.isoformat()}", "critical", "Browseable listings dropped sharply",
                                f"{browseable} browseable now vs {prev['browseable']} on {prev_date} (total {total})."))
    daily[today.isoformat()] = {"total": total, "browseable": browseable}
    for d in sorted(daily)[:-60]:
        del daily[d]
    return alerts


def evaluate(*, history: dict, listings: list[dict], health: dict, agency_keys: list[str], today: dt.date,
             job_status: str, run_id: str, run_url: str, scraped: bool) -> list[Alert]:
    alerts: list[Alert] = []
    if job_status == "failure":
        alerts.append(Alert(f"run-failed:{run_id}", "critical", "House Finder refresh run failed", f"Workflow run {run_id}: {run_url}"))
    if scraped and job_status == "success":
        alerts += agency_alerts(history, agency_keys, today)
        if listings:
            alerts += data_alerts(listings, health, today)
    return alerts


def _load(path: pathlib.Path | None, default):
    if path is not None and path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            pass
    return default


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", type=pathlib.Path)
    parser.add_argument("--listings", type=pathlib.Path)
    parser.add_argument("--health", type=pathlib.Path, required=True, help="small state file of daily counts (read + written)")
    parser.add_argument("--job-status", default="success")
    parser.add_argument("--run-id", default="local")
    parser.add_argument("--run-url", default="")
    parser.add_argument("--event", default="")
    parser.add_argument("--scraped", default="false")
    parser.add_argument("--out-dir", type=pathlib.Path, required=True)
    parser.add_argument("--heartbeat", type=pathlib.Path, help="written only for a successful scraping run")
    args = parser.parse_args()

    from .agencies import AGENCIES

    now = dt.datetime.now(dt.timezone.utc)
    scraped = args.scraped.lower() == "true"
    health = _load(args.health, {})
    alerts = evaluate(
        history=_load(args.history, {"runs": {}}),
        listings=_load(args.listings, []),
        health=health,
        agency_keys=list(AGENCIES),
        today=now.date(),
        job_status=args.job_status,
        run_id=args.run_id,
        run_url=args.run_url,
        scraped=scraped,
    )
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for a in alerts:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", a.key)
        (args.out_dir / f"{safe}.json").write_text(json.dumps({**asdict(a), "created": now.isoformat(), "run_url": args.run_url}))
    args.health.parent.mkdir(parents=True, exist_ok=True)
    args.health.write_text(json.dumps(health, sort_keys=True))
    if args.heartbeat is not None and scraped and args.job_status == "success":
        args.heartbeat.write_text(json.dumps({"finished_at": now.isoformat(), "run_id": args.run_id, "event": args.event}))
    print(f"health: {len(alerts)} alert(s): {[a.key for a in alerts]}")


if __name__ == "__main__":
    main()
