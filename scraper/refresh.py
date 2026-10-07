"""Daily refresh: re-scrape every agency and merge the result into the
existing dataset, so listings that have come off the market stop being
shown instead of lingering forever.

Per listing this tracks `first_seen`/`last_seen` dates, a `missed_runs`
counter, and `off_market`. A listing is marked off-market when the agency
lists it as let/under offer, or when it has been absent from the agency's
search results for MISS_THRESHOLD consecutive successful runs (one miss
alone could be a flaky page). Two things deliberately do NOT count as a miss:
an agency whose search failed outright (rate-limited, down, blocked from
this IP), and an agency with more listings than --per-agency (the listing
may just be past the cap). Off-market listings are kept for
OFF_MARKET_RETENTION_DAYS, then dropped.

Usage:
    python -m scraper.refresh --listings frontend/public/data/listings.json \
        --per-agency 80 --max-pages 12
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re

from .agencies import AGENCIES
from .export import scrape_agency

MISS_THRESHOLD = 2
OFF_MARKET_RETENTION_DAYS = 14
_UNAVAILABLE_STATUS = re.compile(r"^(let|let agreed|under offer|reserved|sstc)$", re.IGNORECASE)


def listing_key(listing: dict) -> str:
    s = listing["summary"]
    return f"{s['platform']}:{s['source_id']}"


def _unavailable(listing: dict) -> bool:
    return bool(_UNAVAILABLE_STATUS.match((listing["summary"].get("status") or "").strip()))


def merge(
    existing: list[dict],
    scraped: dict[str, tuple[list[dict], bool]],
    today: dt.date,
) -> list[dict]:
    """`scraped` maps agency key -> (rows, truncated) for agencies whose
    search succeeded; agencies absent from it are left completely untouched."""
    by_key = {listing_key(l): l for l in existing}
    today_s = today.isoformat()
    seen_keys: set[str] = set()

    for agency, (rows, _) in scraped.items():
        for row in rows:
            key = listing_key(row)
            seen_keys.add(key)
            if _unavailable(row) and key not in by_key:
                # Already let when first seen — no point storing/embedding it, and
                # it would just be re-added after each retention-window prune.
                continue
            prev = by_key.get(key, {})
            row["first_seen"] = prev.get("first_seen", today_s)
            row["last_seen"] = today_s
            row["missed_runs"] = 0
            if _unavailable(row):
                row["off_market"] = True
                row["off_market_since"] = prev.get("off_market_since", today_s)
            else:
                row["off_market"] = False
                row.pop("off_market_since", None)
            by_key[key] = row

    for key, listing in by_key.items():
        agency = listing["summary"]["agency"]
        if key in seen_keys or agency not in scraped or scraped[agency][1]:
            continue
        listing["missed_runs"] = listing.get("missed_runs", 0) + 1
        if listing["missed_runs"] >= MISS_THRESHOLD and not listing.get("off_market"):
            listing["off_market"] = True
            listing["off_market_since"] = today_s

    cutoff = today - dt.timedelta(days=OFF_MARKET_RETENTION_DAYS)
    return [
        l for l in by_key.values()
        if not (l.get("off_market") and dt.date.fromisoformat(l.get("off_market_since", today_s)) < cutoff)
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listings", type=pathlib.Path, required=True, help="existing listings.json, updated in place (may not exist yet)")
    parser.add_argument("--per-agency", type=int, default=80)
    parser.add_argument("--max-pages", type=int, default=12)
    args = parser.parse_args()

    existing = json.loads(args.listings.read_text()) if args.listings.exists() else []

    scraped: dict[str, tuple[list[dict], bool]] = {}
    for cfg in AGENCIES.values():
        result = scrape_agency(cfg, args.per_agency, args.max_pages)
        if result is None:
            continue
        scraped[cfg.key] = result
        if result[1]:
            print(f"[{cfg.key}] hit the --per-agency cap; not treating unseen listings as gone")

    if not scraped:
        raise SystemExit("every agency failed — refusing to write an unchanged dataset as if it were refreshed")

    merged = merge(existing, scraped, dt.date.today())
    args.listings.write_text(json.dumps(merged, ensure_ascii=False, indent=2))
    live = sum(1 for l in merged if not l.get("off_market"))
    print(f"wrote {len(merged)} listings ({live} on market) to {args.listings}")
    print(f"agencies refreshed: {sorted(scraped)}; skipped: {sorted(set(AGENCIES) - set(scraped))}")


if __name__ == "__main__":
    main()
