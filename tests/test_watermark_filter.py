import io

import numpy as np
from PIL import Image

from scraper.watermark_filter import REGION, TEMPLATE_PATH, WatermarkFilter, ajr_score


def _png(marked: bool) -> bytes:
    pixels = np.full((533, 800), 125, dtype=np.float32)
    if marked:
        left, top, right, bottom = REGION
        template = np.load(TEMPLATE_PATH)["template"]
        pixels[top:bottom, left:right] += template * 2400
    image = Image.fromarray(np.uint8(np.clip(pixels, 0, 255)))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_ajr_detector_distinguishes_fixed_mark_from_clean_room():
    template = np.load(TEMPLATE_PATH)["template"]
    assert ajr_score(Image.open(io.BytesIO(_png(True))), template) > 0.25
    assert ajr_score(Image.open(io.BytesIO(_png(False))), template) < 0.25


def test_cache_and_londonwide_exception(tmp_path):
    calls = []

    def download(url):
        calls.append(url)
        return _png(url == "marked")

    path = tmp_path / "watermark-cache.json"
    filter_ = WatermarkFilter(path, downloader=download)
    filter_.check([("estatetrack:ajrproperty:1", "marked"), ("estatetrack:ajrproperty:2", "clean"), ("other:1", "ignored")])
    assert calls == ["marked", "clean"]
    assert filter_.is_marked("estatetrack:ajrproperty:1", "marked")
    assert not filter_.is_marked("estatetrack:ajrproperty:2", "clean")
    assert filter_.is_marked("estatesit:PC_LONWI_001699", "anything")
    assert not filter_.is_marked("estatesit:PC_LYONS_000188", "anything")
    filter_.save()
    reloaded = WatermarkFilter(path, downloader=download)
    reloaded.check([("estatetrack:ajrproperty:1", "marked")])
    assert calls == ["marked", "clean"]
