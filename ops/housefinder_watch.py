#!/usr/bin/env python3
"""Host-side watcher: turns House Finder alerts into a message to Claude — in the
*same* Telegram conversation — who investigates and reports back to the user.

How it reaches "Claude in particular": the Telegram bridge on this host
(aws-claudecode/bot/local-claude-telegram.js) runs Claude as
`claude -p --resume <session id>` for every message, keeping the session id in
~/.claude-telegram-state.json. So an alert is delivered by doing exactly that with
the alert as the prompt: Claude wakes with the whole project conversation as
context, investigates, and its reply is sent to the user's chat via the bot. The new
session id is written back, so when the user replies the conversation simply
continues from the investigation.

Sources of alerts (all read from S3, no GitHub API / rate limits):
  alerts/pending/*.json   written by scraper/health.py at the end of each workflow run
  analytics/last-scrape.json  heartbeat of the last good scraping run — older than
                          STALE_SCRAPE_HOURS means the schedule didn't fire or runs keep failing
  the live site           must answer and still contain the data

Safety: it never wakes Claude while a user turn is in flight (the bridge isn't
re-entrant on one session) — it just tries again next cron tick; it wakes at most
once per WAKE_COOLDOWN_HOURS unless something is critical; the prompt tells Claude
to investigate and recommend, not to push, deploy or change anything unasked.

Cron (hourly, at :07 — everything watched happens on a daily scale; only a site outage is time-sensitive):
    7 * * * * /usr/bin/python3 /home/ubuntu/london-rentals/ops/housefinder_watch.py >> /home/ubuntu/housefinder-watch.log 2>&1
Manual: --dry-run (print the prompt, change nothing)  --test (inject a harmless test alert).
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

BUCKET = "housefinder-frontend-854656252703"
SITE = "https://houseswipe.giuliovaccari.it"
HOME = pathlib.Path("/home/ubuntu")
STATE = HOME / ".housefinder-watch-state.json"
LOCK = HOME / ".housefinder-watch.lock"
CHAT_STATE = HOME / ".claude-telegram-state.json"
CLAUDE_BIN = os.environ.get("CLAUDE_BIN", str(HOME / ".local/bin/claude"))
WORKDIR = "/home/ubuntu/giuliowd"
AWS = "/usr/local/bin/aws"
STALE_SCRAPE_HOURS = 30
WAKE_COOLDOWN_HOURS = 2
TASK_TIMEOUT_S = 25 * 60
MIN_LISTINGS = 1000
APPEND_SYSTEM_PROMPT = (
    "You are running unattended behind a Telegram bridge. Return concise final answers suitable for Telegram. "
    "If you need user input, ask for it explicitly in the final answer instead of waiting silently."
)


def log(msg: str) -> None:
    print(f"{dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')} {msg}", flush=True)


# ---------------------------------------------------------------- pure logic (unit-tested)

def parse_ts(s: str) -> dt.datetime:
    t = dt.datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def stale_scrape_alert(last_scrape: dict | None, now: dt.datetime) -> dict | None:
    if last_scrape is None:
        return None  # no heartbeat has ever been written (feature just deployed): nothing to compare against
    age_h = (now - parse_ts(last_scrape["finished_at"])).total_seconds() / 3600
    if age_h < STALE_SCRAPE_HOURS:
        return None
    return {
        "key": f"stale-scrape:{now.date().isoformat()}",
        "severity": "warning",
        "title": "The daily refresh hasn't completed",
        "detail": f"Last good scraping run finished {age_h:.0f}h ago ({last_scrape['finished_at']}, run {last_scrape.get('run_id')}). "
                  f"The 05:23 UTC schedule may not have fired, or runs keep failing.",
    }


def site_alert(status: int | None, listing_count: int | None, now: dt.datetime) -> dict | None:
    bucket = f"{now.date().isoformat()}-{now.hour // 6}"   # at most one site alert per 6h
    if status is None or status != 200:
        return {"key": f"site-down:{bucket}", "severity": "critical", "title": "The House Finder site isn't answering",
                "detail": f"{SITE} returned {status}."}
    if listing_count is None or listing_count < MIN_LISTINGS:
        return {"key": f"site-empty:{bucket}", "severity": "critical", "title": "The live listings data looks wrong",
                "detail": f"/data/listings.json has {listing_count} listings (expected > {MIN_LISTINGS})."}
    return None


def pick_new(alerts: list[dict], handled: dict[str, str]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for a in alerts:
        if a["key"] not in handled and a["key"] not in seen:
            seen.add(a["key"])
            out.append(a)
    return out


def wake_allowed(new: list[dict], last_wake: str | None, now: dt.datetime) -> bool:
    if any(a.get("severity") == "critical" for a in new):
        return True
    return last_wake is None or (now - parse_ts(last_wake)).total_seconds() >= WAKE_COOLDOWN_HOURS * 3600


def build_prompt(alerts: list[dict], now: dt.datetime) -> str:
    lines = [f"- [{a.get('severity', 'warning')}] {a['title']}: {a['detail']}" + (f" ({a['run_url']})" if a.get("run_url") else "") for a in alerts]
    return (
        "[AUTOMATED HOUSE FINDER ALERT — sent by the health watcher on this host; this is NOT a message from the user]\n"
        f"Time: {now.isoformat(timespec='minutes')}\n"
        "Alerts:\n" + "\n".join(lines) + "\n\n"
        "Please: (1) investigate now — the workflow run logs/annotations via the public GitHub API, the S3 files "
        "(analytics/history.json, analytics/health.json, analytics/last-scrape.json, alerts/), the repo and the live site; "
        "(2) work out the likely cause; (3) do NOT push, deploy, delete or change anything on your own — if there is a clear safe "
        "fix, describe it and ask the user to approve it; (4) reply with a SHORT Telegram message for the user: what happened, "
        "what you found, what you recommend. Never print secrets."
    )


def split_message(text: str, limit: int = 3500) -> list[str]:
    chunks, rest = [], text.strip()
    while len(rest) > limit:
        cut = rest.rfind("\n", 0, limit)
        cut = cut if cut > limit // 2 else limit
        chunks.append(rest[:cut].rstrip())
        rest = rest[cut:].lstrip()
    return chunks + [rest] if rest else chunks or [""]


def is_claude_turn(cmdline: str) -> bool:
    """A bridge-spawned `claude -p … --dangerously-skip-permissions` process = a user turn in flight."""
    return bool(re.search(r"(^|[\s/])claude\b", cmdline)) and " -p" in cmdline and "--dangerously-skip-permissions" in cmdline


# ---------------------------------------------------------------- side effects

def sh(args: list[str], timeout: int = 60, **kw) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True, timeout=timeout, **kw)


def s3_json(key: str):
    r = sh([AWS, "s3", "cp", f"s3://{BUCKET}/{key}", "-", "--quiet"])
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None


def pending_alerts() -> list[tuple[str, dict]]:
    r = sh([AWS, "s3", "ls", f"s3://{BUCKET}/alerts/pending/"])
    out = []
    for line in r.stdout.splitlines():
        name = line.split()[-1] if line.strip() else ""
        if name.endswith(".json"):
            doc = s3_json(f"alerts/pending/{name}")
            if doc and "key" in doc:
                out.append((name, doc))
    return out


def fetch_site() -> tuple[int | None, int | None]:
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{SITE}/data/listings.json", headers={"User-Agent": "house-finder-watch/0.1"}), timeout=30) as resp:
            body = resp.read()
            return resp.status, len(json.loads(body))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:  # noqa: BLE001 - any failure to reach/parse is itself the finding
        return None, None


def busy() -> bool:
    me = str(os.getpid())
    for line in sh(["pgrep", "-af", "claude"]).stdout.splitlines():
        pid, _, cmd = line.partition(" ")
        if pid != me and is_claude_turn(cmd):
            return True
    return False


def chat_id() -> str:
    cid = os.environ.get("CLAUDE_ALLOWED_CHAT_ID")
    if cid:
        return cid
    access = json.loads((HOME / ".claude/channels/telegram/access.json").read_text())
    return str(access["allowFrom"][0])


def bot_token() -> str:
    """The bridge's token, read through sudo (the env file is root-only); never logged or written."""
    r = sh(["sudo", "-n", "cat", "/etc/ai-bots.env"])
    m = re.search(r"^CLAUDE_TELEGRAM_BOT_TOKEN=['\"]?([^'\"\s]+)", r.stdout, re.M)
    if not m:
        raise RuntimeError("could not read the Telegram bot token")
    return m.group(1)


