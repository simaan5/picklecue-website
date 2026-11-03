"""Sourced court facts and SportsActivityLocation nodes.

Facts live in data/court-facts.json. Each line was checked against the cited
page or OpenStreetMap element. This module does not invent a value for a
missing surface, light, indoor/outdoor flag, hour, or court count.
"""
import html
import json
from pathlib import Path

from shell import esc

ROOT = Path(__file__).resolve().parents[2]
FACTS_PATH = ROOT / "data" / "court-facts.json"
HOST = "https://www.picklecue.com"
DAY = {
    "Monday": "https://schema.org/Monday",
    "Tuesday": "https://schema.org/Tuesday",
    "Wednesday": "https://schema.org/Wednesday",
    "Thursday": "https://schema.org/Thursday",
    "Friday": "https://schema.org/Friday",
    "Saturday": "https://schema.org/Saturday",
    "Sunday": "https://schema.org/Sunday",
}


def load_facts():
    data = json.loads(FACTS_PATH.read_text(encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def city_items(state_slug, city_slug):
    page = load_facts().get(f"{state_slug}/{city_slug}") or {}
    return page.get("items") or []


def facts_section(state_slug, city_slug):
    """HTML block for a city page. Empty when that city has no sourced facts."""
    page = load_facts().get(f"{state_slug}/{city_slug}") or {}
    items = page.get("items") or []
    if not items:
        return ""
    lead = f'<p class="cnote">{esc(page["lead"])}</p>' if page.get("lead") else ""
    rows = []
    for item in items:
        bits = [f'<b>{esc(item["title"])}</b> ']
        sentences = []
        for line in item["lines"]:
            sentences.append(
                f'{esc(line["text"])} '
                f'<a href="{esc(line["url"])}" rel="noopener">{esc(line["source"])}</a>')
        bits.append(" ".join(sentences))
        if item.get("href"):
            bits.append(f' <a href="{esc(item["href"])}">Court page</a>')
        iid = item.get("id") or ""
        attr = f' id="{esc(iid)}"' if iid else ""
        rows.append(f"<li{attr}>{''.join(bits)}</li>")
    return (
        "<!-- pc-facts:start -->\n"
        '<section class="csec" id="recorded"><h2>Recorded court details</h2>'
        '<p class="cnote">Each sentence has a source. Surface, lights, indoor or '
        "outdoor, and times are left out when we do not have one.</p>"
        f"{lead}"
        f'<ul class="mlist">{"".join(rows)}</ul></section>\n'
        "<!-- pc-facts:end -->\n"
    )


def _apply_lines(node, lines):
    for line in lines:
        if line.get("lit") is True:
            node.setdefault("amenityFeature", []).append({
                "@type": "LocationFeatureSpecification",
                "name": "Lights",
                "value": True,
            })
        if line.get("surface"):
            node.setdefault("amenityFeature", []).append({
                "@type": "LocationFeatureSpecification",
                "name": "Surface",
                "value": line["surface"],
            })
        if line.get("indoor") is True:
            node.setdefault("additionalProperty", []).append({
                "@type": "PropertyValue",
                "name": "Setting",
                "value": "indoor",
            })
        hours = line.get("hours") or {}
        if hours.get("schema"):
            node["openingHoursSpecification"] = [{
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [DAY[d] for d in hours["days"]],
                "opens": hours["opens"],
                "closes": hours["closes"],
            }]
        if line.get("count") and not _has_count(node):
            node.setdefault("additionalProperty", []).append({
                "@type": "PropertyValue",
                "name": "Dedicated courts",
                "value": line["count"],
            })


def _has_count(node):
    return any(
        p.get("name") == "Dedicated courts"
        for p in node.get("additionalProperty") or [])


def place_node(place):
    """One SportsActivityLocation. Requires a name and a url. Geo and street
    are included only when the caller already has them."""
    if not place.get("name") or not place.get("url"):
        return None
    address = {
        "@type": "PostalAddress",
        "addressLocality": place["locality"],
        "addressRegion": place["region"],
        "addressCountry": "US",
    }
    if place.get("street"):
        address["streetAddress"] = place["street"]
    node = {
        "@type": "SportsActivityLocation",
        "name": place["name"],
        "url": place["url"],
        "description": "Pickleball courts",
        "address": address,
    }
    if place.get("lat") is not None and place.get("lng") is not None:
        node["geo"] = {
            "@type": "GeoCoordinates",
            "latitude": place["lat"],
            "longitude": place["lng"],
        }
    if place.get("count"):
        node["additionalProperty"] = [{
            "@type": "PropertyValue",
            "name": "Dedicated courts",
            "value": place["count"],
        }]
    return node


def sports_graph(places, state_slug, city_slug, page_url, locality, region):
    """@graph of SportsActivityLocation nodes for courts we can locate or describe.

    `places` are courts already on the city page (name, url, optional geo,
    street, count, slug). Sourced extras merge onto the matching slug.
    City-listed venues with no court page are added only from court-facts.json.
    """
    by_slug = {item["slug"]: item for item in city_items(state_slug, city_slug) if item.get("slug")}
    nodes = []
    seen = set()
    for place in places:
        node = place_node(place)
        if not node:
            continue
        extra = by_slug.get(place.get("slug") or "")
        if extra:
            _apply_lines(node, extra["lines"])
            seen.add(place["slug"])
        nodes.append(node)
    for item in city_items(state_slug, city_slug):
        slug = item.get("slug")
        if slug and slug in seen:
            continue
        if slug:
            continue
        count = next((line["count"] for line in item["lines"] if line.get("count")), None)
        node = place_node({
            "name": item["title"],
            "url": f"{page_url}#{item['id']}",
            "locality": locality,
            "region": region,
            "street": item.get("streetAddress") or "",
            "count": count,
        })
        if not node:
            continue
        _apply_lines(node, item["lines"])
        nodes.append(node)
    if not nodes:
        return None
    return {"@context": "https://schema.org", "@graph": nodes}


def dump_ld(obj):
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


def unescape(s):
    return html.unescape(s)
