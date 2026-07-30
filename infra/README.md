# infra

CDK app: one S3 bucket (private, CloudFront-only via Origin Access Control)
+ one CloudFront distribution, serving `../frontend/dist`. `BucketDeployment`
handles the actual upload + cache invalidation as part of `cdk deploy` — no
separate `aws s3 sync` step needed.

Deployed to the **personal/default AWS account** on this host (854656252703),
not the ERP client account — this is Giulio's own project.

## Deploy

```bash
cd ../frontend && npm run build   # produces dist/, which the stack picks up
cd ../infra
npx cdk deploy
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
