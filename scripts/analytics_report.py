"""Print the anonymous usage counters kept in Firestore (stats/<day> documents, see frontend/src/lib/stats.ts).

Reads with the admin service account stored in SSM (/housefinder/firebase-admin); clients cannot read these documents.

    python3 scripts/analytics_report.py            # last 14 days + funnel
    python3 scripts/analytics_report.py --days 30
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import subprocess
import tempfile

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

PROJECT = "houseswipe-b390e"
FUNNEL = [
    ("visitors", "opened the site (per day)"),
    ("m_first_swipe", "swiped a photo"),
    ("m_swipes_10", "10 swipes"),
    ("m_swipes_25", "25 swipes"),
    ("m_ready_shown", "got the 'ready' card"),
    ("m_ready_go", "  ...tapped 'See my matches'"),
    ("m_browse_opened", "opened Browse"),
    ("m_browse_deep", "scrolled past the first page"),
    ("m_filter_used", "used a filter"),
    ("m_map_used", "opened the map"),
    ("m_area_drawn", "drew an area"),
    ("m_q_answered", "answered a question card"),
    ("m_q_skipped", "skipped the question cards"),
    ("m_saved", "saved a home"),
    ("m_share_created", "created a shared list"),
    ("m_share_joined", "joined a shared list"),
    ("m_agency_click", "opened an agency listing"),
]


def credentials() -> service_account.Credentials:
    raw = subprocess.run(
        ["aws", "ssm", "get-parameter", "--name", "/housefinder/firebase-admin", "--with-decryption",
         "--query", "Parameter.Value", "--output", "text"],
        check=True, capture_output=True, text=True,
    ).stdout
    with tempfile.NamedTemporaryFile("w", suffix=".json") as f:  # removed on close
        f.write(raw)
        f.flush()
        creds = service_account.Credentials.from_service_account_file(f.name, scopes=["https://www.googleapis.com/auth/datastore"])
    creds.refresh(Request())
    return creds


def fetch_days(creds, days: int) -> dict[str, dict[str, int]]:
    base = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/stats"
    out: dict[str, dict[str, int]] = {}
    token = None
    while True:
        r = requests.get(base, headers={"Authorization": f"Bearer {creds.token}"},
                         params={"pageSize": 300, **({"pageToken": token} if token else {})}, timeout=30)
        r.raise_for_status()
        body = r.json()
        for doc in body.get("documents", []):
            day = doc["name"].rsplit("/", 1)[1]
            out[day] = {k: int(v["integerValue"]) for k, v in doc.get("fields", {}).items()}
        token = body.get("nextPageToken")
        if not token:
            break
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    return {d: v for d, v in sorted(out.items()) if d >= cutoff}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    args = ap.parse_args()
    data = fetch_days(credentials(), args.days)
    if not data:
        print("no data yet")
        return
    print(f"{'day':10} {'visitors':>8} {'new':>5} {'mobile':>7} {'swiped':>7} {'browse':>7} {'saved':>6} {'clicks':>7}")
    for day, v in data.items():
        print(f"{day:10} {v.get('visitors', 0):>8} {v.get('visitors_new', 0):>5} {v.get('visitors_mobile', 0):>7} "
              f"{v.get('m_first_swipe', 0):>7} {v.get('m_browse_opened', 0):>7} {v.get('m_saved', 0):>6} {v.get('m_agency_click', 0):>7}")
    total = {k: sum(v.get(k, 0) for v in data.values()) for k, _ in FUNNEL}
    top = total["visitors"] or 1
    print(f"\nTotals over {len(data)} day(s) (milestones count each browser once, the first time it got there):")
    for key, label in FUNNEL:
        print(f"  {total[key]:>6}  {total[key] / top:>5.0%}  {label}")


if __name__ == "__main__":
    main()
