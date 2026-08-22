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
   regression tests, now pulling 250 listings from 6 agencies across 4
   themes: innercityestates.com, tatesestates.co.uk (standard theme) +
   johndwood.co.uk, aspire.co.uk (panel theme) on Homeflow; properly.space +
   parkgate.co.uk on PropertyHive. Tates/Aspire were added specifically to
   fix a real gap: johndwood's ultra-prime pricing (£14k-65k pcm) meant
   central/west London had effectively no affordable inventory in the
   dataset — tatesestates alone brought that down to ~£2,000 pcm in W14.
   Reapit Foundations and Alto were both checked and ruled out: both are
   backend CRMs that many different website vendors plug into, not a single
   shared public-facing template the way Homeflow/PropertyHive are — no one
   selector set could cover "Alto-integrated sites" the way it does for
   Homeflow/PropertyHive's own hosted templates. Next: Vebra or Dezrez, the
   same fixture-first-verify way — check whether they're actually a shared
   website platform before investing parser time, not just a CRM brand name.
3. **Image feature extraction — not started.** Room-type classification +
   cheap object-detection proxy for "big windows"/"large sink"-type
   attributes, reserving a VLM pass for a pre-filtered shortlist rather than
   every photo of every listing (cost). Explicitly *not* a prerequisite for
   Phase 4 — CLIP embeds raw photos directly, no upstream feature-extraction
   step needed (a real question that came up: it seemed like it should make
   CLIP "easier", but they're independent techniques for different
   problems — structured facts vs. learned subjective style).
