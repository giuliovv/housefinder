# House Swipe: designer handoff

## What it is

A mobile-first London rental search that learns *visual taste* from interior photos, then ranks real, currently available homes accordingly. It combines an emotional first step ("Would I like living here?") with hard constraints (budget, bedrooms, location). The product is a real listings browser, not a dating-style swipe demo. Users can browse immediately without training the model.

## Core journey

1. **Find your style.** A short intro explains the idea. Like/pass interior photos by dragging, tapping buttons, or using arrow keys. A progress count, taste-confidence meter, and plain-language style labels show that the system is learning. Users can hide an irrelevant/non-room photo, reset their taste, or move to Browse at any time.
2. **Answer practical questions, optionally.** Budget, bedrooms and preferred area can appear between photo cards. Skipping never blocks the journey; these answers become normal, editable Browse filters and never change which style photos appear.
3. **Browse homes.** Available listings are ranked by visual match after enough feedback; price sorting is also available. Each card has a swipeable photo gallery, monthly rent, address, room counts, agency, description, match signal, quick like/pass controls, and a link to the agency's original listing. Users can save a home without leaving the list.
4. **Narrow the search.** Filter by rent range, min/max bedrooms, minimum bathrooms, agency, and must-haves: garden, terrace, balcony, parking, lift, pets allowed, and price drop. Draw one or more areas directly on a map. Filters persist on the device. Clear all is available.
5. **Return and collaborate.** A "new since your last visit" chip isolates fresh homes and notes when they are strong style matches. Saved homes form a shortlist; a share link lets another person join with a first name, see who saved what, and contribute their own picks. A WhatsApp share action is provided. Personal swipes and taste are *not* shared.

## Details that matter in the design

- Some homes have a real price-drop badge and price-history chart; suspicious rent values carry a warning. Freshness/last-checked messaging and agency status are transparency cues, not decorative metadata.
- The app occasionally surfaces a predicted "It's a match" card and a celebration if the user likes it. This should be a restrained, useful moment, not a gamified interruption.
- Listings may have no photo, missing price, missing room counts, or a stale/off-market source. Browse hides listings known to be let or unverifiable. A saved shared-list item can remain visible as a snapshot even after it disappears from the current listings.
- Loading, empty, data-unavailable, filter-zero-results, and shared-list connection-error states all need coherent treatment. The style experience can fail independently while Browse still works.
- The match percentage is a **relative ranking signal**, not an absolute probability that the user will like the property. Avoid language that suggests certainty.
- Mobile use is primary, but desktop should use the space deliberately. Large photo sets, lengthy addresses, and many filter options need to remain manageable.
- The product currently uses anonymous on-device taste and filter state. Sharing exposes only a shortlist of home IDs and first names. Avoid account/signup affordances that do not exist.

## Routes and design exploration

- `/`: current public product.
- `/ui`: existing design experiments.
- `/ui/codex`: three new complete-app directions, each running the same actual features and listings.
- `/ui/codex/fieldnotes`: a tactile research journal, focused on deliberate decisions.
- `/ui/codex/blueprint`: a precise, map-and-data-led search instrument.
- `/ui/codex/salon`: a warm, photography-first interiors magazine.

These are exploratory visual systems, not three new product feature sets. A final design should pick a clear point of view while preserving the functional depth above.
