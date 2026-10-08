"""Permanent, append-only-ish history of every listing we've ever seen, kept
separately from the (pruned, display-oriented) listings.json so analytics
like "how long do 2-beds in SW1 stay on the market" survive the 90-day
retention that keeps the live dataset small.

What's recorded per listing (all dates are the scrape date, ISO strings):
  first_seen / first_seen_exact — exact only if the agency had already been
      scraped successfully on an earlier run, otherwise the listing may have
      been up for weeks before we noticed it (a new agency's whole inventory
      arrives on day one).
  last_seen, misses, first_missed, ended — "ended" is set after two
      consecutive runs where a successfully scraped agency no longer lists it;
      ended.date is the first run it was missing from. That means *gone*, not
      necessarily *let* — it could be withdrawn.
  unavailable_on — first date the agency itself showed it as let / let agreed /
      under offer / agreement signed: the best "it's gone" signal we have.
  price_history, status_history — one entry per change, so price cuts and
      status transitions are visible.
  relisted — times it vanished and came back.
  agency, platform, url, address, area (postcode district), bedrooms,
      bathrooms — latest values, for slicing.
Plus `runs`: for each date, how many listings each agency returned, so a gap
caused by an agency being down (no entry) is distinguishable from a quiet day.

Usage is via scraper/refresh.py (--history).
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import re

MISS_THRESHOLD = 2
_UNAVAILABLE = re.compile(r"^(let|let agreed|under offer|reserved|sstc|agreement signed)$", re.IGNORECASE)
_AREA = re.compile(r"\b((?:EC|WC|NW|SE|SW|E|N|W|BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB|WD)\d{1,2}[A-Z]?)\b")


def is_unavailable_status(status: str | None) -> bool:
    return bool(_UNAVAILABLE.match((status or "").strip()))


def listing_key(row: dict) -> str:
    s = row["summary"]
    return f"{s['platform']}:{s['source_id']}"


def empty_history(today: dt.date) -> dict:
    return {"version": 1, "started": today.isoformat(), "runs": {}, "listings": {}}


def load(path: pathlib.Path, today: dt.date) -> dict:
    return json.loads(path.read_text()) if path.exists() else empty_history(today)


def save(path: pathlib.Path, history: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(history, ensure_ascii=False, separators=(",", ":"), sort_keys=True))
    tmp.replace(path)


def _append_if_changed(series: list, date: str, value) -> None:
    if not series or series[-1][1] != value:
        series.append([date, value])


def update(history: dict, scraped: dict[str, tuple[list[dict], bool]], today: dt.date) -> None:
    """`scraped` is refresh.py's agency key -> (rows, truncated) for the
    agencies that were successfully scraped this run. Idempotent for a given
    date, so re-running the same day changes nothing."""
    day = today.isoformat()
    runs = history["runs"]
    listings = history["listings"]

    for agency, (rows, truncated) in scraped.items():
        known_before = any(agency in counts for d, counts in runs.items() if d != day)
        runs.setdefault(day, {})[agency] = len(rows)
        seen: set[str] = set()

        for row in rows:
            key = listing_key(row)
            seen.add(key)
            s = row["summary"]
            rec = listings.get(key)
            if rec is None:
                rec = listings[key] = {
                    "agency": agency,
                    "first_seen": day,
                    "first_seen_exact": known_before,
                    "price_history": [],
                    "status_history": [],
                    "relisted": 0,
                    "misses": 0,
                }
            rec["last_seen"] = day
            rec["misses"] = 0
            rec.pop("first_missed", None)
            if rec.pop("ended", None) is not None:
                rec["relisted"] += 1
            rec.update(
                platform=s["platform"],
                url=s["url"],
                address=s["address"],
                bedrooms=s.get("bedrooms"),
                bathrooms=s.get("bathrooms"),
            )
            m = _AREA.search(s["address"].upper())
            rec["area"] = m.group(1) if m else None
            if s.get("price_pcm") is not None:
                _append_if_changed(rec["price_history"], day, s["price_pcm"])
            status = (s.get("status") or "available").strip()
            _append_if_changed(rec["status_history"], day, status)
            if is_unavailable_status(s.get("status")):
                rec.setdefault("unavailable_on", day)
            else:
                rec.pop("unavailable_on", None)  # back on the market

        # An agency that returned more than our cap may simply not have shown
        # a listing on this run, so absence means nothing.
        if truncated:
            continue
        for key, rec in listings.items():
            if rec["agency"] != agency or key in seen or rec.get("ended") or rec["last_seen"] == day:
                continue
            rec["misses"] += 1
            rec.setdefault("first_missed", day)
            if rec["misses"] >= MISS_THRESHOLD:
                rec["ended"] = {"date": rec["first_missed"], "reason": "disappeared"}
