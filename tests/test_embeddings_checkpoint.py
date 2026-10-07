import json

from scraper.embeddings import _write_atomic


def test_write_atomic_replaces_file_and_leaves_no_temp(tmp_path):
    out = tmp_path / "embeddings.json"
    _write_atomic(out, {"a": 1})
    _write_atomic(out, {"a": 1, "b": 2})
    assert json.loads(out.read_text()) == {"a": 1, "b": 2}
    assert [p.name for p in tmp_path.iterdir()] == ["embeddings.json"]
