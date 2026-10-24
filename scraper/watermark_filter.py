"""Conservative, deck-only filter for agency marks baked into room photos.

The AJR/Anthony James mark has a fixed position and shape. Its high-pass
template was averaged from marked deck photos so room details cancel. A failed
download is not classified: retaining a questionable photo is preferable to
silently discarding a clean one. Results are cached by URL across refreshes.
"""
from __future__ import annotations

import io
import json
import pathlib
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image, ImageFilter

from .http import USER_AGENT

TEMPLATE_PATH = pathlib.Path(__file__).parent / "data" / "watermark_ajr.npz"
AJR_PREFIX = "estatetrack:ajrproperty:"
LONDONWIDE_PREFIX = "estatesit:PC_LONWI_"
LONDON_ESTATES_PREFIX = "estatesit:PC_LONDO_"
AJR_THRESHOLD = 0.25
REGION = (190, 233, 610, 310)


def ajr_score(image: Image.Image, template: np.ndarray) -> float:
    gray = image.convert("L").resize((800, 533), Image.Resampling.BILINEAR)
    highpass = np.asarray(gray, dtype=np.float32) - np.asarray(gray.filter(ImageFilter.GaussianBlur(12)), dtype=np.float32)
    left, top, right, bottom = REGION
    sample = highpass[top:bottom, left:right]
    sample -= sample.mean()
    norm = float(np.linalg.norm(sample) * np.linalg.norm(template))
    return float(np.sum(sample * template) / norm) if norm else 0.0


class WatermarkFilter:
    def __init__(self, path: pathlib.Path, downloader=None) -> None:
        self.path = path
        self.data: dict[str, bool] = json.loads(path.read_text()) if path.exists() else {}
        self.template = np.load(TEMPLATE_PATH)["template"]
        self.downloader = downloader or self._download

    @staticmethod
    def _download(url: str) -> bytes:
        full = f"https:{url}" if url.startswith("//") else url
        response = requests.get(full, headers={"User-Agent": USER_AGENT}, timeout=12)
        response.raise_for_status()
        if len(response.content) > 5_000_000:
            raise ValueError("Image too large for watermark check")
        return response.content

    def check(self, candidates: list[tuple[str, str]]) -> None:
        pending = list(dict.fromkeys(url for key, url in candidates if key.startswith(AJR_PREFIX) and url not in self.data))

        def classify(url: str) -> tuple[str, bool | None]:
            try:
                with Image.open(io.BytesIO(self.downloader(url))) as image:
                    return url, ajr_score(image, self.template) >= AJR_THRESHOLD
            except (requests.RequestException, OSError, ValueError):
                return url, None

        with ThreadPoolExecutor(max_workers=6) as pool:
            for url, marked in pool.map(classify, pending):
                if marked is not None:
                    self.data[url] = marked

    def is_marked(self, key: str, url: str) -> bool:
        return key.startswith((LONDONWIDE_PREFIX, LONDON_ESTATES_PREFIX)) or (
            key.startswith(AJR_PREFIX) and self.data.get(url, False)
        )

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temp = self.path.with_suffix(self.path.suffix + ".tmp")
        temp.write_text(json.dumps(self.data, separators=(",", ":"), sort_keys=True))
        temp.replace(self.path)
