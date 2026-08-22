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
7. **Agency outreach automation — deferred, not started.** A "reach out"
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
- **Not done yet, not urgent:** a deploy GitHub Action (push to `main` →
  rebuild → `cdk deploy`). Currently deploys are manual
  (`infra/README.md`). Worth doing once the frontend has enough real
  features that redeploying by hand gets annoying — premature right now.

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
