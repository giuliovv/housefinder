"""Flip the agency kill switch (see scraper/killswitch.py).

    python3 ops/killswitch.py status
    python3 ops/killswitch.py off foxtons "reason"     # stop scraping and hide its listings NOW
    python3 ops/killswitch.py on foxtons               # allow it again (the next scrape run brings the listings back)

`off` writes s3://<bucket>/killswitch.json and invalidates /killswitch.json on CloudFront, so the website hides the
agency's listings within seconds, without a deploy. Scraping stops at the next run, which also removes the rows from the data.
"""
from __future__ import annotations

import datetime as dt
import json
import subprocess
import sys

BUCKET = "housefinder-frontend-854656252703"
DISTRIBUTION = "E2G5ZZZON3XYHL"


def aws(*args: str, stdin: str | None = None) -> str:
    r = subprocess.run(["aws", *args], input=stdin, capture_output=True, text=True)
    if r.returncode:
        raise SystemExit(f"aws {' '.join(args[:2])} failed: {r.stderr.strip()[:300]}")
    return r.stdout


def read() -> dict:
    r = subprocess.run(["aws", "s3", "cp", f"s3://{BUCKET}/killswitch.json", "-"], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else {"disabled": []}


def main(argv: list[str]) -> None:
    cmd = argv[0] if argv else "status"
    state = read()
    if cmd == "status":
        print(json.dumps(state, indent=2))
        return
    if cmd not in ("on", "off") or len(argv) < 2:
        raise SystemExit(__doc__)
    agency = argv[1]
    disabled = set(state.get("disabled", []))
    if cmd == "off":
        disabled.add(agency)
    else:
        disabled.discard(agency)
    state = {
        "disabled": sorted(disabled),
        "reason": " ".join(argv[2:]) if cmd == "off" else "",
        "at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    }
    aws("s3", "cp", "-", f"s3://{BUCKET}/killswitch.json", "--content-type", "application/json", "--cache-control", "no-cache", stdin=json.dumps(state))
    aws("cloudfront", "create-invalidation", "--distribution-id", DISTRIBUTION, "--paths", "/killswitch.json")
    print(f"{agency}: {'DISABLED (hidden on the site within seconds; scraping stops)' if cmd == 'off' else 'enabled again'}")
    print(json.dumps(state))


if __name__ == "__main__":
    main(sys.argv[1:])