def send_telegram(text: str) -> None:
    token, cid = bot_token(), chat_id()
    for chunk in split_message(text):
        data = json.dumps({"chat_id": cid, "text": chunk, "disable_web_page_preview": True}).encode()
        req = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data, headers={"content-type": "application/json"})
        urllib.request.urlopen(req, timeout=20).read()


def wake_claude(prompt: str) -> tuple[bool, str]:
    chats = json.loads(CHAT_STATE.read_text()).get("chats", {})
    cid = chat_id()
    st = chats.get(cid, {})
    args = [CLAUDE_BIN, "-p", "--output-format", "json", "--model", st.get("model", "claude-sonnet-5-5"),
            "--dangerously-skip-permissions", "--append-system-prompt", APPEND_SYSTEM_PROMPT]
    if st.get("sessionId"):
        args += ["--resume", st["sessionId"]]
    args.append(prompt)
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=TASK_TIMEOUT_S, cwd=WORKDIR, env={**os.environ, "HOME": str(HOME)})
    except subprocess.TimeoutExpired:
        return False, "Claude timed out while investigating"
    result = None
    for line in reversed(r.stdout.splitlines()):
        try:
            ev = json.loads(line)
        except json.JSONDecodeError:
            continue
        if ev.get("type") == "result":
            result = ev
            break
    if r.returncode != 0 or not result or result.get("is_error"):
        return False, f"Claude run failed (exit {r.returncode})"
    if result.get("session_id"):  # keep the conversation continuous, as the bridge does
        state = json.loads(CHAT_STATE.read_text())
        state.setdefault("chats", {}).setdefault(cid, {})["sessionId"] = result["session_id"]
        state["chats"][cid]["updatedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        CHAT_STATE.write_text(json.dumps(state, indent=2))
    return True, (result.get("result") or "").strip()


def load_state() -> dict:
    try:
        return json.loads(STATE.read_text())
    except (OSError, json.JSONDecodeError):
        return {"handled": {}, "last_wake": None}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--test", action="store_true")
    args = ap.parse_args()

    lock = open(LOCK, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("another watcher run is in progress")
        return 0

    now = dt.datetime.now(dt.timezone.utc)
    state = load_state()
    found: list[tuple[str | None, dict]] = [(name, doc) for name, doc in pending_alerts()]
    for synthetic in (stale_scrape_alert(s3_json("analytics/last-scrape.json"), now), site_alert(*fetch_site(), now)):
        if synthetic:
            found.append((None, synthetic))
    if args.test:
        found.append((None, {"key": f"test:{now.strftime('%Y%m%d%H%M')}", "severity": "warning", "title": "Watcher end-to-end test",
                             "detail": "This is a deliberate test of the alert pipeline. Do not investigate anything: reply with one short line "
                                       "confirming the alert reached you, and say it's a test."}))

    new = pick_new([doc for _, doc in found], state["handled"])
    log(f"{len(found)} alert(s) found, {len(new)} new")
    if not new:
        return 0
    if not wake_allowed(new, state["last_wake"], now) and not args.test:
        log("new alerts but inside the wake cooldown; leaving them for later")
        return 0
    prompt = build_prompt(new, now)
    if args.dry_run:
        print(prompt)
        return 0
    if busy():
        log("a user turn is in flight; trying again next run")
        return 0

    ok, text = wake_claude(prompt)
    if not ok:  # the alert still has to reach the user, even if Claude couldn't be woken
        text = "House Finder alert (Claude couldn't be woken to investigate — " + text + "):\n" + "\n".join(f"- {a['title']}: {a['detail']}" for a in new)
    try:
        send_telegram(text)
    except Exception as exc:  # noqa: BLE001
        log(f"could not send to Telegram: {exc}; will retry next run")
        return 1
    stamp = now.isoformat()
    for a in new:
        state["handled"][a["key"]] = stamp
    state["handled"] = dict(sorted(state["handled"].items(), key=lambda kv: kv[1])[-300:])
    state["last_wake"] = stamp
    STATE.write_text(json.dumps(state, indent=1))
    for name, doc in found:
        if name and doc["key"] in state["handled"]:   # file the delivered pending alerts away
            sh([AWS, "s3", "mv", f"s3://{BUCKET}/alerts/pending/{name}", f"s3://{BUCKET}/alerts/handled/{name}", "--quiet"])
    log(f"delivered {len(new)} alert(s); claude ok={ok}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
