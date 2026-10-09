"""Kill switch: agencies that must not be scraped or shown.

The switch is `killswitch.json` at the root of the site bucket, `{"disabled": ["foxtons"], "reason": ..., "at": ...}`
(flipped with `ops/killswitch.py`; deliberately outside the deployed site data so no deploy can overwrite it).
Three layers honour it:
  * the scraper skips disabled agencies (scraper/refresh.py),
  * `apply` removes their rows from listings.json — run on every workflow run, scrape or deploy-only,
  * the website fetches /killswitch.json at load and hides those listings at once, with no deploy.

    python -m scraper.killswitch apply --listings frontend/public/data/listings.json --file killswitch.json
"""
from __future__ import annotations

import argparse
import json
import pathlib


def load(path: pathlib.Path | None) -> set[str]:
    """Disabled agency keys; a missing or unreadable file means nothing is disabled."""
    if path is None or not path.exists():
        return set()
    try:
        return {str(k) for k in json.loads(path.read_text()).get("disabled", [])}
    except (ValueError, AttributeError):
        print(f"::warning::could not read the kill switch file {path}; treating nothing as disabled")
        return set()


def purge(rows: list[dict], disabled: set[str]) -> list[dict]:
    return [r for r in rows if r["summary"].get("agency") not in disabled]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=["apply"])
    ap.add_argument("--listings", type=pathlib.Path, required=True)
    ap.add_argument("--file", type=pathlib.Path, default=pathlib.Path("killswitch.json"))
    args = ap.parse_args()
    disabled = load(args.file)
    if not disabled or not args.listings.exists():
        print("kill switch: nothing disabled")
        return
    rows = json.loads(args.listings.read_text())
    kept = purge(rows, disabled)
    if len(kept) != len(rows):
        args.listings.write_text(json.dumps(kept, ensure_ascii=False, indent=2))
    print(f"kill switch: {sorted(disabled)} disabled; removed {len(rows) - len(kept)} listings")


if __name__ == "__main__":
    main()
