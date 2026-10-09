import datetime as dt

from ops import housefinder_watch as w

NOW = dt.datetime(2026, 10, 12, 8, 0, tzinfo=dt.timezone.utc)


def ago(hours):
    return (NOW - dt.timedelta(hours=hours)).isoformat()


def test_stale_scrape_only_after_30h_and_only_if_a_heartbeat_ever_existed():
    assert w.stale_scrape_alert(None, NOW) is None
    assert w.stale_scrape_alert({"finished_at": ago(20), "run_id": "1"}, NOW) is None
    a = w.stale_scrape_alert({"finished_at": ago(40), "run_id": "1"}, NOW)
    assert a["key"] == "stale-scrape:2026-10-12" and "40h" in a["detail"]


def test_site_checks():
    assert w.site_alert(200, 3000, NOW) is None
    assert w.site_alert(None, None, NOW)["severity"] == "critical"
    assert w.site_alert(403, None, NOW)["key"].startswith("site-down:")
    assert w.site_alert(200, 12, NOW)["key"].startswith("site-empty:")


def test_alerts_are_delivered_once():
    alerts = [{"key": "a"}, {"key": "b"}, {"key": "a"}]
    assert [x["key"] for x in w.pick_new(alerts, {"b": "t"})] == ["a"]


def test_wake_cooldown_applies_to_warnings_but_never_blocks_critical():
    warn, crit = [{"severity": "warning"}], [{"severity": "critical"}]
    assert w.wake_allowed(warn, None, NOW)
    assert not w.wake_allowed(warn, ago(1), NOW)
    assert w.wake_allowed(warn, ago(3), NOW)
    assert w.wake_allowed(crit, ago(0.1), NOW)


def test_prompt_tells_claude_not_to_act_on_its_own_and_who_it_is_from():
    p = w.build_prompt([{"severity": "critical", "title": "Run failed", "detail": "boom", "run_url": "https://x/1"}], NOW)
    assert "NOT a message from the user" in p and "do NOT push, deploy" in p and "Run failed" in p and "https://x/1" in p


def test_user_turn_detection_matches_the_bridge_process_but_not_other_commands():
    bridge = "/home/ubuntu/.local/share/claude/versions/2.1.284 -p --output-format json --model claude-sonnet-5-5 --dangerously-skip-permissions --resume abc hello"
    assert w.is_claude_turn(bridge)
    assert not w.is_claude_turn("/usr/bin/node /home/ubuntu/aws-claudecode/bot/local-claude-telegram.js")
    assert not w.is_claude_turn("claude --version")


def test_long_messages_are_split_for_telegram():
    parts = w.split_message("line\n" * 2000, 3500)
    assert len(parts) >= 3 and all(len(p) <= 3500 for p in parts)
    assert w.split_message("short") == ["short"]
