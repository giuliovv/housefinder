"""Produce a single JSON array of listings (with full detail) for the
frontend to consume as a static file — no backend yet, this is just for a
local/preview build. Deliberately modest in volume (a handful per agency):
this is a demo dataset, not a production crawl, and detail() is one request
per listing so keep it polite.

Usage:
    python -m scraper.export --per-agency 6 --out frontend/public/data/listings.json
"""
from __future__ import annotations

import argparse
import dataclasses
import itertools
import json
import pathlib
import re

from .agencies import AGENCIES
from .cli import build_scraper
from .http import Blocked
from .keys import key_for, namespaced_source_id
from .price import clean_price_text, implausible_reason
from .london import is_london


# below this it's a parking space, garage or storage unit, not a home to rent
MIN_PLAUSIBLE_RENT_PCM = 300

# Agencies that answered this run with a bot challenge. refresh.py reads this to
# back off from them for a while instead of trying again the next day.
BLOCKED: set[str] = set()


def _listing_key(summary) -> str:
    return key_for(summary.platform, summary.agency, summary.source_id)


def _namespace(row: dict) -> dict:
    """Parsers work with the agency's raw id (some use it to find photos); the stored
    row carries the agency-namespaced one."""
    s = row["summary"]
    s["source_id"] = namespaced_source_id(s["platform"], s["agency"], s["source_id"])
    return row


def _flag_implausible_price(summary):
    summary = dataclasses.replace(summary, price_text=clean_price_text(summary.price_text))
    reason = implausible_reason(summary.price_pcm, summary.bedrooms)
    if reason is None:
        return summary
    print(f"  ! implausible price {summary.price_text!r} ({summary.bedrooms} bed) at {summary.address!r}: {reason}")
    return dataclasses.replace(summary, price_pcm=None, price_flag=reason)


def _has_known(known: dict[str, dict], cfg) -> bool:
    return any(row.get("summary", {}).get("agency") == cfg.key for row in known.values())


def scrape_agency(cfg, per_agency: int, max_pages: int, known: dict[str, dict] | None = None) -> tuple[list[dict], bool] | None:
    """Returns (rows, truncated), or None if the agency's search itself
    failed. `truncated` means the agency had more listings than `per_agency`
    — callers deciding whether an unseen listing has genuinely gone must
    not treat it as gone in that case, since it may just be past the cap.

    `known` maps listing key -> a previously scraped row. For those we reuse
    the stored description/photos and only refresh the search-card fields
    (price, status), instead of re-fetching every detail page every day —
    far fewer requests to the agency."""
    known = known or {}
    print(f"[{cfg.key}] searching...")
    scraper = build_scraper(cfg)
    rows: list[dict] = []
    try:
        try:
            # one past the cap, purely to learn whether the cap cut anything off
            summaries = list(itertools.islice(scraper.search(cfg.key, cfg.search_url, max_pages=max_pages), per_agency + 1))
        except Blocked as exc:
            print(f"[{cfg.key}] {exc} — backing off from this agency")
            print(f"::warning title={cfg.key} blocked::{exc}")
            BLOCKED.add(cfg.key)
            return None
        except Exception as exc:  # noqa: BLE001 - one agency being unreachable (rate-limited, down, etc.) shouldn't lose every other agency's results
            print(f"[{cfg.key}] search failed, skipping this agency entirely: {exc}")
            # GitHub Actions annotation (plain text elsewhere) — surfaces the reason on the run page
            print(f"::warning title={cfg.key} search failed::{type(exc).__name__}: {str(exc)[:300]!r}")
            return None
        if not summaries and _has_known(known, cfg):
            # An agency that had listings yesterday and shows none today is far more
            # likely blocking/failing than empty; treat it as a failed scrape so its
            # listings aren't marked gone.
            print(f"[{cfg.key}] returned zero listings but we know of some — treating as failed")
            print(f"::warning title={cfg.key} returned nothing::zero listings for an agency with known ones")
            return None
        truncated = len(summaries) > per_agency
        summaries = summaries[:per_agency]
        # some agencies list parking spaces / garages / single rooms among lettings
        summaries = [x for x in summaries if x.price_pcm is None or x.price_pcm >= MIN_PLAUSIBLE_RENT_PCM]
        if cfg.london_only:
            summaries = [x for x in summaries if is_london(x.address)]
        summaries = [_flag_implausible_price(x) for x in summaries]
        seen: set[str] = set()
        summaries = [x for x in summaries if not (_listing_key(x) in seen or seen.add(_listing_key(x)))]
        for i, summary in enumerate(summaries, 1):
            prev = known.get(_listing_key(summary))
            # rows stored before attributes existed are re-fetched once to backfill them
            if prev is not None and "attributes" in prev:
                row = dict(prev)
                row["summary"] = dataclasses.asdict(summary)
                rows.append(_namespace(row))
                continue
            print(f"[{cfg.key}] detail {i}/{len(summaries)}: {summary.address}")
            try:
                detail = scraper.detail(cfg.key, summary)
            except Blocked as exc:
                # a challenge mid-run: stop at once rather than keep requesting
                print(f"[{cfg.key}] {exc} — stopping and backing off")
                print(f"::warning title={cfg.key} blocked::{exc}")
                BLOCKED.add(cfg.key)
                return None
            except Exception as exc:  # noqa: BLE001 - one flaky page shouldn't lose the whole batch
                print(f"[{cfg.key}] skipping {summary.address!r}: {exc}")
                continue
            row = dataclasses.asdict(detail)
            row["agency_name"] = cfg.name
            rows.append(_namespace(row))
    finally:
        if hasattr(scraper, "close"):
            scraper.close()
    return rows, truncated


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-agency", type=int, default=6)
    parser.add_argument("--max-pages", type=int, default=2, help="search-result pages to fetch per agency before slicing to --per-agency")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("listings.json"))
    args = parser.parse_args()

    all_listings = []
    for cfg in AGENCIES.values():
        result = scrape_agency(cfg, args.per_agency, args.max_pages)
        if result is not None:
            all_listings.extend(result[0])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(all_listings, ensure_ascii=False, indent=2))
    print(f"wrote {len(all_listings)} listings to {args.out}")


if __name__ == "__main__":
    main()
