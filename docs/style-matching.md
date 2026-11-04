# Style matching

How swipes become a taste, and how a taste ranks homes. Back to the [docs index](README.md).

## CLIP embeddings and the swipe preference

`scraper/embeddings.py` embeds every listing's photos (up to a 30-photo
safety ceiling, comfortably above the dataset's real max of 24 — an earlier
3-photo cap saved compute/JSON size but meant the Browse grid's per-card
like/dislike buttons vanished as soon as someone paged past photo 3 of a
typical 10+ photo gallery, so it wasn't actually a good tradeoff) plus
its description + key features, using `Qdrant/clip-ViT-B-32-vision` and
`Qdrant/clip-ViT-B-32-text` — ONNX exports of OpenAI's actual CLIP model via
`fastembed`, not a knockoff, chosen specifically over `open_clip`/
`transformers` + PyTorch because `onnxruntime` is a ~15MB wheel vs.
PyTorch's hundreds of MB, and this host is genuinely disk/memory
constrained. Image and text land in the *same* 512-dim space by
construction, so descriptions are directly comparable to photos — no
separate "feature extraction" step needed first (a real question that came
up while planning this: CLIP doesn't need upstream object detection/labels,
it embeds raw photos and raw text directly).

The actual mechanic (all client-side, `frontend/src/lib/`):

1. Flatten every listing's photos into one shuffled swipe deck
   (`preferences.ts`).
2. On each like/dislike — either from the dedicated swipe deck, or from the
   like/dislike buttons on a card's current photo in the Browse grid, both
   write to the same `swipes` state via `useStylePreferences` — recompute a
   preference vector = centroid(liked) − centroid(disliked) (`similarity.ts`
   — the standard simple baseline here, no training needed since CLIP
   already did the hard semantic work).
3. Score each listing by the *max* cosine similarity between the preference
   vector and its own photo embeddings — max, not average, so one mediocre
   bathroom photo doesn't tank an otherwise-great flat's score.
4. Browse view re-sorts by this score once a preference exists.

**Where ratings live:** entirely in the browser's `localStorage`
(`housefinder:style-swipes:v1`), keyed by `${listingKey}::${photoUrl}` →
`"like" | "dislike"`. No backend, no account, no server-side database —
ratings are per-browser/per-device only (clearing site data or switching
browsers loses them; there's no cross-device sync). Only photos that were
actually CLIP-embedded (every photo, up to the 30-per-listing ceiling above)
can be rated — the Browse card hides its like/dislike buttons on photos
beyond that, since rating an unembedded photo wouldn't do anything; in
practice this now covers every photo of every listing in the dataset.

Verified end to end against the real dataset: same listing's own photos
cluster tighter (~0.78-0.83 cosine, varies by sample) than different
listings (~0.74-0.76) — i.e. the embedding space still discriminates between
interiors, which is the property the whole mechanic depends on, though this
margin has narrowed a lot as the dataset grew (an earlier check against a
smaller, less style-diverse 101-listing/2-agency dataset found ~0.89 vs.
~0.64, a much wider gap — see "Known gaps" below). Re-checked again after
growing to 250 listings/6 agencies and the gap held roughly steady
(~0.03-0.08) rather than narrowing further, for whatever that's worth.

The current ranking method (centred Rocchio) is described in [`PLAN.md`](../PLAN.md), "Match scoring".
