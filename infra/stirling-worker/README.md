# Stirling Ackroyd Ireland worker

Use Ireland as the sole default executor for this agency, not an automatic
retry after a GitHub challenge. Multiple executors would undermine cooldowns.
No IP rotation or CAPTCHA recovery is implemented.

Build from the repository root with `docker buildx build --platform linux/arm64
--provenance=false --sbom=false --push -t <eu-west-1 ECR repo>:lambda
-f infra/stirling-worker/Dockerfile .`. Lambda rejects multi-platform image
indexes with Docker attestations; verify ECR reports a single image manifest.
Deploy the image as a Lambda in eu-west-1, Python image architecture matching the build,
512 MB, timeout 900 seconds, BUCKET=housefinder-frontend-854656252703.
This account cannot reserve one concurrency slot without dropping below AWS's
minimum 10 unreserved slots; the conditional S3 reservation serializes requests.
Use default Lambda networking; no NAT gateway is needed. The existing daily
GitHub workflow invokes it when the S3 state says it is due, while the worker's durable S3 reservation enforces
48 hours between actual site attempts, including manual invocations and failures.

Execution role needs CloudWatch logs and s3:GetObject on analytics/history.json,
killswitch.json, data/listings.json, inbox/stirling-state.json; s3:PutObject on
inbox/stirling-state.json, inbox/stirling.json, and alerts/pending/* in that bucket. It also needs
s3:ListBucket scoped to the state and kill-switch keys to detect missing objects.

Limits: at least 48 hours between attempts, 72 hours after a challenge, 5 seconds
between requests, 60 total requests, at most 45 search pages and 15 detail pages.
Known details are reused. The shared history's block date and prior collection date
are honored. An atomic S3 conditional write reserves an attempt before any requests;
a crash retains cooldown. Each request and final status are logged. Missing history
or listing cache fails closed. Results are always marked truncated to avoid declaring
unseen listings removed after a capped scan.

## Actions handoff

The daily GitHub workflow still scrapes the other agencies, but always excludes
Stirling locally. It checks the worker state, invokes the Lambda only when due,
downloads its inbox alongside Homeflow and imports
each agency only when the result is newer than its last recorded history run.
The original collection date is preserved in listings and history; missing or
stale inbox data never causes a Stirling request from GitHub. A failed or blocked
Lambda attempt writes a watcher-compatible alert to `alerts/pending/`, which the
host watcher forwards to Claude and Telegram. Actions also imports the worker
state into shared history, preserving the seven-day grace for blocked listings.
A Lambda timeout cannot write an alert itself, but the workflow's invocation
check and existing stale-agency alert catch missed data.
The worker never overwrites shared history.

## Build verification

ARM64 image built locally and handler import passed inside the Lambda Python 3.12
container. The Lambda-compatible image is published to
`854656252703.dkr.ecr.eu-west-1.amazonaws.com/houseswipe-stirling-worker`.
The worker image is pinned by digest in CDK. The
state object lives under `inbox/`, which the frontend deployment excludes from
pruning, so the worker's cooldown survives site deployments.

## CDK deployment

The canonical infrastructure is now `infra/lib/stirling-stack.ts`, registered as
`HouseSwipeStirlingWorker` in `infra/bin/infra.ts`, fixed to eu-west-1.
The stack pins the tested ECR digest; change `-c stirlingImageDigest=sha256:...`
when publishing a new build. The existing Actions schedule is the trigger;
no EventBridge rule or extra regional scheduler is needed.

The EC2 role now has inline policy `HouseSwipeStirlingDeployment`; its source is
`deployer-policy.json` alongside this file. PassRole is limited to the worker role
and Lambda. This policy is attached live; the ClaudeServer provisioning repository
has not yet been updated to reattach it automatically on replacement.

From infra/: `TS_NODE_TRANSPILE_ONLY=true npx cdk deploy HouseSwipeStirlingWorker
--method direct --require-approval never` with CDK_DEFAULT_ACCOUNT=854656252703
and CDK_DEFAULT_REGION=eu-west-1.

Deployed 2026-10-19. A manual invocation completed with 59 requests and saved
391 rows to `inbox/stirling.json`; no bot challenge was observed. The next
invocation returned `cooldown` without making a site request. The next allowed
attempt is 2026-10-21 00:12 UTC.
