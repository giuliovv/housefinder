import json

import numpy as np

from scraper import export, export_embeddings as ee, keys


def row(platform, agency, sid, photos=("p1",)):
    return {"summary": {"platform": platform, "agency": agency, "source_id": sid, "url": f"https://{agency}/{sid}", "address": "x",
                        "price_text": "", "price_pcm": 1000, "status": None, "bedrooms": 1}, "photo_urls": list(photos), "description": ""}


def test_agency_is_part_of_the_key_only_where_ids_are_not_globally_unique():
    assert keys.key_for("expertagent", "hjc", "380") == "expertagent:hjc:380"
    assert keys.key_for("expertagent", "salesandlettingsltd", "380") == "expertagent:salesandlettingsltd:380"   # no longer collides
    assert keys.key_for("propertyhive", "sturges", "new-kings-road") == "propertyhive:sturges:new-kings-road"
    assert keys.key_for("homeflow", "aspire", "21991116") == "homeflow:21991116"                                 # globally unique: unchanged
    assert keys.key_for("acquaint", "ashdownmarks", "ashd728") == "acquaint:ashd728"
    assert keys.key_for("estatesit", "lyons", "PC_LYONS_000216") == "estatesit:PC_LYONS_000216"


def test_migration_is_idempotent_and_reversible_via_legacy_key():
    rows = [row("estatetrack", "squires", "north-crescent"), row("homeflow", "aspire", "1")]
    assert keys.migrate_rows(rows) == 1
    assert keys.listing_key(rows[0]) == "estatetrack:squires:north-crescent"
    assert keys.legacy_key(rows[0]) == "estatetrack:north-crescent"
    assert keys.migrate_rows(rows) == 0
    assert keys.alias_map(rows) == {"estatetrack:north-crescent": "estatetrack:squires:north-crescent"}


def test_history_records_are_rekeyed():
    h = {"listings": {"expertagent:380": {"platform": "expertagent", "agency": "hjc"}, "homeflow:5": {"platform": "homeflow", "agency": "a"}}}
    assert keys.migrate_history(h) == 1
    assert set(h["listings"]) == {"expertagent:hjc:380", "homeflow:5"}
    assert keys.migrate_history(h) == 0


def test_embedding_reuse_requires_the_photos_to_belong_to_the_listing():
    r = row("expertagent", "hjc", "hjc:380", photos=("a", "b"))
    assert keys.embedding_belongs_to(r, {"photos": [{"url": "a"}, {"url": "b"}]})
    assert not keys.embedding_belongs_to(r, {"photos": [{"url": "a"}, {"url": "OTHER"}]})   # legacy key two listings fought over
    assert not keys.embedding_belongs_to(r, {"photos": []})


def test_scrape_agency_keeps_two_agencies_with_the_same_raw_id_apart(monkeypatch):
    from scraper.agencies import AgencyConfig
    from scraper.models import ListingDetail, ListingSummary

    def fake_for(agency):
        class Fake:
            def search(self, *a, **k):
                return iter([ListingSummary(source_id="380", agency=agency, platform="expertagent", url=f"https://{agency}/380", address="Mile End, London",
                                            price_text="£1,000 pcm", price_pcm=1000.0, bedrooms=1, bathrooms=1, receptions=None, thumbnail_url=None)])

            def detail(self, ag, summary):
                assert summary.source_id == "380"                    # parsers still see the raw id
                return ListingDetail(summary=summary, description="")
        return Fake()

    out = {}
    for agency in ("hjc", "salesandlettingsltd"):
        monkeypatch.setattr(export, "build_scraper", lambda cfg, a=agency: fake_for(a))
        rows, _ = export.scrape_agency(AgencyConfig(key=agency, name=agency, platform="expertagent", search_url="x"), 5, 1, {})
        out[agency] = keys.listing_key(rows[0])
    assert out["hjc"] != out["salesandlettingsltd"]


def test_known_rows_stored_under_the_legacy_id_are_reused_not_refetched(monkeypatch):
    """After migration the stored row's key is namespaced, so the known-lookup must be too."""
    from scraper.agencies import AgencyConfig
    from scraper.models import ListingSummary

    class Fake:
        def search(self, *a, **k):
            return iter([ListingSummary(source_id="slug", agency="sturges", platform="propertyhive", url="https://x/slug", address="Parsons Green, London",
                                        price_text="£1,000 pcm", price_pcm=1000.0, bedrooms=1, bathrooms=1, receptions=None, thumbnail_url=None)])

        def detail(self, *a):
            raise AssertionError("must not refetch a known listing")

    monkeypatch.setattr(export, "build_scraper", lambda cfg: Fake())
    stored = row("propertyhive", "sturges", "sturges:slug")
    stored["attributes"] = {}
    rows, _ = export.scrape_agency(AgencyConfig(key="sturges", name="S", platform="propertyhive", search_url="x"), 5, 1, {"propertyhive:sturges:slug": stored})
    assert keys.listing_key(rows[0]) == "propertyhive:sturges:slug"


def test_export_reads_an_embedding_store_written_under_legacy_keys(tmp_path):
    def vec(i):
        return np.random.default_rng(i).normal(size=ee.DIM).astype(np.float32).tolist()

    store = {"estatetrack:slug-a": {"photos": [{"url": "a1", "embedding": vec(1)}]},
             "estatetrack:slug-b": {"photos": [{"url": "OTHER", "embedding": vec(2)}]}}      # not this listing's photo: ignored
    emb = tmp_path / "e.json"
    emb.write_text(json.dumps(store))
    listings = [row("estatetrack", "squires", "slug-a", photos=("a1",)), row("estatetrack", "squires", "slug-b", photos=("b1",))]
    stats = ee.build(emb, listings, tmp_path / "out")
    index = json.loads((tmp_path / "out/ranking-index.json").read_text())
    assert [(l["k"], l["u"]) for l in index["listings"]] == [("estatetrack:squires:slug-a", ["a1"])]
    assert stats["photos"] == 1
