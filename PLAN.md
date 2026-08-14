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
   regression tests, now pulling 170 listings from 4 agencies across 4
   themes: innercityestates.com + johndwood.co.uk on Homeflow (two
   structurally different themes, not just different class names — see
   README), properly.space + parkgate.co.uk on PropertyHive. Reapit
   Foundations and Alto were both checked and ruled out: both are backend
   CRMs that many different website vendors plug into, not a single shared
   public-facing template the way Homeflow/PropertyHive are — no one
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
   built and working end to end against the real 170-listing/1,910-photo
   dataset, fully client-side (no backend, swipes persist in `localStorage`
   only) — and can now be rated directly from the Browse grid too, not just
   the dedicated swipe deck. See `README.md`'s "Style matching" section for
   the mechanic and what's been verified vs. not. Not yet validated against
   a real person's actual taste — only that the embedding space itself
   discriminates between interiors, and that discrimination margin has
   narrowed noticeably as the dataset grew more style-diverse (worth
   understanding before leaning on match scores much more).
5. **Filter/search — in progress, first pass done.** Client-side filters on
   the Browse tab: agency, postcode area (multi-select, derived from the
   address string via `frontend/src/lib/location.ts`, pickable either from a
   plain dropdown or a Leaflet map of area centroids —
   `scraper/geocode_areas.py` + `NeighbourhoodMap.tsx`), price range,
   minimum bedrooms/bathrooms. Still to combine with Phase 3's derived
   visual attributes once those exist.
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

- Does the style-matching actually feel right against a real person's taste,
  not just "the embedding space discriminates between interiors" (verified,
  though a shrinking margin as the dataset diversifies is now a real open
  question too — see README's "Known gaps") vs. "this surfaces flats I'd
  actually like" (not yet tried by a human).
- Swipe-deck diversity — currently only the 4 existing agencies' actual
  photos; may need a curated non-listing seed set if that turns out too
  narrow/repetitive once someone actually swipes through it.
- Geographic/volume scope beyond the current 4-agency demo dataset.
- Budget appetite for VLM calls per listing (main recurring cost driver for
  Phase 3).
- Personal tool vs. eventually-multi-user — affects how seriously the
  scraping legal question needs revisiting.
