from scraper.listing_geo import build, district_of, street_query


def row(sid, address, platform="homeflow", agency="a"):
    return {"summary": {"source_id": sid, "platform": platform, "agency": agency, "address": address}}


def test_district_found_in_messy_addresses():
    assert district_of("Sutherland Avenue, London W9") == "W9"
    assert district_of("Portpool Lane, Clerkenwell London EC1N") == "EC1N"
    assert district_of("Royal Mint Street, Tower Hill, London, E1") == "E1"
    assert district_of("Pelham Street, South Kensington, Lond...", "SW7") == "SW7"
    assert district_of("Pelham Street, South Kensington, Lond...") is None


def test_street_query_drops_flat_and_house_number():
    assert street_query("Flat 3, 12 Royal Mint Street, Tower Hill, London, E1", "E1") == "Royal Mint Street, E1, London"
    assert street_query("Knightsbridge, London") is None


def test_precision_ladder_and_cache():
    rows = [row("1", "A Road, London, E1"), row("2", "B Street, London, E2"), row("3", "C Lane, London, E3"),
            row("4", "Nowhere Close, London, E4"), row("5", "Far Road, London, E5")]
    history = {"listings": {
        "homeflow:1": {"attrs": {"lat": 51.5, "lon": -0.1}},
        "homeflow:2": {"attrs": {"postcode": "E2 6AB"}},
    }}
    centroids = {"E4": {"lat": 51.6, "lon": -0.05}}
    cache, calls = {}, []

    def pcs(pcs_):
        return {p: (51.52, -0.07) for p in pcs_}

    def street(q):
        calls.append(q)
        return (51.0, 0.0) if "Far" in q else (51.53, -0.03)  # outside London is rejected

    geo = build(rows, history, centroids, cache, 5, lookup_postcodes=pcs, lookup_street=street, sleep=lambda s: None)
    assert geo["homeflow:1"][2] == "e"
    assert geo["homeflow:2"][2] == "p"
    assert geo["homeflow:3"][2] == "s"
    assert geo["homeflow:4"] == [51.6, -0.05, "a"] or geo["homeflow:4"][2] == "s"
    assert "homeflow:5" not in geo
    n = len(calls)
    build(rows, history, centroids, cache, 5, lookup_postcodes=pcs, lookup_street=street, sleep=lambda s: None)
    assert len(calls) == n  # answers (incl. misses) are cached, never re-asked
