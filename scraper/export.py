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

from .agencies import AGENCIES
from .cli import build_scraper


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-agency", type=int, default=6)
    parser.add_argument("--max-pages", type=int, default=2, help="search-result pages to fetch per agency before slicing to --per-agency")
    parser.add_argument("--out", type=pathlib.Path, default=pathlib.Path("listings.json"))
    args = parser.parse_args()

    all_listings = []
    for cfg in AGENCIES.values():
        print(f"[{cfg.key}] searching...")
        scraper = build_scraper(cfg)
        try:
            try:
                summaries = list(itertools.islice(scraper.search(cfg.key, cfg.search_url, max_pages=args.max_pages), args.per_agency))
            except Exception as exc:  # noqa: BLE001 - one agency being unreachable (rate-limited, down, etc.) shouldn't lose every other agency's results
                print(f"[{cfg.key}] search failed, skipping this agency entirely: {exc}")
                continue
            for i, summary in enumerate(summaries, 1):
                print(f"[{cfg.key}] detail {i}/{len(summaries)}: {summary.address}")
                try:
                    detail = scraper.detail(cfg.key, summary)
                except Exception as exc:  # noqa: BLE001 - one flaky page shouldn't lose the whole batch
                    print(f"[{cfg.key}] skipping {summary.address!r}: {exc}")
                    continue
                row = dataclasses.asdict(detail)
                row["agency_name"] = cfg.name
                all_listings.append(row)
        finally:
            if hasattr(scraper, "close"):
                scraper.close()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(all_listings, ensure_ascii=False, indent=2))
    print(f"wrote {len(all_listings)} listings to {args.out}")


if __name__ == "__main__":
    main()
