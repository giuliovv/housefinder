"""Ad-hoc runner: fetch listings for one registered agency and print them as
JSON. Not a scheduler/pipeline — that's a later phase once these parsers are
trusted; this is for manually checking a parser still works against the live
site.

Usage:
    python -m scraper.cli innercityestates --pages 1
    python -m scraper.cli properly --pages 1 --detail
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import sys

from .agencies import AGENCIES
from .homeflow import HomeflowScraper
from .propertyhive import PropertyHiveScraper


def build_scraper(platform: str):
    if platform == "homeflow":
        return HomeflowScraper()
    if platform == "propertyhive":
        return PropertyHiveScraper()
    raise ValueError(f"no scraper registered for platform: {platform}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("agency", choices=sorted(AGENCIES))
    parser.add_argument("--pages", type=int, default=1)
    parser.add_argument("--detail", action="store_true", help="also fetch full detail (photos, description) for each listing")
    args = parser.parse_args()

    cfg = AGENCIES[args.agency]
    scraper = build_scraper(cfg.platform)
    try:
        for summary in scraper.search(cfg.key, cfg.search_url, max_pages=args.pages):
            row = dataclasses.asdict(summary)
            if args.detail:
                row = dataclasses.asdict(scraper.detail(cfg.key, summary))
            print(json.dumps(row, ensure_ascii=False))
    finally:
        if hasattr(scraper, "close"):
            scraper.close()


if __name__ == "__main__":
    sys.exit(main())
