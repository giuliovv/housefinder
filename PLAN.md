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
   Homeflow/PropertyHive's own hosted templates. Vebra (now Alto) and Dezrez were checked on 2026-10-07 and
   ruled out for the same reason as Reapit/Alto: both are back-office CRMs
   whose "website" side is a data feed (an API import into whatever site the
   agency's web vendor built — their own docs describe WordPress feed
   plugins), not a shared public template, and their APIs need agent
   credentials. Agencies on them look different from each other, so there's
   no single parser to write. The useful observation: Stirling Ackroyd's
   photos come from Reapit's CDN but its *site* is Property Hive — the
   scrapable unit is the website platform, whatever CRM sits behind it.
   Added Stirling Ackroyd (Property Hive, own theme preset, truthful
   non-"bot" User-Agent because its server 403s scraper-looking ones;
   ~320 London listings). Discovery (2026-10-07, `scraper/discover.py`): OpenStreetMap lists 641
   London estate agents with websites; fingerprinting their homepages found
   49 on Property Hive, 25 Expert Agent, 10 Street, 8 Jupix, 5 Gnomen, 2
   Apex27, ~56 behind a Cloudflare challenge, 124 unreachable. Of the 49
   Property Hive sites, ~22 have a working lettings results page
   (`/?post_type=property&department=residential-lettings` is the stock
   Property Hive search URL and works on most): andrewlloyd.net, kayandco.com,
   spencermunson.co.uk, pompproperties.com, victormichael.com,
   bargets.co.uk, astonchase.com, oakhill.london, oaktreewestlondon.co.uk,
   veezedresidential.co.uk, njestates.co.uk, wdbproperty.co.uk,
   thomasjamesestateagents.co.uk, wilkinsonbyrne.com, lakinandco.com,
   sturgeslondon.co.uk, andrewreeves.co.uk, griffingroup.co.uk,
   fairfieldestates.co.uk, hiltons-estates.co.uk, aspenestateagents.co.uk,
   edward-barclay.co.uk. Several use Property Hive's stock markup
   (`li.type-property`, `.price`, `.rooms .room-bedrooms`), so one generic
   "default" theme may cover many. Built the generic `stock` theme and live-checked 21 of them (robots.txt
   allowed us on all). **Added (8):** Sturges, Thomas James, Wilkinson Byrne,
   Oak Hill, Oaktree West London, NJ Estates, Andrew Reeves, Spencer Munson
   — ~105 London listings in total (small independents; many already let).
   **Not added, and why:** pompproperties, bargets, astonchase (ultra-prime,
   £4k-40k *per week*); aspenestateagents, edward-barclay, griffingroup,
   fairfieldestates, lakinandco (Surrey/Essex/Herts/outer-London, not London
   by our filter); veezedresidential (placeholder/test data); kayandco,
   wdbproperty, andrewlloyd, hiltons-estates, victormichael (different markup
   — detail pages or cards don't parse with the stock theme; each would need
   its own preset). Where a card doesn't show beds/baths, `detail()` falls
   **Expert Agent (2026-10-08)** turned out to be a true shared website
   platform (Joomla "eapow" template, `/properties-to-let`,
   `/properties-to-let/property/<id>-slug`, offset paging via `?limitstart=N`):
   new `scraper/expertagent.py`, 17 agencies added (~240 London listings:
   Circa, W J Meade, Frost, Sales & Lettings, Messila, Houghton, White
   Estates, David Harris, Elegant, Park Heath, Mile Estates, Pollard Machin,
   Elite & Co, Brian Thomas, HJC, Amanda Roberts, May & Co). Skipped
   jamesneave.co.uk and grantallen.com (essentially no London stock); four
   more Expert Agent hits (squiresestates, collins-sarwar, griffingroup,
   homeviewestates) use a different template. London detection moved to
   `scraper/london.py` (district/borough names + postcodes), since these
   sites often write just "Mile End" or "Maida Vale". Street / Jupix hits
   from discovery were checked 2026-10-08 and **not built**: *Jupix* (ZPG
   "estateweb" sites: russellcollins, chissickestates, sintonandrews, ...) render
   results client-side via a Knockout/JS API, so they'd need Playwright and a
   bespoke parser for ~3-4 London-ish agencies; *Street* ("Spectre"/WordPress
   plugin sites: portland, payne, davies, birchills, bourne, ...) differ site
   by site, so no shared parser, and only ~1-2 are London (portland: Kensal Rise
   / Queen's Park). **Estate-Track (built 2026-10-08):** a Next.js template with
   schema.org JSON-LD on every detail page (`scraper/estatetrack.py`).
   16 agencies, ~900 London listings: Squires, Woodward, Charles Eden, Nathan
   K, Hot Black Desiato, EJPR, Compton Reeback, Parkes Estates, Edmund, GoView
   London, Glen Hall, Daniels, Collins Sarwar, Homeview, AJR Property, James
   Anderson. Rents under £300 pcm are dropped (parking spaces/garages are
   listed among lettings). Central coverage from this batch is thin (Parkes:
   Belgravia/Marylebone, Compton Reeback: St John's Wood/Maida Vale) — a
   separate hunt for Pimlico/Chelsea/City agencies is needed.
   **Starberry CMS (built 2026-10-08, found via the central-London hunt):**
   `scraper/starberry.py` — Dexters (~970 London lettings, median £5k pcm,
   Notting Hill/Kensington/Fulham/Hampstead/Westminster/Mayfair), Jonathan
   Arron (Kensington/Mayfair), Battersea & Nine Elms. Three card layouts
   across themes, weekly or monthly prices. Central hunt method: OSM
   coordinates (`discover.py` now records lat/lon) -> 193 agencies within
   Zone 1-2; 102 matched no platform, so third-party hosts on their pages were
   counted to find shared vendors: GNB Property (6: Kravens, Interlet,
   Griffins, Metropole, Michael Charles, FMJ), Acquaint CRM (3: Home
   Fullstop, Astberrys, Ashdown Marks), The Property Jungle (3: Faradays,
   Alexander Lewis, McKee), EstatesIT (3: Londonwide, City Rooms, Lyons) —
   all unchecked — **next up (agreed 2026-10-08):** check these four vendors
   (GNB Property, Acquaint CRM, The Property Jungle, EstatesIT) for a shared
   lettings template and build parsers fixture-first. Remaining central Property Hive agencies with unusual
   markup: Kay & Co, Pomp, Bargets, Aston Chase (all prime, weekly rents).
   Embedding is now 12 photos/listing for new listings, 4 parallel downloads.
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

   **Bot challenges and back-off (2026-10-08):** `http.get` raises `Blocked`
   on captcha/challenge responses; `refresh.py` records the agency in
   `history.json -> blocked` and skips it for 3 days, then tries once more
   (steady-state runs are ~45 search-page requests per big agency, details are
   fetched for new listings only). Stirling Ackroyd got a SiteGround captcha
   after ~600 requests in a day during testing; it stays in the list under this
   policy, with the permission email still the real fix.
9. **Market analytics — data collection started 2026-10-08.** Goal: learn
   how long different kinds of property stay on the market, how often rents
   are cut, and how supply moves, by area / bedrooms / agency. Collection
   can't be back-filled, so it comes first; analysis later. `scraper/history.py`
   keeps a permanent per-listing record in `s3://…/analytics/history.json`
   (separate from the pruned `listings.json`): first/last seen (flagged
   *exact* only if the agency had been scraped before, so a new agency's
   inventory doesn't fake "listed today"), every price and status change, the
   date the agency first showed it let/under offer, the date it vanished (two
   consecutive misses from a successfully scraped agency), relist count,
   area/beds/baths, plus a per-day count of what each agency returned (so
   agency outages show up as gaps, not as mass disappearances). *Gone is not
   let*: disappearance can be a withdrawal, so "let agreed" status dates are
   the better time-to-let signal where an agency shows them (most do not —
   many just delete the listing). Also collected now (`scraper/attributes.py`, per
   listing under `attrs` in the history): property type (flat/house/studio/
   room/maisonette/bungalow), furnished (furnished/unfurnished/part/optional),
   deposit, available-from date ("now" or ISO), floor area in sq ft (parsed
   from descriptions, either unit, sanity-bounded), EPC letter, council tax
   band, full postcode where the listing gives one (otherwise the outward
   code, e.g. SW1P, is always kept as `area` for weighting by district),
   amenity flags (garden/balcony/parking/lift/concierge), lat/lon where the
   site exposes them (Estate-Track), photo count. Every field is optional —
   missing means the site didn't say. Existing listings are re-fetched once to
   backfill these. Still to add if wanted: a derived "price reduced" flag
   (computable from price_history at analysis time, so no collection needed).
   Caveats to keep in mind when reading results: listing ages are only exact
   for listings first seen after their agency's first run; all Homeflow
   listings are frozen (blocked), so they carry no market signal; Dexters/
   Estate-Track/Expert Agent inventory skews central/west and prime.

   **Style data size (2026-10-08):** `embeddings.json` (all photos' full
   vectors) had grown to 154MB, which every visitor downloaded. It is now the
   *working store* only (`s3://…/work/embeddings.json`, never shipped), and
   `scraper/export_embeddings.py` builds the site files: `ranking.bin` (every
   photo of every browseable listing as int8 + scale, 9.7MB), `ranking-index.json`
   and `deck.json` (1,500-photo sample incl. let/unverified listings, for the
   swipe deck); first load ~12MB instead of ~155MB. Measured on simulated
   users before choosing: an averaged vector per listing keeps only ~15-20% of
   today's top 20; 5 representative vectors ~40-55%; PCA-reduced vectors or
   6-10 diverse photos per listing ~30-90% — all rejected. Full-dimension int8
   for every photo is essentially exact (rank correlation 0.9996; the page's
   match % differs from the unquantised calculation by <1 point, i.e. display
   rounding). Swipes now store their own vector in localStorage (v2), so a
   taste profile survives listings expiring; v1 swipes migrate when their photo
   is still in the data.

   **Dead photos (2026-10-09):** agencies delete a let listing's photos while our
   embeddings (and the swipe deck) live on; the CDN then serves an "Awaiting image"
   placeholder, often with a 404 status, which browsers draw happily (3.7% of the
   deck, mostly Homeflow's image servers). `scraper/photo_health.py` probes photo URLs
   (HEAD; alive = 200 + image type + not a stub), cached in
   `analytics/photo-health.json` (alive re-checked after 14 days, dead after 30); the
   exporter drops dead photos from `ranking.bin`/`deck.json` (the deck takes the next
   photo in line) and writes `dead-photos.json`, which listing cards filter on. The
   deck also skips any image that fails to load or arrives as a speck, and the
   embedding step refuses tiny, blank or known-placeholder images (md5 list in
   `embeddings.py`). First run probes ~4,500 photos (~5 min), later runs a rolling slice.

   **Listing identity and alerts (2026-10-09):** keys are now `platform:source_id`
   with the agency baked into `source_id` for platforms whose ids are only unique per
   site (Property Hive, Expert Agent, Estate-Track, Starberry) — 6 cross-agency id
   collisions had been silently overwriting listings. Stored listings, history and
   embeddings migrate on load (idempotent; embeddings re-keyed by alias and only reused
   if the photos belong to the listing), so nothing is re-downloaded; the collided
   listings reappear at the next real scrape. Failure alerts: see README "Alerts (ops)".

   **Non-property photos (2026-10-09):** feedback flagged the odd London Eye / skyline
   in the swipe deck. `scraper/photo_classes.py` classifies every stored photo vector
   zero-shot with CLIP text prompts (interior / exterior / junk: views, landmarks, EPC
   charts, floor plans, maps, logos) — no downloads, prompt vectors committed so CI needs
   no text model. Checked on contact sheets of 28k real photos (junk ~0.8%, near-pure).
   The deck shows only clear rooms (p_interior >= 0.8, ~79% of photos); junk is left out
   of the ranking (so it can't be rated or influence scores) but stays visible in listing
   cards — floor plans and views are useful to renters. A per-device "Not a room? Skip"
   link covers misses. Crowd-sourced "mark as not relevant" flags were deliberately not
   built: they need the project's first write backend plus abuse protection/accounts for
   a ~1% problem the classifier already handles; revisit when a backend exists for
   notifications/joint search. The deck order is shuffled per browser (random seed in
   localStorage; "start over" reseeds).

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
- **Scraping/embedding automation — built, with one known gap.**
  `.github/workflows/refresh-and-deploy.yml` runs daily (05:00 UTC), on manual
  dispatch, and on pushes touching `frontend/`, `infra/` or `scraper/` (a
  push only scrapes if its commit message contains `[refresh]`; otherwise it
  just redeploys with the current data). It authenticates to AWS with GitHub
  OIDC (role `housefinder-github-deploy`, defined in `infra/lib/ci-stack.ts`,
  main branch of this repo only — no stored keys), pulls the live data from
  S3, runs `scraper.refresh` -> incremental `scraper.embeddings` ->
  `geocode_areas`, builds, and `cdk deploy`s. `scraper/refresh.py` tracks
  `first_seen`/`last_seen`/`off_market` per listing: let/under-offer status or
  two consecutive misses marks it off-market (hidden in the UI, pruned after
  14 days); an agency whose search failed, or that exceeded the per-agency
  cap, never counts as a miss. Verified end to end on 2026-10-07 (deploy
  path, and a scrape run). **Known gap — Homeflow is now behind a Cloudflare challenge:** as of
2026-10-07 all four Homeflow agencies (innercityestates, johndwood,
tatesestates, aspire) answer plain requests with a Cloudflare "Just a
moment..." challenge (HTTP 403) — from GitHub runners *and* from the dev
host, where the same scrape worked weeks earlier. That's active bot
protection, which this project's stance is not to defeat, so those agencies
can no longer be refreshed. Their ~164 live listings are left untouched
(never wrongly expired by a failed scrape) but can't be verified as still
available; PropertyHive agencies refresh fine. `scraper.refresh` has
`--dump`/`--inject` (scrape on one host, merge on another) from an attempt to
route around IP-based throttling; it's not needed unless that returns. Open
decision: how long to keep unverifiable Homeflow listings visible, and
whether to replace them with agencies on other platforms.

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

## More agencies, round 3 (2026-10-09)

Re-scanned the 475 OSM candidates that matched no platform (homepage third-party hosts, generator tags) and counted vendors:
GNB Property 22 sites, Property Jungle (tpjfb/thepropertyjungle) ~19, EstatesIT 14, Acquaint 10, Starberry 11, Estate-Track 16 (all done).
**Added (14, ~190 more London listings):** Acquaint: John Wilcox (Holland Park/Kensington, prime), Amber & Co, Bryants, Austin Chambers,
Kings Accommodation, Albany Residential. EstatesIT: London Estates (Putney/Kensington/Fulham), Latymers (Hammersmith/Kensington), Gareth James,
Allan Howard, B Gibson (Highgate), Coultons, Kenton Homes (Orpington). Starberry "nurtur" 4th card layout: Robinson Jackson.
Property Hive stock: R L Morris. Fixes found on the way: `parse_price_pcm` now reads "£26,000 pcm (£6,000 pw)" as the monthly figure (it
converted the *weekly* one wrongly and flagged a genuine £26k Holland Park rent as implausible); Acquaint titles that contain "Price £..."
no longer leak into the address.
**Not added:** EstatesIT cityrooms (room lets), alexneil/jasonoliver (no results); 17 of the 19 further Property Hive hits (no stock lettings
markup); Starberry gibbs-gillespie / acorn-john-payne (Herts/Kent, differing card markup); Property Hive hits that are really sales-only.
**GNB Property re-check:** the earlier "skip" was premature: pages ARE server-rendered (prices appear as `&#163;` entities, cards
`.property_div > .fe_price`, detail `/property/<id>-slug`), but each site has its own template (`estate_template_*`), the lettings page only
shows ~10-17 featured cards and 17 of 22 sites have no `.fe_price` markup — so per-site presets for ~5 small outer-London independents. Not built.
**Scheduler:** GitHub dropped the 2026-10-09 05:23 UTC cron (the only scheduled run ever seen was 2026-10-08 11:40). Added fallback crons at
11:47 and 17:13 UTC behind a `check` job that exits if today's scrape is already recorded in analytics/history.json.

## Match scoring: centred Rocchio (2026-10)

Observation: scores read ~90% while only likes existed, then fell to ~20% once dislikes arrived ("stronger results with fewer swipes").
Cause: all CLIP photo vectors share a large common component; with likes-only the preference vector *is* that component.
Fix (literature: Rocchio feedback; mean-centring as in All-but-the-Top / CLIP mean-shift): subtract the catalogue's mean photo vector
before comparing and weight dislikes at 0.5 (`computeCenteredPreference`, `embeddingStore.scoreListings`).
Simulated users (real photos, style-label tastes, 10% mistaps), ranking AUC current -> centred+0.5: 5/0 swipes .68->.75, 8/4 .73->.76,
20/10 .79->.81, 40/40 .81->.82; top-10 raw score now 55-69% at any swipe count instead of 95% -> 26%.
Rejected: tier badges ("Strong match") — wrong confidence if the person disagrees; multi-centroid / nearest-neighbour scoring (bigger raw
scores, worse ranking); textbook gamma=0.15 without centring (worse ranking, all scores ~95%).
Untouched on purpose: `preferenceVector` (uncentred) still drives the style-words, `tasteRead` calibration.
