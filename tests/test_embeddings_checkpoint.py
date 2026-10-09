import json

from scraper.embeddings import _write_atomic


def test_write_atomic_replaces_file_and_leaves_no_temp(tmp_path):
    out = tmp_path / "embeddings.json"
    _write_atomic(out, {"a": 1})
    _write_atomic(out, {"a": 1, "b": 2})
    assert json.loads(out.read_text()) == {"a": 1, "b": 2}
    assert [p.name for p in tmp_path.iterdir()] == ["embeddings.json"]


def test_unusable_images_are_recognised(tmp_path):
    import hashlib

    from PIL import Image

    from scraper import embeddings as emb

    def save(name, img):
        p = tmp_path / name
        img.save(p, "PNG")
        return p

    noisy = Image.effect_noise((400, 400), 60).convert("RGB")
    assert emb._unusable_image(save("ok.png", noisy)) is None
    assert "too small" in emb._unusable_image(save("tiny.png", Image.effect_noise((50, 50), 60).convert("RGB")))
    assert "blank" in emb._unusable_image(save("blank.png", Image.new("RGB", (400, 400), (240, 240, 240))))
    marked = save("ph.png", noisy)
    emb.PLACEHOLDER_MD5.add(hashlib.md5(marked.read_bytes()).hexdigest())
    try:
        assert emb._unusable_image(marked) == "known placeholder image"
    finally:
        emb.PLACEHOLDER_MD5.discard(hashlib.md5(marked.read_bytes()).hexdigest())
