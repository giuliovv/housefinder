# Plan

## Vision

Scrape London rental listings, analyze photos for physical attributes
(natural light, kitchen/bathroom size, etc.) that don't show up in standard
portal filters, and learn each user's interior-design style preference from
a swipe-style like/dislike interface — then surface listings that match both
the hard filters and the learned style.

## Data sourcing — decided

Rightmove/Zoopla/SpareRoom scraping was considered and set aside as the
primary source: Rightmove and Zoopla actively fight scrapers (anti-bot +
real legal precedent for scraping at scale), and SpareRoom's `robots.txt`
explicitly disallows most of the actual search mechanics. Instead: **target
the underlying lettings-website software platform** each agency's site runs
on (Homeflow, PropertyHive, and — UK lettings-software market being
consolidated around a handful of vendors — likely Reapit/Alto/Vebra next).
One parser per platform covers many agencies at once, with a much lower
legal/technical risk profile than the big portals. See `README.md` for the
current parser status.

## Phases

1. **Data source validation — done.** See above.
2. **Ingestion & normalization — in progress.** Two platform parsers
   (Homeflow, PropertyHive) verified against real live sites, with offline
   regression tests. Next: validate 1-2 more platforms against real agency
   sites (not just docs) the same way — Reapit Foundations first, since it
   has a documented API worth checking before writing another HTML scraper.
3. **Image feature extraction — not started.** Room-type classification +
   cheap object-detection proxy for "big windows"/"large sink"-type
   attributes, reserving a VLM pass for a pre-filtered shortlist rather than
   every photo of every listing (cost).
4. **Style swipe & preference learning — next up, pending confirmation.**
   CLIP-embed listing photos, swipe like/dislike on a seed set, learn a
   preference direction in embedding space from the swipes, rank listings by
   similarity to it. This is the actual product differentiator and the
   least certain-to-work-well part — validating it doesn't require Phase 3
   or a large Phase 2 crawl, so it's worth doing before investing further in
   either. (Matches the original recommendation: prove the risky, novel part
   cheaply before scaling ingestion.)
5. **Filter/search API** combining hard filters with Phase 3's derived
   attributes.
6. **Recommendations & notifications** — combine filter results + style
   ranking, notify on new matches.

## Infra

- `frontend/` (Vite/React) + `infra/` (CDK: S3 + CloudFront) — done, deployed
  to Giulio's personal AWS account. Live at
  https://d1kri12g86gqhh.cloudfront.net.
- **Not done yet, not urgent:** a deploy GitHub Action (push to `main` →
  rebuild → `cdk deploy`). Currently deploys are manual
  (`infra/README.md`). Worth doing once the frontend has enough real
  features that redeploying by hand gets annoying — premature right now.

## Open questions (unresolved, revisit later)

- Geographic/volume scope beyond the current 2-agency demo dataset.
- Budget appetite for VLM calls per listing (main recurring cost driver for
  Phase 3).
- Personal tool vs. eventually-multi-user — affects how seriously the
  scraping legal question needs revisiting.
