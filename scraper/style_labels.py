"""Embed a fixed vocabulary of interior-style descriptor phrases with the
same CLIP text model used elsewhere (scraper/embeddings.py) — lets the
frontend say what a user's swipe-derived preference vector actually *means*
in words, not just use it as an opaque ranking signal.

This works because CLIP's image and text embeddings share one space by
construction: "what did they like" (a centroid of liked-minus-disliked photo
embeddings) and "a cosy interior with warm lighting" (a text embedding) are
directly comparable via cosine similarity, with no separate classifier or
training step. Same trick scraper/embeddings.py already uses to compare a
listing's description against its own photos.

A fixed, small, hand-curated vocabulary (not derived from the listings
themselves) so it stays stable as the dataset grows — the whole point is a
human-readable label, not a ranking, so it doesn't need to be exhaustive or
adaptive.

Usage:
    python -m scraper.style_labels --out frontend/public/data/style-labels.json
"""
from __future__ import annotations

import argparse
import json
import pathlib

from fastembed import TextEmbedding

TEXT_MODEL = "Qdrant/clip-ViT-B-32-text"

# (short display label, full phrase embedded for CLIP quality) — CLIP was
# trained on photo-caption-style text, so "a cosy interior with warm
# colours" embeds more usefully than the bare word "cosy", but a full
# sentence is too verbose to show 3 of at once in the UI. Embed the
# sentence, display the label.
STYLE_PHRASES: tuple[tuple[str, str], ...] = (
    # light & mood
    ("Bright & light-filled", "a bright, light-filled interior with large windows"),
    ("Dark & moody", "a dark, moody interior with warm lighting"),
    # design style
    ("Minimalist", "a minimalist interior with clean lines and few furnishings"),
    ("Cosy", "a cosy interior with soft furnishings and warm colours"),
    ("Period features", "an interior with period features, cornicing and high ceilings"),
    ("Modern", "a modern, newly renovated interior"),
    ("Industrial", "an industrial-style interior with exposed brick and steel"),
    ("Scandinavian", "a Scandinavian-style interior with light wood and neutral tones"),
    ("Luxurious", "a luxurious, high-end interior with premium finishes"),
    ("Traditional", "a traditional, classically furnished interior"),
    # space
    ("Compact", "a compact, space-efficient interior"),
    ("Spacious & open-plan", "a spacious, open-plan interior"),
    # materials & colour
    ("Wooden flooring", "an interior with wooden flooring"),
    ("Colourful & eclectic", "a colourful, eclectic interior with bold patterns"),
    ("Monochrome", "a monochrome interior in black, white and grey"),
    # features
    ("Fireplace", "an interior with a fireplace"),
    ("Private garden", "an interior with a private garden"),
    ("Balcony or terrace", "an interior with a balcony or terrace"),
    ("River or water view", "an interior overlooking a river or water"),
    # building type
    ("Period conversion", "a period conversion flat"),
    ("New-build", "a new-build apartment interior"),
    # rooms
    ("Modern kitchen", "a kitchen with modern appliances"),
    ("Bathtub", "a bathroom with a bathtub"),
    ("Built-in wardrobes", "a bedroom with built-in wardrobes"),
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=pathlib.Path, required=True)
    args = parser.parse_args()

    print("loading CLIP text model...")
    txt_model = TextEmbedding(TEXT_MODEL)

    labels = [label for label, _ in STYLE_PHRASES]
    phrases = [phrase for _, phrase in STYLE_PHRASES]

    print(f"embedding {len(phrases)} style phrases...")
    embeddings = list(txt_model.embed(phrases))

    result = [
        {"label": label, "embedding": [round(float(x), 5) for x in emb]}
        for label, emb in zip(labels, embeddings)
    ]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"wrote {len(result)} style label embeddings to {args.out}")


if __name__ == "__main__":
    main()
