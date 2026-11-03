"""Print the anonymous usage counters kept in Firestore (stats/<day> documents, see frontend/src/lib/stats.ts).

Reads with the admin service account stored in SSM (/housefinder/firebase-admin); clients cannot read these documents.

    python3 scripts/analytics_report.py            # last 14 days + funnel
    python3 scripts/analytics_report.py --days 30
    python3 scripts/analytics_report.py --sources   # funnel per campaign link (?utm_source=tiktok&utm_campaign=demo1)
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
EVENTS = [
    ("ev_match_shown", "match moments offered"),
    ("ev_match_hit", "...swiped right (a hit)"),
    ("ev_match_miss", "...swiped left (a miss)"),
    ("ev_match_opened", "...opened the home from the celebration"),
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


def fetch_sources(creds, days: int) -> dict[tuple[str, str], dict[str, int]]:
    """src_stats/<day>~<source>~<campaign> documents, added up per (source, campaign) over the last `days` days."""
    base = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/src_stats"
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    out: dict[tuple[str, str], dict[str, int]] = {}
    token = None
    while True:
        r = requests.get(base, headers={"Authorization": f"Bearer {creds.token}"},
                         params={"pageSize": 300, **({"pageToken": token} if token else {})}, timeout=30)
        r.raise_for_status()
        body = r.json()
        for doc in body.get("documents", []):
            day, source, campaign = (doc["name"].rsplit("/", 1)[1].split("~") + ["", ""])[:3]
            if day < cutoff:
                continue
            acc = out.setdefault((source, campaign), {})
            for k, v in doc.get("fields", {}).items():
                acc[k] = acc.get(k, 0) + int(v["integerValue"])
        token = body.get("nextPageToken")
        if not token:
            break
    return out


def print_sources(creds, days: int) -> None:
    rows = fetch_sources(creds, days)
    if not rows:
        print("no campaign-tagged visits yet (links need ?utm_source=...)")
        return
    cols = [("visitors_new", "new"), ("visitors", "visits"), ("m_first_swipe", "swiped"), ("m_swipes_25", "25sw"), ("m_browse_opened", "browse"), ("m_saved", "saved"), ("m_agency_click", "clicks")]
    print(f"{'source':12} {'campaign':14}" + "".join(f"{label:>8}" for _, label in cols) + f"{'swipe%':>8}{'click%':>8}")
    for (source, campaign), v in sorted(rows.items(), key=lambda kv: -kv[1].get("visitors_new", 0)):
        new = v.get("visitors_new", 0) or v.get("visitors", 0) or 1
        print(f"{source:12} {campaign or '-':14}" + "".join(f"{v.get(k, 0):>8}" for k, _ in cols)
              + f"{v.get('m_first_swipe', 0) / new:>8.0%}{v.get('m_agency_click', 0) / new:>8.0%}")
    print("\nFirst-touch attribution: a browser counts for the link it first arrived from, including on later visits. swipe%/click% are relative to new browsers.")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=14)
    ap.add_argument("--sources", action="store_true", help="funnel per campaign link instead of the overall report")
    args = ap.parse_args()
    if args.sources:
        print_sources(credentials(), args.days)
        return
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
    ev = {k: sum(v.get(k, 0) for v in data.values()) for k, _ in EVENTS}
    if ev["ev_match_shown"]:
        print("\nMatch moments (event counts):")
        for key, label in EVENTS:
            print(f"  {ev[key]:>6}  {label}")
        answered = ev["ev_match_hit"] + ev["ev_match_miss"]
        if answered:
            print(f"  hit rate {ev['ev_match_hit'] / answered:.0%} of {answered} answered (a typical photo is liked far less often)")


if __name__ == "__main__":
    main()
