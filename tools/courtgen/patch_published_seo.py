#!/usr/bin/env python3
"""Patch the already-generated court HTML.

build_site.py is what a later rebuild runs. This updates the pages that are
already in the tree: drop the duplicate /courts/us breadcrumb, add
SportsActivityLocation on city pages from data already in each page, and
insert sourced fact sections from data/court-facts.json.

Idempotent. Run from anywhere: python3 tools/courtgen/patch_published_seo.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from recorded import dump_ld, facts_section, sports_graph, unescape

ROOT = Path(__file__).resolve().parents[2]
COURTS = ROOT / "courts"
HOST = "https://www.picklecue.com"
US_CRUMB = '<a href="/courts/us">United States</a><span>/</span>'
FACTS_RE = re.compile(r"<!-- pc-facts:start -->.*?<!-- pc-facts:end -->\n?", re.S)
SAL_RE = re.compile(r"<!-- pc-sal:start -->.*?<!-- pc-sal:end -->\n?", re.S)
LD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)
MAP_RE = re.compile(r'data-courtmap="([^"]*)"')
CARD_RE = re.compile(r'class="cc-name">(.*?)</span><span class="cc-addr">(.*?)</span>')
ROW_RE = re.compile(r'class="rn">(.*?)<em>(.*?)</em>')
H1_RE = re.compile(r"<h1>([^<]+)</h1>")

ABBR = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district-of-columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new-hampshire": "NH", "new-jersey": "NJ", "new-mexico": "NM", "new-york": "NY",
    "north-carolina": "NC", "north-dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode-island": "RI", "south-carolina": "SC",
    "south-dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west-virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}


def fix_breadcrumb_ld(html):
    def repl(match):
        raw = match.group(1)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return match.group(0)
        if not isinstance(data, dict) or data.get("@type") != "BreadcrumbList":
            return match.group(0)
        items = [it for it in data.get("itemListElement") or [] if it.get("name") != "United States"]
        for i, it in enumerate(items, 1):
            it["position"] = i
        data["itemListElement"] = items
        return f'<script type="application/ld+json">{dump_ld(data)}</script>'
    return LD_RE.sub(repl, html)


def city_key(path):
    """courts/us/<state>/<city>.html, not a file inside the city directory."""
    rel = path.relative_to(COURTS)
    parts = rel.parts
    if len(parts) != 3 or parts[0] != "us" or not parts[2].endswith(".html"):
        return None
    return parts[1], parts[2][:-5]


def places_from(html, state_slug, city_slug, locality):
    region = ABBR[state_slug]
    base = f"/courts/us/{state_slug}/{city_slug}"
    streets = {}
    for name, addr in CARD_RE.findall(html):
        streets[unescape(name)] = unescape(addr)
    for name, addr in ROW_RE.findall(html):
        streets.setdefault(unescape(name), unescape(addr))
    raw = MAP_RE.search(html)
    if not raw or not raw.group(1):
        return []
    payload = json.loads(unescape(raw.group(1)))
    places = []
    for lat, lng, name, url, _free, count in payload.get("points") or []:
        if not name or not url:
            continue
        slug = url.rstrip("/").split("/")[-1]
        places.append({
            "name": name,
            "url": HOST + url,
            "lat": lat,
            "lng": lng,
            "street": streets.get(name) or "",
            "locality": locality,
            "region": region,
            "count": count or None,
            "slug": slug,
        })
    return places, base, region


def apply_city(html, state_slug, city_slug):
    h1 = H1_RE.search(html)
    locality = h1.group(1).split(",")[0].strip() if h1 else city_slug
    built = places_from(html, state_slug, city_slug, locality)
    places, base, region = built if built else ([], f"/courts/us/{state_slug}/{city_slug}", ABBR[state_slug])
    section = facts_section(state_slug, city_slug)
    html = FACTS_RE.sub("", html)
    if section and '<p class="cmap-jump">' in html:
        html = html.replace('<p class="cmap-jump">', section + '<p class="cmap-jump">', 1)
    graph = sports_graph(places, state_slug, city_slug, HOST + base, locality, region)
    html = SAL_RE.sub("", html)
    if graph:
        block = (
            "<!-- pc-sal:start -->\n"
            f'<script type="application/ld+json">{dump_ld(graph)}</script>\n'
            "<!-- pc-sal:end -->\n"
        )
        html = html.replace("</head>", block + "</head>", 1)
    return html


def main():
    us = COURTS / "us.html"
    if us.exists():
        us.unlink()
        print("removed courts/us.html")
    n = 0
    cities = 0
    for path in COURTS.rglob("*.html"):
        html = path.read_text(encoding="utf-8")
        new = html.replace(US_CRUMB, "")
        new = fix_breadcrumb_ld(new)
        key = city_key(path)
        if key:
            new = apply_city(new, *key)
            cities += 1
        if new != html:
            path.write_text(new, encoding="utf-8")
            n += 1
    print(f"updated {n} court pages; sports/facts pass on {cities} city pages")


if __name__ == "__main__":
    main()
