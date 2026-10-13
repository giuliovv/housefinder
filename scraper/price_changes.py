"""Price history for the site: the homes whose rent has really changed.

`analytics/history.json` records every listing's price on every day it was seen, privately. The site gets a slim file,
`price-history.json`, holding only homes with a genuine change: `{listing key: [[day, pcm], ...]}`. A move smaller than 2%
is not a change (weekly/monthly conversion rounding, a parser fix), so it never shows up as a "price drop".

    python -m scraper.price_changes --history analytics/history.json --out frontend/public/data/price-history.json
"""
from __future__ import annotations

import argparse
import json
import pathlib

MIN_CHANGE = 0.02   # a price counts as changed when it moved by at least this share of the previous price


def series(points: list) -> list[list]:
    """Collapse a dated price list to the days the price really changed (first point always kept)."""
    out: list[list] = []
    for day, price in sorted(points, key=lambda p: p[0]):
        if price is None or price <= 0:
            continue
        if not out or abs(price - out[-1][1]) / out[-1][1] >= MIN_CHANGE:
            out.append([day, round(float(price), 2)])
    return out


def build(history: dict) -> dict[str, list[list]]:
    result: dict[str, list[list]] = {}
    for key, rec in history.get("listings", {}).items():
        s = series(rec.get("price_history", []))
        if len(s) >= 2:
            result[key] = s
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", type=pathlib.Path, required=True)
    ap.add_argument("--out", type=pathlib.Path, required=True)
    args = ap.parse_args()
    result = build(json.loads(args.history.read_text()))
    args.out.write_text(json.dumps(result, separators=(",", ":"), sort_keys=True))
    drops = sum(1 for s in result.values() if s[-1][1] < s[-2][1])
    print(f"price history: {len(result)} homes with a real price change, {drops} of them last moved down")


if __name__ == "__main__":
    main()
