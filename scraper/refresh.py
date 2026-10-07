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

Some agencies (the Homeflow ones, which need a real browser) time out when
scraped from GitHub Actions' IP ranges but work from the long-lived dev host.
So that host runs `--dump` for just those and uploads the raw result to an S3
inbox; the Actions run passes it back in with `--inject` and treats it as if
it had scraped those agencies itself (only if fresh — see MAX_INJECT_AGE_HOURS).

Usage:
    python -m scraper.refresh --listings frontend/public/data/listings.json \
        --per-agency 80 --max-pages 12
    python -m scraper.refresh --dump /tmp/homeflow.json --platform homeflow
    python -m scraper.refresh --listings ... --inject /tmp/homeflow.json
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
MAX_INJECT_AGE_HOURS = 36
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


def _scrape(agencies, per_agency: int, max_pages: int) -> dict[str, tuple[list[dict], bool]]:
    scraped: dict[str, tuple[list[dict], bool]] = {}
    for cfg in agencies:
        result = scrape_agency(cfg, per_agency, max_pages)
        if result is None:
            continue
        scraped[cfg.key] = result
        if result[1]:
            print(f"[{cfg.key}] hit the --per-agency cap; not treating unseen listings as gone")
    return scraped


def _load_injected(path: pathlib.Path, now: dt.datetime) -> dict[str, tuple[list[dict], bool]]:
    if not path.exists():
        print(f"no injected results at {path}")
        return {}
    payload = json.loads(path.read_text())
    age = now - dt.datetime.fromisoformat(payload["scraped_at"])
    if age > dt.timedelta(hours=MAX_INJECT_AGE_HOURS):
        print(f"ignoring injected results from {payload['scraped_at']} (older than {MAX_INJECT_AGE_HOURS}h)")
        return {}
    return {k: (v["rows"], v["truncated"]) for k, v in payload["agencies"].items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--listings", type=pathlib.Path, help="existing listings.json, updated in place (may not exist yet)")
    parser.add_argument("--per-agency", type=int, default=80)
    parser.add_argument("--max-pages", type=int, default=12)
    parser.add_argument("--platform", action="append", help="only scrape agencies on this platform (repeatable)")
    parser.add_argument("--dump", type=pathlib.Path, help="scrape and write the raw per-agency results here instead of merging")
    parser.add_argument("--inject", type=pathlib.Path, help="pre-scraped results from --dump to merge in; agencies in it are not re-scraped")
    args = parser.parse_args()
    if not args.dump and not args.listings:
        parser.error("--listings is required unless --dump is used")

    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    agencies = [c for c in AGENCIES.values() if not args.platform or c.platform in args.platform]

    if args.dump:
        scraped = _scrape(agencies, args.per_agency, args.max_pages)
        if not scraped:
            raise SystemExit("every agency failed — not writing a dump")
        args.dump.write_text(json.dumps({
            "scraped_at": now.isoformat(),
            "agencies": {k: {"rows": r, "truncated": t} for k, (r, t) in scraped.items()},
        }, ensure_ascii=False))
        print(f"dumped {sorted(scraped)} to {args.dump}")
        return

    existing = json.loads(args.listings.read_text()) if args.listings.exists() else []
    injected = _load_injected(args.inject, now) if args.inject else {}
    scraped = _scrape([c for c in agencies if c.key not in injected], args.per_agency, args.max_pages)
    scraped.update(injected)

    if not scraped:
        raise SystemExit("every agency failed — refusing to write an unchanged dataset as if it were refreshed")

    merged = merge(existing, scraped, now.date())
    args.listings.write_text(json.dumps(merged, ensure_ascii=False, indent=2))
    live = sum(1 for l in merged if not l.get("off_market"))
    print(f"wrote {len(merged)} listings ({live} on market) to {args.listings}")
    print(f"agencies refreshed: {sorted(scraped)}; skipped: {sorted(set(AGENCIES) - set(scraped))}")


if __name__ == "__main__":
    main()
