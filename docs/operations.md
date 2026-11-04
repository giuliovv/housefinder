# Operations

Running the site day to day. Back to the [docs index](README.md).

## Alerts (ops)

Every workflow run ends with `scraper/health.py`, which writes alerts to
`s3://…/alerts/pending/` (run failed, an agency collapsed/blocked/went stale, browseable
listings shrank) plus a heartbeat (`analytics/last-scrape.json`). `ops/housefinder_watch.py`
runs from cron on the dev host hourly (at :07), also checks the heartbeat (older than
30h = missed run) and the live site, and delivers new alerts to Claude by resuming the
Telegram conversation's session (`claude -p --resume`, exactly as the bridge does); Claude
investigates and messages the user. It waits while a user turn is in flight and wakes at
most every 2h unless critical. `python ops/housefinder_watch.py --dry-run` shows what it
would do; `--test` injects a harmless test alert.

## Usage counters (no external analytics)

The site counts anonymous usage in its own Firestore: one `stats/<UTC day>` document of plain counters (visitors, new visitors,
mobile visitors, and funnel milestones such as first swipe, "ready" card, Browse opened, saved a home, shared a list).
No ids, IPs, cookies or content are stored (see `frontend/src/lib/stats.ts`). Not counted: Do Not Track, localhost, and any
browser opened once with `?notrack`. Clients can only add to a fixed list of counters (`firebase/firestore.rules`) and cannot read them.

    python3 scripts/analytics_report.py --days 14   # needs AWS access to SSM /housefinder/firebase-admin

### Where visitors came from (campaign links)

A link like `https://houseswipe.uk/?utm_source=tiktok&utm_campaign=demo1` is remembered in the browser (first touch; the tags are then removed from
the address bar) and the same counters are also added to `src_stats/<day>~<source>~<campaign>`. Short names are mapped (`ig` to `instagram`, `tt` to
`tiktok` and so on) and `utm_content` is the campaign when none is given. The Firestore rules accept only a fixed list of sources. Read it with
`python3 scripts/analytics_report.py --sources`.

### The private /stats page

`https://houseswipe.uk/stats` shows the numbers (headline, trend strip, funnel, sources, day by day). It is not linked anywhere, is `noindex`, and is
protected by a password kept in SSM (`/housefinder/stats-password`, SecureString). The page calls `GET /api/stats` on the board API Lambda, which
checks the password (constant-time compare, one second delay on a wrong one) and reads the counters with the Firebase admin key. To change the
password: `aws ssm put-parameter --name /housefinder/stats-password --type SecureString --overwrite --value ...`.

## CloudFront cost guard

`ops/cost_guard.py` (run by the hourly watcher) reads CloudFront's free CloudWatch metrics for the month so far. Warning at 25 GB or
300k requests; hard stop at 300 GB, 3M requests, or 60 GB in one day: it disables the distribution (the site goes down on purpose; these
limits are all inside CloudFront's always-free 1 TB / 10M requests, so a stop happens before any charge). `python3 ops/cost_guard.py
status|enable|disable`. A CDK deploy re-enables the distribution; the guard re-checks hourly. Typical traffic today: ~0.3 GB and ~100 requests a day.

See also [`infra/README.md`](../infra/README.md) for the deployment, and the kill switch in [`PLAN.md`](../PLAN.md) (`ops/killswitch.py`).
