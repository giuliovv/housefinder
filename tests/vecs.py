"""Synthetic photo embeddings that the packaged classifier recognises: a tiny perturbation of
a class's own prompt vector (so tests don't depend on random vectors happening to look like rooms)."""
import json

import numpy as np

from scraper import photo_classes

_PROMPTS = json.loads(photo_classes.PROMPTS_PATH.read_text())["prompts"]


def _vec(cls: str, seed: int, text: str | None = None) -> np.ndarray:
    base = next(np.asarray(p["vector"], dtype=np.float32) for p in _PROMPTS if p["class"] == cls and (text is None or p["text"] == text))
    v = base + 0.01 * np.random.default_rng(seed).normal(size=base.shape).astype(np.float32)
    return v / np.linalg.norm(v)


def room(seed: int) -> list[float]:
    return _vec("interior", seed, "a photo of a kitchen").tolist()


def outside(seed: int) -> list[float]:
    return _vec("exterior", seed, "a photo of a garden").tolist()


def junk(seed: int) -> list[float]:
    return _vec("junk", seed, "a floor plan drawing").tolist()
