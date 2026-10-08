import pathlib

from bs4 import BeautifulSoup

from scraper.attributes import classify_property_type, extract_attributes, floor_area_sqft

F = pathlib.Path(__file__).parent / "fixtures"


def soup(name):
    return BeautifulSoup((F / name).read_text(), "html.parser")


def test_labelled_fields_from_a_real_page():
    a = extract_attributes(soup("stock_detail_sturges.html"), address="New Kings Road, Parsons Green")
    assert a["furnished"] == "unfurnished"
    assert a["deposit"] == 6923.0
    assert a["available_from"] == "2026-10-12"
    assert a["council_tax_band"] == "F"
    assert a["floor_area_sqft"] == 1736


def test_stirling_style_labels():
    a = extract_attributes(soup("stirlingackroyd_detail.html"), address="Bracknell Gardens, London, NW3 7EB")
    assert (a["furnished"], a["available_from"], a["property_type"], a["postcode"]) == ("unfurnished", "2026-10-07", "flat", "NW3 7EB")


def test_available_now_and_epc():
    html = BeautifulSoup("<ul><li>Available: NOW</li><li>EPC Rating: D</li></ul>", "html.parser")
    a = extract_attributes(html)
    assert a["available_from"] == "now" and a["epc"] == "D"


def test_furnished_from_description_prefers_unfurnished():
    assert extract_attributes(None, description="A bright unfurnished flat.")["furnished"] == "unfurnished"
    assert extract_attributes(None, description="Fully furnished throughout")["furnished"] == "furnished"
    assert extract_attributes(None, description="Offered part furnished")["furnished"] == "part"
    assert "furnished" not in extract_attributes(None, description="Lovely home")


def test_floor_area_units_and_sanity_limits():
    assert floor_area_sqft("approximately 1,216 square feet") == 1216
    assert floor_area_sqft("Approximately 1736 sq ft [161 sq m]") == 1736
    assert floor_area_sqft("65 sq m") == round(65 * 10.7639)
    assert floor_area_sqft("a 12 sq ft cupboard") is None
    assert floor_area_sqft("nothing here") is None


def test_property_type():
    assert classify_property_type("Terraced house in Portway") == "house"
    assert classify_property_type("a 2 bed apartment") == "flat"
    assert classify_property_type("Studio flat near the station") == "studio"   # studio beats flat
    assert classify_property_type("The Whitely Room is a double room in a shared house") == "room"
    assert classify_property_type("a lovely maisonette") == "maisonette"
    assert classify_property_type("nothing useful") is None


def test_extra_structured_data_and_postcode():
    a = extract_attributes(None, address="North Crescent, London, N3",
                           extra={"type_hint": "Apartment", "postcode": "N3 3LL", "lat": 51.5956808, "lon": -0.200461, "rooms": 5})
    assert a["property_type"] == "flat" and a["postcode"] == "N3 3LL"
    assert (a["lat"], a["lon"], a["rooms"]) == (51.595681, -0.200461, 5)


def test_amenity_flags():
    a = extract_attributes(None, description="Private garden, off street parking and a concierge", features=["Lift access"])
    assert set(a["amenities"]) == {"garden", "parking", "concierge", "lift"}
