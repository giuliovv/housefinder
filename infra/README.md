# infra

CDK app: one S3 bucket (private, CloudFront-only via Origin Access Control)
+ one CloudFront distribution, serving `../frontend/dist`. `BucketDeployment`
handles the actual upload + cache invalidation as part of `cdk deploy` — no
separate `aws s3 sync` step needed.

Deployed to the **personal/default AWS account** on this host (854656252703),
not the ERP client account — this is Giulio's own project.

## Deploy

`frontend/public/data/*.json` isn't in git (see root `README.md`) — make
sure it's populated (pull from S3, or regenerate via the scraper pipeline)
before building, or you'll deploy a site with no listings.

```bash
cd ../frontend && npm run build   # produces dist/, which the stack picks up
cd ../infra
npx cdk deploy
```

### Custom domain

The CloudFront distribution can be attached to a custom subdomain with an ACM
certificate in `us-east-1`:

```bash
cd infra
NODE_OPTIONS="--max-old-space-size=700" TS_NODE_TRANSPILE_ONLY=true npx cdk deploy \
  -c domainName=houseswipe.giuliovaccari.it \
  -c certificateArn=arn:aws:acm:us-east-1:854656252703:certificate/42c20075-7a64-497f-9f83-27410e79beb2
```

When DNS is managed outside Route 53, add the DNS record manually:

```text
Type: CNAME
Name: houseswipe
Alias data: <CloudFrontDomain output>
```

### If `cdk synth`/`cdk deploy` hangs or thrashes

This host is memory-constrained; full `tsc` type-checking during CDK's
`ts-node` bootstrap has been observed to spike to 35%+ RSS and heavy swap
use. If a `synth`/`deploy` seems stuck (check `ps aux | grep ts-node` — CPU
time climbing with little else happening is the tell), kill it and rerun
with:

```bash
NODE_OPTIONS="--max-old-space-size=700" TS_NODE_TRANSPILE_ONLY=true npx cdk deploy --require-approval never
```

This skips type-checking during the CDK bootstrap step (the CLI still
synthesizes and deploys correctly) — same workaround as the ERP
infra project on this same host.

## Live

- CloudFront: see stack output `CloudFrontDomain` (`cdk deploy` prints it, or
  `aws cloudformation describe-stacks --stack-name HousefinderFrontend`)
- Bucket: `housefinder-frontend-854656252703`

## One-off heavy jobs (e.g. re-embedding all photos)

`scraper/embeddings.py` on the full dataset (1,051 photos as of 2026-08-07)
is too slow/fragile to run on this host's usual `t4g.micro`: not because the
job is too heavy for it, but because long-running background shells here
keep getting killed by session restarts before they finish. Fix used: spin
up a temporary, larger EC2 instance that self-terminates when the job ends
(success or failure), so nothing lingers or costs money if left unattended.

**Recipe** (ad hoc, not scripted — repeat by hand or turn into a script if
this becomes a regular thing):

1. Bundle just what the job needs (e.g. `scraper/` + `listings.json`) into a
   tarball, upload to a temp prefix in the existing frontend bucket
   (`s3://housefinder-frontend-854656252703/tmp-<job>/`) — reusing that
   bucket avoids provisioning a new one.
2. Launch an instance reusing the *existing* `ClaudeServer` IAM instance
   profile and security group (already has S3 read/write on that bucket, no
   new IAM role needed) with `--instance-initiated-shutdown-behavior
   terminate`.
3. User-data script: `trap '... upload log ...; shutdown -h now' EXIT` at
   the very top, before anything else — this is what makes the instance
   self-destruct on *any* exit path, not just success. Then install deps,
   run the job, upload the result + a log to the same S3 prefix, touch a
   `DONE` marker object.
4. Poll (`Monitor` tool, or a loop) for the `DONE` marker or the instance
   reaching `terminated` state (not `stopped` — confirms
   `instance-initiated-shutdown-behavior=terminate` actually worked and
   nothing is left running).
5. Download the result from S3, `aws s3 rm --recursive` the temp prefix,
   `aws ec2 describe-instances` once more to confirm `terminated` with
   reason `Client.InstanceInitiatedShutdown`.

**Sizing — check CloudWatch before assuming you need a bigger box.** The
first run of this used a `c7g.xlarge` (4 vCPU, 8GB) on the assumption that
more CPU would help. It didn't need to: `CPUUtilization` for that instance's
whole ~13-minute lifetime averaged 12-15%, peaking ~19% — well under 1 vCPU
of actual use. `NetworkIn` showed the first ~5 minutes dominated by a single
~484MB spike (the one-time CLIP model download, fixed cost regardless of
instance size), with the rest of the run at 20-50MB per 5-min window (photo
downloads, throttled by `IMAGE_DOWNLOAD_DELAY_SECONDS` in the script
itself). Conclusion: this job is I/O-bound and rate-limited by design, not
CPU-bound — a `t4g.small` or `t4g.medium` (2 vCPU, same Graviton family as
the always-on host) would finish in about the same wall-clock time for a
fraction of the cost (~$0.004 vs. ~$0.03 for a 13-minute run). Reach for
`c7g.xlarge`-class sizing only if a future job is actually compute-heavy
(e.g. embedding tens of thousands of photos where ONNX inference time, not
network/throttling, dominates) — check `CPUUtilization` after a first run
rather than assuming.

**AWS CLI reliability at fresh boot.** `pip install awscli` inside a venv
failed unreliably on a freshly-booted instance more than once (the trap
itself then can't upload a log, so the failure is silent — the instance
just terminates with nothing in S3). Fixed by installing via the official
curl+unzip installer (`https://awscli.amazonaws.com/awscli-exe-linux-<arch>.zip`)
instead, and — since even *that* needs `unzip`/`apt-get` to succeed first —
registering a bare `trap 'shutdown -h now' EXIT` as the very first line,
before any package installation, upgraded to the log-uploading version only
once `aws` is confirmed working. Belt-and-braces: guarantees self-termination
even if the very first apt step fails, not just failures after `aws` exists.

**Scraping specifically (not embedding/other jobs) may fail from a fresh
IP.** Two Homeflow-powered agencies (tatesestates.co.uk, aspire.co.uk) added
2026-08-22 consistently timed out when scraped from a newly-launched
temporary instance's IP — every attempt, across several relaunches, even
after doubling the page-load timeout — while always working fine when run
interactively from this project's regular long-lived host. The other four
agencies in `scraper/agencies.py` never showed this from the same temp
instances. No Cloudflare challenge or explicit block page was ever seen, so
this looks like IP-reputation throttling of unfamiliar cloud IPs rather
than an active block worth trying to route around (which wouldn't fit this
project's own "don't defeat active resistance" stance anyway) — the
practical fix was running just those two agencies' `scraper.export` call
from the regular host instead of a disposable one, then merging the
resulting JSON with whatever the temp instance produced for the rest.

No CloudWatch agent was installed, so RAM usage isn't directly observable
after the fact for these jobs — only CPU/network are captured by default.
Not investigated further since the same workload already ran fine in-process
on the 1GB `t4g.micro` earlier in this project.
