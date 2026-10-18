# Stirling Ackroyd Ireland worker (prepared, not enabled)

Use Ireland as the sole default executor for this agency, not an automatic
retry after a GitHub challenge. Multiple executors would undermine cooldowns.
No IP rotation or CAPTCHA recovery is implemented.

Build from the repository root with `docker build -f infra/stirling-worker/Dockerfile .`.
Deploy the image as a Lambda in eu-west-1, Python image architecture matching the build,
512 MB, timeout 900 seconds, reserved concurrency 1, BUCKET=housefinder-frontend-854656252703.
Use default Lambda networking; no NAT gateway is needed. Keep schedules disabled initially.

Execution role needs CloudWatch logs and s3:GetObject on analytics/history.json,
killswitch.json, data/listings.json, workers/stirling/state.json; s3:PutObject on
workers/stirling/state.json and inbox/stirling.json in that bucket. No other write access.

Limits: at least 48 hours between attempts, 72 hours after a challenge, 5 seconds
between requests, 60 total requests, at most 45 search pages and 15 detail pages.
Known details are reused. The shared history's block date and prior collection date
are honored. An atomic S3 conditional write reserves an attempt before any requests;
a crash retains cooldown. Each request and final status are logged. Missing history
or listing cache fails closed. Results are always marked truncated to avoid declaring
unseen listings removed after a capped scan.

## Activation handoff

Before enabling: add an explicit exclusion for Stirling to the Actions scraper,
even when the inbox is missing/stale. Extend injection to accept Homeflow AND Stirling.
Import a result only once, preserving its actual collection date (the existing
refresh importer stamps today's date, so blindly reusing inbox data is wrong).
Merge worker block status into shared history so the seven-day stale-listing grace
still applies. Never overwrite the whole shared history from the worker.
Have Actions synchronously invoke the Ireland worker before fetching the inbox;
the durable reservation handles repeated workflow runs. Check Lambda FunctionError
and worker status, alert on blocked/failed, and preserve previously collected data.
Only activate after offline integration tests cover missing/stale inbox, cooldown,
concurrent invocation, and block propagation. No production workflow change yet.

## Build verification (2026-10-18)

ARM64 image built locally and handler import passed inside the Lambda Python 3.12
container. Image published to `854656252703.dkr.ecr.eu-west-1.amazonaws.com/houseswipe-stirling-worker:prepared`.
The worker image is pinned by digest in CDK and no schedule is created. The
state object was initialized conditionally in S3; existing cooldowns survive
future deployments.

Deployment attempt was denied at cloudformation:CreateStack for
HouseSwipeStirlingWorker. No deployed Lambda or live handler invocation yet.
The state object exists in S3, initialized empty; shared block history is unchanged.

## CDK deployment

The canonical infrastructure is now `infra/lib/stirling-stack.ts`, registered as
`HouseSwipeStirlingWorker` in `infra/bin/infra.ts`, fixed to eu-west-1.
The stack pins the tested ECR digest; change `-c stirlingImageDigest=sha256:...`
when publishing a new build. No schedule is created.

The EC2 role now has inline policy `HouseSwipeStirlingDeployment`; its source is
`deployer-policy.json` alongside this file. PassRole is limited to the worker role
and Lambda. This policy is attached live; the ClaudeServer provisioning repository
has not yet been updated to reattach it automatically on replacement.

From infra/: `TS_NODE_TRANSPILE_ONLY=true npx cdk synth HouseSwipeStirlingWorker`.
CDK bootstrap/deployment-role permissions are separate from these direct service
permissions and still need validation at deployment time.
