# House Swipe

Swipe on photos of London rentals. House Swipe learns your taste in interiors (CLIP image embeddings, no training) and ranks real homes from 70+ letting
agencies by how well they match, with price drops, new listings and shared shortlists.

**Live:** https://houseswipe.uk

## How it works

1. A daily GitHub Actions pipeline scrapes agency sites (`scraper/`), embeds the listing photos, and publishes static data files to S3.
2. The site (`frontend/`, React + Vite) is static on S3 and CloudFront. Swipes and the taste profile stay in your browser; ranking runs there too.
3. Infrastructure is an AWS CDK app (`infra/`). Anonymous usage counters and shared shortlists use Firestore.

## Repository

| Folder | What |
|---|---|
| `scraper/` | Python parsers per agency platform, embeddings, the daily refresh |
| `frontend/` | The app, the design lab, the demo, the private stats page |
| `infra/` | CDK stacks, the board/stats API Lambda, the Stirling worker |
| `ops/` | Health watcher, kill switch, cost guard |
| `firebase/` | Firestore security rules |
| `docs/` | Documentation |
| `design/` | Designer brief and design template |
| `tests/` | Python tests (`pytest`) |

## Run it locally

```bash
pip install -r requirements.txt
aws s3 cp s3://housefinder-frontend-854656252703/data/ frontend/public/data/ --recursive   # the live data
cd frontend && npm install && npm run dev
```

Tests: `python -m pytest` and `cd frontend && npm test`.

## Docs

Start at [`docs/README.md`](docs/README.md): getting started, frontend, scraper, style matching, operations and more. [`PLAN.md`](PLAN.md) is the decision
log and roadmap.

## Principles

Photos are shown straight from the agencies' own sites and are never copied. The scraper identifies itself honestly, rates itself politely, and never
works around a bot challenge: a site that blocks automated access is left out.