4. **Style swipe & preference learning — done, first pass.** CLIP-embeds
   (via `fastembed`'s ONNX export of OpenAI's ViT-B/32 — ONNX chosen over
   PyTorch specifically for this host's tight disk/memory) every listing's
   photos + description into one shared 512-dim space. Swipe UI + preference
   vector (centroid of liked minus disliked) + match-ranked browsing all
   built and working end to end against the real 250-listing/3,004-photo
   dataset, fully client-side (no backend, swipes persist in `localStorage`
   only) — and can now be rated directly from the Browse grid too, not just
   the dedicated swipe deck. See `README.md`'s "Style matching" section for
   the mechanic and what's been verified vs. not. Not yet validated against
   a real person's actual taste — only that the embedding space itself
   discriminates between interiors, and that discrimination margin narrowed
   noticeably as the dataset first grew more style-diverse, then held
   roughly steady on the next growth pass (worth understanding before
   leaning on match scores much more).
5. **Filter/search — in progress, first pass done.** Client-side filters on
   the Browse tab: agency, postcode area (multi-select, derived from the
   address string via `frontend/src/lib/location.ts`, pickable either from a
   plain dropdown or a Leaflet map of area centroids —
   `scraper/geocode_areas.py` + `NeighbourhoodMap.tsx`), price range,
   minimum bedrooms/bathrooms. Still to combine with Phase 3's derived
   visual attributes once those exist.
6. **Recommendations & notifications** — combine filter results + style
   ranking, notify on new matches.
7. **Joint/shared matching — deferred, not started.** Two people
   house-hunting together each swipe their own style and set their own hard
   filters, and the app surfaces what satisfies *both* — combined
   preference vector, intersected filters (e.g. the higher of two
   minimum-bedroom asks, the overlap of two price ranges). The real design
   fork: this is the first feature that can't stay pure
   localStorage-on-one-device, because "two people" almost always means
   two separate phones. Options, cheapest first: (a) both people swipe on
   the *same* device in turn, under two local profiles, combined
   client-side — no backend, but awkward in practice; (b) one person
   generates a shareable link encoding their preference vector + filters
   (base64 in the URL), the other opens it on their own device and the app
   combines it with their own local state — still no backend, but the
   vector is ~512 floats and doesn't compress small, so the link would be
   long/ugly; (c) a minimal shared-state backend (even just a small
   DynamoDB table behind an API Gateway/Lambda) that both devices read
   from — the most natural UX, but the project's first real backend,
   which is the same fork Phase 8 below (agency outreach) already flags as
   a bigger decision than it looks. Worth deciding (b) vs (c) once this is
   actually prioritized rather than guessing now.
8. **Agency outreach automation — deferred, not started.** A "reach out"
   button that has an agent email the agency and follow up to schedule a
   viewing, gated as a premium feature. Deliberately not building this yet
   — it's a different tier of feature from everything else here: the first
   one that needs a real backend, the first that takes a real-world action
   on a third party (an actual email to an actual agency, potentially
   repeated follow-ups), and "premium" implies accounts + payments, a
   genuine architecture shift from the current no-backend/single-user/
   localStorage design. Open questions to resolve before building any of
   it: (a) personal tool vs. actual paid multi-user product — very
   different builds, and PLAN.md's "personal tool vs. eventually-multi-user"
   question below is now blocking, not academic; (b) how autonomous should
   "follows up" be — one inquiry email vs. an agent that reads replies and
   negotiates viewing times, the latter being a much bigger, more
   failure-prone system; (c) tone/disclosure, so this doesn't read as spam
   or misrepresent the user to an agency they might actually want to rent
   from.

## Infra

- `frontend/` (Vite/React) + `infra/` (CDK: S3 + CloudFront) — done, deployed
  to Giulio's personal AWS account. Live at
  https://d1kri12g86gqhh.cloudfront.net.
- **AWS vs. moving to something free like Vercel — decided: stay on AWS.**
  Current spend is already near-zero at this traffic (S3 + CloudFront for a
  few MB of data, plus a few cents per one-off temp-EC2 scrape/embed job —
  see `infra/README.md`'s "one-off heavy jobs" section), so migrating
  wouldn't meaningfully save money. It would also throw away a working,
  tested CDK stack (including a custom-domain setup in progress) for real
  migration effort and cutover risk. The actual appeal of Vercel here isn't
  "free," it's "git push and it's live" — but that ergonomic is available
  on the *current* AWS setup too, via a GitHub Action that runs the
  existing `cdk deploy` on push, no migration needed (see below). Vercel
  would only be a clear win if the goal were "stop touching CDK/
  CloudFormation entirely," and even then its serverless functions aren't
  suited to the scraping/embedding pipeline (execution-time limits far
  below the multi-minute Playwright + fastembed jobs this needs) — that
  compute would have to live somewhere else regardless (GitHub Actions
  runners are the natural fit, see below), so a Vercel migration would only
  ever cover the static frontend, not the actual automation this section is
  about. Worth re-opening if the project ever needs paid/commercial hosting
  (Vercel's free Hobby tier is personal-use-only per its own ToS, which
  would matter if Phase 8's "premium" agency-outreach feature ever ships).
- **Scraping/embedding automation — wanted now, not built yet.** Today this
  is entirely manual: spin up a temp EC2 instance by hand, run
  `scraper.export` then `scraper.embeddings`, download the result, rebuild,
  `cdk deploy` (see `infra/README.md`). Plan: a scheduled GitHub Actions
  workflow (daily cron) that does all of this — checks out the repo,
  installs Python + Playwright + fastembed, runs the export/embed pipeline
  directly on the GH-hosted runner (2 vCPU/7GB is comfortable for both;
  jobs so far have taken well under an hour combined, nowhere near the
  6-hour per-job limit), commits/uploads the refreshed data to S3, then
  runs `cdk deploy`. This also incidentally solves the recurring problem
  this session hit repeatedly — long-running background jobs on the
  interactive dev host getting killed by session restarts — since GitHub
  Actions runners are ephemeral by design and don't depend on this host's
  session lifecycle at all. Same workflow (or a second one) can also do
  deploy-on-push for pure code changes, which is the "not done yet, not
  urgent" GitHub Action this section used to just be a placeholder for —
  folded in here since it's the same piece of infra either way.

## Open questions (unresolved, revisit later)

- Does the style-matching actually feel right against a real person's taste,
  not just "the embedding space discriminates between interiors" (verified,
  though a shrinking margin as the dataset diversifies is now a real open
  question too — see README's "Known gaps") vs. "this surfaces flats I'd
  actually like" (not yet tried by a human).
- Swipe-deck diversity — currently only the 6 existing agencies' actual
  photos; may need a curated non-listing seed set if that turns out too
  narrow/repetitive once someone actually swipes through it.
- Geographic/volume scope beyond the current 6-agency demo dataset.
- Budget appetite for VLM calls per listing (main recurring cost driver for
  Phase 3).
- Personal tool vs. eventually-multi-user — affects how seriously the
  scraping legal question needs revisiting.
