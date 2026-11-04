# Known gaps and limitations

This section was written in August 2026 when the project had two platforms and six agencies; it is kept for the reasoning. The live state (76 agencies, many platforms) is in [`PLAN.md`](../PLAN.md). Back to the [docs index](README.md).

## Gaps as of August 2026

- Only 2 platforms so far (Homeflow, PropertyHive), from 6 real example
  agencies (4 Homeflow across 2 themes, 2 PropertyHive across 2 themes).
  Real coverage across "most London agencies" requires validating more
  platforms (Alto/Vebra/Dezrez — Reapit ruled out, see above) against real
  sites, not assuming the docs match reality — that's exactly the gap that
  bit the price/status field the first time through here (see git history:
  the "Let" status text turned out to be nested *inside* the price element,
  not a separate field, and the free-text description turned out to live in
  a different container than the one that looked right at first glance).
- `price_pcm` is best-effort text parsing, not authoritative — don't trust
  it for anything more precise than sorting/filtering.
- Homeflow's `/page-N` pagination pattern, originally reverse-engineered
  from one site, held up on three more, structurally-varied Homeflow-powered
  agencies (johndwood.co.uk, tatesestates.co.uk, aspire.co.uk) — good
  confidence it's a real platform convention rather than one site's
  coincidence, though still only confirmed against 4 of 600+ Homeflow-powered
  agencies.
- The swipe deck's photos come entirely from the 250 listings being ranked
  — there's no separate curated seed set (e.g. Unsplash/Pinterest
  interiors), so the deck is only as visually diverse as these 4 agencies'
  actual inventory happens to be. Worth revisiting if matches feel
  repetitive.
- Match score is a raw cosine similarity shown as a percentage — it's a
  *relative* ranking signal, not a calibrated confidence (0.31 isn't "31%
  sure", it's "higher than 0.30"). Hasn't been validated against a real
  person's actual taste yet, only checked that the embedding space itself
  discriminates between interiors (see above) — and that discrimination
  margin narrowed noticeably (from ~0.25 to ~0.05-0.07) once the dataset
  grew to include John D Wood's very different (much higher-end, more
  professionally staged) photography style alongside the other three
  agencies. Not investigated further — could mean match scores are now
  meaningfully less confident/reliable than when this was first checked, or
  could just be an artifact of averaging cosine similarity across a more
  stylistically varied set of "different listings." Worth a real look before
  trusting match scores much, especially with more agencies added later.
