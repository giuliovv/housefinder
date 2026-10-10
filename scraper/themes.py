"""Selector configs for bespoke agency sites (see scraper/themed.py). One entry per site layout."""
from .themed import Theme

THEMES: dict[str, Theme] = {
    # greaterlondonproperties.co.uk — WordPress; the whole card is a link; ids end the slug (…-w1f-531857/)
    "glp": Theme(
        card="a.post-listing", address="h4, .super-heading", price=".price-pcm, .sub-heading span",
        beds=".flex--row span:nth-of-type(1)", baths=".flex--row span:nth-of-type(2)", status=".status-pill",
        id_from_url=r"-(\d+)/?$",
    ),
    # t-k.co.uk — WordPress, `property-item` cards
    "tk": Theme(
        card="div.property-item", link=".property-item__title a", address=".property-item__title a",
        price=".property-item__meta-item:last-child", beds=".icon-list__item--bedroom", baths=".icon-list__item--bathroom",
        status=".pill", id_from_url=r"/property-to-rent/([^/]+)/?$",
    ),
    # plazaestates.co.uk — WordPress, `grid-box-card`
    "plaza": Theme(
        card="div.grid-box-card", address=".property-archive-title h4", price=".property-archive-price",
        beds=".property-types li:first-child", status=".property-label span", id_from_url=r"/([^/]+)/?$",
    ),
}
