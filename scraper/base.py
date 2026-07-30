"""Common interface every platform parser implements.

Kept deliberately narrow: search() paginates a results page down to cheap
ListingSummary rows, detail() does the one extra request per property for
photos/description. Callers should filter on summary fields before calling
detail() for everything, since detail() is the expensive step at scale.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from .models import ListingDetail, ListingSummary


class PlatformScraper(ABC):
    platform: str

    @abstractmethod
    def search(self, agency: str, search_url: str, max_pages: int = 5) -> Iterator[ListingSummary]:
        """Yield ListingSummary rows from a search/results page, following
        pagination up to max_pages."""

    @abstractmethod
    def detail(self, agency: str, summary: ListingSummary) -> ListingDetail:
        """Fetch the full detail page for one listing."""
