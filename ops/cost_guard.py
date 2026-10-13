"""CloudFront usage guard: a soft alarm and a hard stop for the site's CDN bill.

AWS has no built-in "stop at $X" for CloudFront, and the account's budget tools aren't available to this host, so the
hourly watcher (housefinder_watch.py) reads CloudFront's free CloudWatch metrics for the month so far and calls
`decide`:

  warn  - the month is on track to use a lot more than a hobby site should  -> an alert
  hard  - well past anything legitimate (still inside CloudFront's always-free 1 TB / 10 M requests, so it costs
          nothing yet)                                                       -> the distribution is DISABLED

Disabling makes the site unreachable on purpose; `python3 ops/cost_guard.py enable` turns it back on. A later CDK deploy
also re-enables it, so the guard re-checks every hour and would disable it again while usage stays over the limit.

    python3 ops/cost_guard.py status | disable | enable
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys

DISTRIBUTION = "E2G5ZZZON3XYHL"
AWS = "/usr/local/bin/aws"
GB = 1e9
# month-to-date limits. Today's real traffic is ~0.25 GB and ~100 requests a day.
WARN_GB, HARD_GB = 25.0, 300.0
WARN_REQUESTS, HARD_REQUESTS = 300_000, 3_000_000
# a single day this large is abuse whatever the month says
DAY_HARD_GB = 60.0


def decide(month_gb: float, month_requests: float, day_gb: float) -> str:
    """'ok' | 'warn' | 'hard'"""
    if month_gb >= HARD_GB or month_requests >= HARD_REQUESTS or day_gb >= DAY_HARD_GB:
        return "hard"
    if month_gb >= WARN_GB or month_requests >= WARN_REQUESTS:
        return "warn"
    return "ok"


def _aws(*args: str, timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run([AWS, *args], capture_output=True, text=True, timeout=timeout)


def usage(now: dt.datetime | None = None) -> dict:
    """{'month_gb', 'month_requests', 'day_gb'} from CloudWatch (metrics are daily sums in us-east-1)."""
    now = now or dt.datetime.now(dt.timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    out = {}
    for metric in ("BytesDownloaded", "Requests"):
        r = _aws("cloudwatch", "get-metric-statistics", "--region", "us-east-1", "--namespace", "AWS/CloudFront",
                 "--metric-name", metric, "--dimensions", f"Name=DistributionId,Value={DISTRIBUTION}", "Name=Region,Value=Global",
                 "--start-time", start.strftime("%Y-%m-%dT%H:%M:%SZ"), "--end-time", now.strftime("%Y-%m-%dT%H:%M:%SZ"),
                 "--period", "86400", "--statistics", "Sum", "--output", "json")
        if r.returncode:
            raise RuntimeError(f"cloudwatch {metric}: {r.stderr.strip()[:200]}")
        points = sorted(json.loads(r.stdout)["Datapoints"], key=lambda p: p["Timestamp"])
        out[metric] = (sum(p["Sum"] for p in points), points[-1]["Sum"] if points else 0.0)
    return {"month_gb": out["BytesDownloaded"][0] / GB, "month_requests": out["Requests"][0], "day_gb": out["BytesDownloaded"][1] / GB}


def set_enabled(enabled: bool) -> tuple[bool, str]:
    got = _aws("cloudfront", "get-distribution-config", "--id", DISTRIBUTION, "--output", "json")
    if got.returncode:
        return False, got.stderr.strip()[:300]
    doc = json.loads(got.stdout)
    config, etag = doc["DistributionConfig"], doc["ETag"]
    if config["Enabled"] == enabled:
        return True, "already " + ("enabled" if enabled else "disabled")
    config["Enabled"] = enabled
    upd = subprocess.run([AWS, "cloudfront", "update-distribution", "--id", DISTRIBUTION, "--if-match", etag,
                          "--distribution-config", json.dumps(config)], capture_output=True, text=True, timeout=120)
    return upd.returncode == 0, ("done" if upd.returncode == 0 else upd.stderr.strip()[:300])


def alert_for(level: str, u: dict, now: dt.datetime, disabled: tuple[bool, str] | None = None) -> dict | None:
    if level == "ok":
        return None
    figures = f"{u['month_gb']:.1f} GB and {u['month_requests']:,.0f} requests this month ({u['day_gb']:.1f} GB today)"
    if level == "warn":
        return {"key": f"cf-warn:{now.strftime('%Y-%m')}", "severity": "warning", "title": "CloudFront traffic is unusually high",
                "detail": f"{figures}. Normal is well under 1 GB. Possibly a scraper hitting the data files; a hard stop kicks in at "
                          f"{HARD_GB:.0f} GB or {HARD_REQUESTS:,} requests."}
    stop = "The distribution has been DISABLED, so the site is down on purpose; run `python3 ops/cost_guard.py enable` to restore it." \
        if disabled and disabled[0] else f"I could NOT disable it automatically ({disabled[1] if disabled else 'not attempted'}); do it in the CloudFront console."
    return {"key": f"cf-hard:{now.strftime('%Y-%m-%d')}", "severity": "critical", "title": "CloudFront hard limit reached",
            "detail": f"{figures}. {stop}"}


def main(argv: list[str]) -> int:
    cmd = argv[0] if argv else "status"
    if cmd == "status":
        u = usage()
        print(json.dumps(u, indent=1), "->", decide(u["month_gb"], u["month_requests"], u["day_gb"]))
    elif cmd in ("enable", "disable"):
        ok, msg = set_enabled(cmd == "enable")
        print(("OK " if ok else "FAILED ") + msg)
        return 0 if ok else 1
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
