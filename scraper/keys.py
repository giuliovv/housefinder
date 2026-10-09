"""Listing identity: `platform:source_id`, with the agency baked into source_id on
platforms whose ids are only unique *within one agency's site*.

Before this, two agencies on the same platform sharing an id ("380", or a slug like
"high-road-london-n17") silently overwrote each other in the dataset, the history
and the embeddings (6 such collisions were found among ~1,600 Expert Agent /
Estate-Track ids). Platforms whose ids are already globally unique (Homeflow's
numeric ids, Acquaint's agency-coded `ashd728`, EstatesIT's `PC_LYONS_000216`)
are left alone so their keys don't change.

Existing stored data is migrated in place on load (idempotent), and embeddings are
re-keyed by alias — only reused when their photos belong to the listing, since a
legacy key that two listings fought over can't say whose photos it holds.
"""
from __future__ import annotations

NAMESPACED_PLATFORMS = frozenset({"propertyhive", "expertagent", "estatetrack", "starberry"})


def namespaced_source_id(platform: str, agency: str, source_id: str) -> str:
    if platform in NAMESPACED_PLATFORMS and not source_id.startswith(f"{agency}:"):
        return f"{agency}:{source_id}"
    return source_id


def key_for(platform: str, agency: str, source_id: str) -> str:
    return f"{platform}:{namespaced_source_id(platform, agency, source_id)}"


def listing_key(row: dict) -> str:
    s = row["summary"]
    return f"{s['platform']}:{s['source_id']}"


def legacy_key(row: dict) -> str:
    """The key this row had before namespacing (what old embeddings are stored under)."""
    s = row["summary"]
    sid = s["source_id"]
    prefix = f"{s.get('agency')}:"
    if s["platform"] in NAMESPACED_PLATFORMS and sid.startswith(prefix):
        sid = sid[len(prefix):]
    return f"{s['platform']}:{sid}"


def migrate_rows(rows: list[dict]) -> int:
    """Namespace stored rows' source_ids in place; returns how many changed."""
    changed = 0
    for row in rows:
        s = row["summary"]
        if not s.get("agency"):
            continue  # can't namespace a row that doesn't say whose it is
        new = namespaced_source_id(s["platform"], s["agency"], s["source_id"])
        if new != s["source_id"]:
            s["source_id"] = new
            changed += 1
    return changed


def alias_map(rows: list[dict]) -> dict[str, str]:
    """legacy key -> current key, for rows whose key changed."""
    return {legacy_key(r): listing_key(r) for r in rows if legacy_key(r) != listing_key(r)}


def migrate_history(history: dict) -> int:
    """Re-key a history file's listing records the same way (needs each record's agency/platform)."""
    moved = 0
    for key in list(history["listings"]):
        rec = history["listings"][key]
        platform, agency = rec.get("platform"), rec.get("agency")
        if not platform or not agency:
            continue
        raw = key.split(":", 1)[1]
        new = f"{platform}:{namespaced_source_id(platform, agency, raw)}"
        if new != key:
            if new not in history["listings"]:
                history["listings"][new] = history["listings"][key]
            del history["listings"][key]
            moved += 1
    return moved


def embedding_belongs_to(row: dict, entry: dict) -> bool:
    """A store entry may be reused for a row only if every photo in it is one of the row's."""
    own = set(row.get("photo_urls", []))
    urls = [p["url"] for p in entry.get("photos", [])]
    return bool(urls) and all(u in own for u in urls)
