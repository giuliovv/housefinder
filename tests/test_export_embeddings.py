import base64
import json

import numpy as np

from scraper import export_embeddings as ee


def vec(seed):
    return np.random.default_rng(seed).normal(size=ee.DIM).astype(np.float32)


def listing(sid, **flags):
    return {"summary": {"platform": "p", "source_id": sid}, **flags}


def test_quantize_roundtrip_is_close_and_unit_norm():
    v = vec(1)
    q, s = ee.quantize(v)
    back = q.astype(np.float32) * s
    unit = v / np.linalg.norm(v)
    assert q.dtype == np.int8 and abs(q).max() == 127
    assert np.abs(back - unit).max() < 0.01
    assert abs(np.linalg.norm(back) - 1) < 0.02
    assert ee.quantize(np.zeros(ee.DIM))[1] == 0.0


def test_build_writes_consistent_files(tmp_path):
    store = {
        "p:1": {"photos": [{"url": "a1", "embedding": vec(1).tolist()}, {"url": "a2", "embedding": vec(2).tolist()}]},
        "p:2": {"photos": [{"url": "b1", "embedding": vec(3).tolist()}]},
        "p:3": {"photos": [{"url": "c1", "embedding": vec(4).tolist()}]},       # let: kept out of ranking, kept for the deck
        "p:gone": {"photos": [{"url": "g1", "embedding": vec(5).tolist()}]},    # no longer in listings.json: dropped everywhere
        "p:4": {"photos": []},
    }
    emb = tmp_path / "emb.json"
    emb.write_text(json.dumps(store))
    listings = [listing("1"), listing("2"), listing("3", off_market=True), listing("4")]

    stats = ee.build(emb, listings, tmp_path / "out")

    assert stats == {"listings": 2, "photos": 3, "deck": 4}
    index = json.loads((tmp_path / "out/ranking-index.json").read_text())
    assert index["count"] == 3
    assert [(l["k"], l["o"], l["u"]) for l in index["listings"]] == [("p:1", 0, ["a1", "a2"]), ("p:2", 2, ["b1"])]
    raw = (tmp_path / "out/ranking.bin").read_bytes()
    assert len(raw) == 3 * 4 + 3 * ee.DIM
    scales = np.frombuffer(raw[:12], dtype="<f4")
    q = np.frombuffer(raw[12:], dtype=np.int8).reshape(3, ee.DIM)
    unit = vec(2) / np.linalg.norm(vec(2))
    assert np.abs(q[1].astype(np.float32) * scales[1] - unit).max() < 0.01
    deck = json.loads((tmp_path / "out/deck.json").read_text())["photos"]
    assert {d["k"] for d in deck} == {"p:1", "p:2", "p:3"}
    assert "g1" not in {d["u"] for d in deck}
    assert "c1" in {d["u"] for d in deck}                                          # off-market photos feed the deck
    assert len(base64.b64decode(deck[0]["v"])) == ee.DIM


def test_deck_sample_is_deterministic_and_capped_per_listing(tmp_path):
    store = {"p:1": {"photos": [{"url": f"u{i}", "embedding": vec(i).tolist()} for i in range(6)]}}
    emb = tmp_path / "e.json"
    emb.write_text(json.dumps(store))
    a = ee.build(emb, [listing("1")], tmp_path / "a")
    b = ee.build(emb, [listing("1")], tmp_path / "b")
    deck_a = json.loads((tmp_path / "a/deck.json").read_text())["photos"]
    deck_b = json.loads((tmp_path / "b/deck.json").read_text())["photos"]
    assert deck_a == deck_b and len(deck_a) == ee.DECK_MAX_PER_LISTING and a == b
