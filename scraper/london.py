"""Is an address in (Greater) London?

Agency addresses are inconsistent: some say "London" or give a postcode,
many just "Mile End" or "Maida Vale". So: "London", an inner-London postcode
area (E/EC/N/NW/SE/SW/W/WC + digits), or a known London district/borough
name. Deliberately conservative — a miss only costs one listing, while a
false positive puts a Surrey flat in a London search. Names that are also
well-known places outside London (e.g. Richmond, North Yorkshire) are left
out or are only matched with a London marker.
"""
from __future__ import annotations

import re

_MULTI = [
    "notting hill", "holland park", "south kensington", "earls court", "kentish town", "belsize park", "swiss cottage",
    "west hampstead", "golders green", "mill hill", "muswell hill", "crouch end", "finsbury park", "wood green",
    "palmers green", "winchmore hill", "new southgate", "bounds green", "arnos grove", "friern barnet", "temple fortune",
    "burnt oak", "stoke newington", "shepherd's bush", "shepherds bush", "brook green", "barons court", "thornton heath",
    "forest hill", "herne hill", "colliers wood", "raynes park", "new malden", "canning town", "forest gate", "east ham",
    "west ham", "gants hill", "seven kings", "east sheen", "mile end", "bethnal green", "isle of dogs", "canary wharf",
    "waltham forest", "maida vale", "st john's wood", "regent's park", "lisson grove", "covent garden", "elephant castle",
    "tower hamlets", "collier row", "rayners lane", "nine elms", "highams park", "lee green",
]
_SINGLE = [
    "barking", "dagenham", "barnet", "bexleyheath", "sidcup", "welling", "erith", "wembley", "willesden", "kilburn",
    "neasden", "harlesden", "beckenham", "hampstead", "highgate", "croydon", "purley", "coulsdon", "sanderstead",
    "norbury", "addiscombe", "carshalton", "ealing", "acton", "southall", "hanwell", "greenford", "perivale", "northolt",
    "chiswick", "brentford", "isleworth", "hounslow", "enfield", "edmonton", "southgate", "cockfosters", "greenwich",
    "blackheath", "charlton", "woolwich", "eltham", "plumstead", "lewisham", "catford", "deptford", "brockley",
    "sydenham", "hackney", "dalston", "homerton", "clapton", "shoreditch", "hoxton", "hammersmith", "fulham",
    "haringey", "tottenham", "hornsey", "harringay", "harrow", "pinner", "stanmore", "edgware", "wealdstone",
    "romford", "hornchurch", "upminster", "uxbridge", "ruislip", "ickenham", "northwood", "islington", "holloway",
    "archway", "kensington", "chelsea", "knightsbridge", "surbiton", "tolworth", "brixton", "streatham", "vauxhall",
    "stockwell", "clapham", "wimbledon", "mitcham", "morden", "stratford", "ilford", "woodford", "barkingside",
    "wanstead", "twickenham", "teddington", "whitton", "mortlake", "putney", "peckham", "dulwich", "camberwell",
    "bermondsey", "rotherhithe", "walworth", "nunhead", "poplar", "limehouse", "whitechapel", "wapping", "stepney",
    "walthamstow", "leyton", "leytonstone", "chingford", "tooting", "balham", "earlsfield", "battersea", "roehampton",
    "westminster", "paddington", "marylebone", "mayfair", "belgravia", "pimlico", "soho", "bayswater", "finchley",
    "hendon", "totteridge", "whetstone", "colindale", "cricklewood", "orpington", "penge", "cheam", "wallington",
    "feltham", "hanworth", "hayes", "harefield", "yiewsley", "bromley", "brent", "sutton", "kingston", "richmond",
    "barnes", "kew",
]
# Names that need a London marker to count (also real places elsewhere).
_AMBIGUOUS = {"richmond", "sutton", "brent", "bromley", "kingston", "hayes", "barnet", "harrow", "kew"}

_WORD_RE = {n: re.compile(rf"\b{re.escape(n)}\b", re.IGNORECASE) for n in _MULTI + _SINGLE}
_LONDON_WORD = re.compile(r"\bLondon\b", re.IGNORECASE)
_INNER_POSTCODE = re.compile(r"\b(?:EC|WC|NW|SE|SW|E|N|W)\d{1,2}[A-Z]?\b")
_OUTER_POSTCODE = re.compile(r"\b(?:BR|CR|DA|EN|HA|IG|KT|RM|SM|TW|UB|WD)\d{1,2}[A-Z]?\b")
# outer postcode districts that are mostly/entirely inside Greater London
_OUTER_IN_LONDON = {"BR1", "BR2", "BR3", "BR4", "BR5", "BR6", "BR7", "BR8", "CR0", "CR2", "CR3", "CR4", "CR5", "CR7", "CR8",
                    "DA5", "DA6", "DA7", "DA8", "DA14", "DA15", "DA16", "DA17", "EN1", "EN2", "EN3", "EN4", "EN5",
                    "HA0", "HA1", "HA2", "HA3", "HA4", "HA5", "HA6", "HA7", "HA8", "HA9", "IG1", "IG2", "IG3", "IG4",
                    "IG5", "IG6", "IG7", "IG8", "IG11", "KT1", "KT2", "KT3", "KT4", "KT5", "KT6", "RM1", "RM2", "RM3",
                    "RM5", "RM6", "RM7", "RM8", "RM9", "RM10", "RM11", "RM12", "RM13", "RM14", "SM1", "SM2", "SM3",
                    "SM4", "SM5", "SM6", "TW1", "TW2", "TW3", "TW4", "TW5", "TW7", "TW8", "TW9", "TW10", "TW11",
                    "TW12", "TW13", "TW14", "UB1", "UB2", "UB3", "UB4", "UB5", "UB6", "UB7", "UB8", "UB9", "UB10",
                    "UB11", "WD23"}


def is_london(address: str) -> bool:
    if _LONDON_WORD.search(address) or _INNER_POSTCODE.search(address.upper()):
        return True
    for m in _OUTER_POSTCODE.finditer(address.upper()):
        if m.group() in _OUTER_IN_LONDON:
            return True
    for name, rx in _WORD_RE.items():
        if name in _AMBIGUOUS:
            continue
        if rx.search(address):
            return True
    return False
