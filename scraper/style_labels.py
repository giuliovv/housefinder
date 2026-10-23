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
    # light & mood (more)
    ("Airy & sunlit", "an airy, sunlit interior with sunshine streaming through the windows"),
    ("Warm & golden", "a warm interior with golden light and earthy tones"),
    ("Calm neutrals", "a calm interior in soft neutral tones, beige and cream"),
    ("Serene & pale", "a serene, pale interior with white walls and soft light"),
    ("Dramatic", "a dramatic interior with deep colours and strong contrast"),
    ("Pastel", "an interior decorated in soft pastel colours"),
    ("Bold colour", "an interior with bold, saturated colour on the walls"),
    ("Dark green & navy", "an interior with dark green or navy blue painted walls"),
    # era & architecture
    ("Georgian", "a Georgian townhouse interior with sash windows and panelled walls"),
    ("Victorian", "a Victorian interior with high ceilings, bay windows and original features"),
    ("Edwardian", "an Edwardian interior with large windows and period detailing"),
    ("1930s house", "an interwar 1930s house interior"),
    ("Mid-century modern", "a mid-century modern interior with retro furniture"),
    ("Brutalist & concrete", "a brutalist interior with raw concrete walls"),
    ("Warehouse loft", "a converted warehouse loft with high ceilings and large industrial windows"),
    ("Mews house", "a London mews house interior"),
    ("Penthouse", "a penthouse apartment interior with floor-to-ceiling glazing"),
    ("Tower-block flat", "a high-rise apartment interior with a city skyline view"),
    # materials & textures
    ("Exposed brick", "an interior with an exposed brick wall"),
    ("Herringbone parquet", "an interior with herringbone parquet flooring"),
    ("Polished concrete", "an interior with polished concrete floors"),
    ("Glass & steel", "an interior with steel-framed glass partitions"),
    ("Natural wood", "an interior with warm natural wood furniture and joinery"),
    ("Carpeted", "an interior with fitted beige carpet"),
    ("Exposed beams", "an interior with exposed timber beams"),
    ("Textured plaster", "an interior with textured limewash or plaster walls"),
    # decor styles
    ("Japandi", "a Japandi interior mixing Japanese and Scandinavian minimalism"),
    ("Boho", "a bohemian interior with plants, rattan and layered textiles"),
    ("Rustic", "a rustic interior with weathered wood and country charm"),
    ("Coastal", "a light coastal interior with whites and soft blues"),
    ("French apartment", "a Parisian-style apartment interior with mouldings and a chandelier"),
    ("Maximalist", "a maximalist interior packed with art, pattern and colour"),
    ("Hotel-like", "a hotel-style interior with crisp linen and designer lighting"),
    ("Designer-finished", "a designer-finished interior with statement lighting and curated art"),
    ("Show-home staged", "a staged show-home interior with styled cushions and accessories"),
    ("Lived-in", "a lived-in home with personal belongings and everyday clutter"),
    ("Bare & empty", "an empty unfurnished room with bare walls"),
    ("Retro & vintage", "an interior with vintage furniture and retro patterns"),
    ("Art-filled", "an interior with large framed art on the walls"),
    ("Plant-filled", "an interior with many houseplants"),
    ("Books & shelves", "an interior with full bookshelves"),
    # space & layout
    ("High ceilings", "an interior with very high ceilings"),
    ("Bay window", "a room with a large bay window"),
    ("Double-height", "a double-height living space with a mezzanine"),
    ("Galley kitchen", "a narrow galley kitchen"),
    ("Studio layout", "a studio flat with sleeping and living in one room"),
    ("Loft bedroom", "a bedroom in a loft with sloping ceilings"),
    ("Dual aspect", "a living room with windows on two sides"),
    ("Spacious bedroom", "a large, spacious double bedroom"),
    ("Home office nook", "a home office desk in the corner of a room"),
    # kitchens & bathrooms
    ("Shaker kitchen", "a kitchen with shaker-style cabinets"),
    ("Handleless kitchen", "a sleek handleless gloss kitchen"),
    ("Kitchen island", "a kitchen with a central island and bar stools"),
    ("Walk-in shower", "a bathroom with a walk-in shower"),
    ("Wet room", "a tiled wet room"),
    ("Freestanding bath", "a bathroom with a freestanding bath"),
    # outdoors & views
    ("Roof terrace", "a roof terrace with city views"),
    ("Garden flat", "a garden flat with patio doors opening onto a lawn"),
    ("Park view", "a window with a view of a park and trees"),
    ("Skyline view", "a window with a view of the London skyline"),
    ("Courtyard", "a quiet courtyard outside the window"),
    ("Juliet balcony", "a Juliet balcony with French doors"),
    ("Patio & decking", "a patio or decked outdoor seating area"),
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
