"""Is this photo of a room, of the outside, or not of the property at all?

The swipe deck learns taste from interiors, but agency galleries also hold the odd view
from the balcony (the London Eye, a skyline), a floor plan, an EPC chart, a map or a logo —
and suggestions flagged exactly that. CLIP can tell these apart without any training: score
each photo's vector against text prompts per class ("a photo of a kitchen", "a floor plan
drawing", "the London Eye", ...) and take a softmax. It reuses the vectors we already store,
so no photo is downloaded again, and the prompt vectors are committed
(scraper/data/photo_class_prompts.json) so CI doesn't need the text model.

Validated by eye on contact sheets of 28k real photos: ~81% interior, ~18% exterior/garden,
~0.8% "junk", and the junk bucket was almost purely skylines/landmarks/EPC/floor plans/maps/
logos. The least-certain "interiors" were mostly shop fronts and building facades, hence the
stricter bar for the deck than for the ranking.

Regenerate the prompts file with `python -m scraper.photo_classes` (needs fastembed).
"""
from __future__ import annotations

import json
import pathlib

import numpy as np

PROMPTS_PATH = pathlib.Path(__file__).parent / "data" / "photo_class_prompts.json"
CLASSES = ("interior", "exterior", "junk")
LOGIT_SCALE = 100.0   # CLIP's learned temperature
INTERIOR_MIN = 0.8    # the swipe deck only shows photos at least this clearly a room
JUNK_MIN = 0.5        # above this a photo is left out of the ranking altogether

_cache: tuple[np.ndarray, np.ndarray] | None = None


def _prompt_matrix() -> tuple[np.ndarray, np.ndarray]:
    global _cache
    if _cache is None:
        data = json.loads(PROMPTS_PATH.read_text())
        vectors = np.asarray([p["vector"] for p in data["prompts"]], dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        _cache = (vectors, np.asarray([CLASSES.index(p["class"]) for p in data["prompts"]]))
    return _cache


def probabilities(vectors: np.ndarray) -> np.ndarray:
    """(N, 512) photo embeddings -> (N, 3) probabilities over (interior, exterior, junk)."""
    prompts, owner = _prompt_matrix()
    v = np.asarray(vectors, dtype=np.float32)
    v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
    sims = v @ prompts.T
    per_class = np.stack([sims[:, owner == c].max(axis=1) for c in range(len(CLASSES))], axis=1)
    z = LOGIT_SCALE * per_class
    z -= z.max(axis=1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(axis=1, keepdims=True)


def is_junk(p: np.ndarray) -> np.ndarray:
    return p[:, 2] >= JUNK_MIN


# --- Outdoor spaces seen in photos: garden / terrace / balcony ------------------------------------------------------
#
# Listing text is silent about a garden or terrace for many homes (no description at all for ~27%), but the photos show
# it. Zero-shot, like the classes above: each photo is scored against prompts for garden / terrace / balcony and against
# the interior and exterior prompts as the alternatives, softmax over the five. A listing "has" a feature when its best
# photo clears the bar. The bars come from looking at contact sheets of homes whose text did NOT mention the feature:
# gardens at 0.6 were 20 of 20 real gardens; terraces at 0.6 were only about 60% right (facades, a car park, an interior)
# but 9 of 9 at 0.9; balconies at 0.7 were about half right (interiors with French doors), hence 0.9 for both.
OUTDOOR_PROMPTS_PATH = pathlib.Path(__file__).parent / "data" / "outdoor_prompts.json"
OUTDOOR_FEATURES = {"garden": 0.6, "terrace": 0.9, "balcony": 0.9}
_outdoor_cache: tuple[np.ndarray, np.ndarray] | None = None


def _outdoor_matrix() -> tuple[np.ndarray, np.ndarray]:
    """Prompt vectors and their class index over (garden, terrace, balcony, interior, exterior)."""
    global _outdoor_cache
    if _outdoor_cache is None:
        names = list(OUTDOOR_FEATURES) + ["interior", "exterior"]
        base = json.loads(PROMPTS_PATH.read_text())["prompts"]
        extra = json.loads(OUTDOOR_PROMPTS_PATH.read_text())["prompts"]
        rows = [(p["class"], p["vector"]) for p in extra] + [(p["class"], p["vector"]) for p in base if p["class"] in ("interior", "exterior")]
        vectors = np.asarray([v for _, v in rows], dtype=np.float32)
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        _outdoor_cache = (vectors, np.asarray([names.index(c) for c, _ in rows]))
    return _outdoor_cache


def outdoor_features(vectors: np.ndarray) -> list[str]:
    """(N, 512) embeddings of ONE listing's photos -> the outdoor features its photos show."""
    prompts, owner = _outdoor_matrix()
    v = np.asarray(vectors, dtype=np.float32)
    v = v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-9)
    sims = v @ prompts.T
    per_class = np.stack([sims[:, owner == c].max(axis=1) for c in range(5)], axis=1)
    z = LOGIT_SCALE * per_class
    z -= z.max(axis=1, keepdims=True)
    p = np.exp(z)
    p /= p.sum(axis=1, keepdims=True)
    return [name for i, (name, bar) in enumerate(OUTDOOR_FEATURES.items()) if p[:, i].max() >= bar]


def is_deck_worthy(p: np.ndarray) -> np.ndarray:
    return p[:, 0] >= INTERIOR_MIN


def main() -> None:  # pragma: no cover - needs the text model
    from fastembed import TextEmbedding

    sets = {
        "interior": ["a photo of a living room", "a photo of a bedroom", "a photo of a kitchen", "a photo of a bathroom",
                     "a photo of a dining room", "a photo of a hallway inside a home", "a photo of a home office",
                     "a photo of the inside of a flat", "a photo of a room with furniture", "a photo of a staircase inside a house"],
        "exterior": ["a photo of the outside of a house", "a photo of an apartment building from the street", "a photo of a garden",
                     "a photo of a balcony or terrace", "a photo of a front door", "a photo of a residential street"],
        "junk": ["a floor plan drawing", "a map", "a photo of a famous tourist landmark", "the London Eye", "a city skyline view",
                 "an aerial photo of a city", "a company logo", "a screenshot of text", "an energy performance certificate chart",
                 "a diagram or chart", "a stock photo of people", "a blank white image", "a photo of money", "a photo of a river or a bridge"],
    }
    model = TextEmbedding("Qdrant/clip-ViT-B-32-text")
    items = [(c, t) for c, ts in sets.items() for t in ts]
    vectors = np.stack(list(model.embed([t for _, t in items])))
    PROMPTS_PATH.parent.mkdir(exist_ok=True)
    PROMPTS_PATH.write_text(json.dumps({
        "model": "Qdrant/clip-ViT-B-32-text", "classes": list(CLASSES),
        "prompts": [{"class": c, "text": t, "vector": [round(float(x), 5) for x in v]} for (c, t), v in zip(items, vectors)],
    }, separators=(",", ":")))
    print(f"wrote {len(items)} prompt vectors to {PROMPTS_PATH}")


if __name__ == "__main__":
    main()
