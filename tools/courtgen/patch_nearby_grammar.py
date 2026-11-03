#!/usr/bin/env python3
"""Patch published court HTML.

Nearby-city links were the six cities in the state with the most courts, so
Lake Forest linked San Francisco. This ranks them by the distance between the
average coordinates already mapped on each city page.

It also fixes "1 are free" and "0 are free", and adds the blog to the court
nav and footer. Idempotent.

  python3 tools/courtgen/patch_nearby_grammar.py
"""
import html as htmlmod
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pages import format_miles, free_play_phrase, haversine_miles, showing_free

ROOT = Path(__file__).resolve().parents[2]
COURTS = ROOT / "courts"
NEAR_RE = re.compile(r"<section class=\"cnear\">.*?</section>", re.S)
MAP_RE = re.compile(r'data-courtmap="([^"]*)"')
H1_RE = re.compile(r"<h1>([^<]+)</h1>")
COMM_RE = re.compile(
    r'(<a href="/community"(?: aria-current="page")?>Community</a>)(?!\s*<a href="/blog/">)')
OF_THEM_ARE_RE = re.compile(r"\b(\d+) of them are free to play")
ARE_RE = re.compile(r"\b(\d+) are free to play")
OF_THEM_BARE_RE = re.compile(r"\b(\d+) of them free to play")
SHOWING_RE = re.compile(r"Showing (\d+) of (\d+) free courts\.")
ZERO_FREE_RE = re.compile(r"<em>0 free</em>")
ORG_NOTE = (
    '<p class="cnote">Running a round robin here? The '
    '<a href="/organizer-templates">organizer template</a> builds the spreadsheet '
    "in your browser.</p>"
)
COURT_FOOT = (
    '<div class="foot-col"><h3>Courts</h3><a href="/courts/">All courts</a>'
    '<a href="/courts/methodology">How we count</a></div>'
)
COURT_FOOT_BLOG = (
    '<div class="foot-col"><h3>Courts</h3><a href="/courts/">All courts</a>'
    '<a href="/courts/methodology">How we count</a><a href="/blog/">Blog</a></div>'
)


def city_key(path):
    rel = path.relative_to(COURTS)
    parts = rel.parts
    if len(parts) != 3 or parts[0] != "us" or not parts[2].endswith(".html"):
        return None
    return parts[1], parts[2][:-5]


def centroid(points):
    if not points:
        return None
    return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))


def points_of(html):
    raw = MAP_RE.search(html)
    if not raw or not raw.group(1):
        return []
    payload = json.loads(htmlmod.unescape(raw.group(1)))
    out = []
    for row in payload.get("points") or []:
        if len(row) < 2:
            continue
        lat, lng = row[0], row[1]
        if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            out.append((lat, lng))
    return out


def locality_of(html, fallback):
    h1 = H1_RE.search(html)
    if not h1:
        return fallback
    return htmlmod.unescape(h1.group(1).split(",")[0].strip())


def near_html(city, neighbors):
    items = []
    for miles, href, name in neighbors:
        items.append(
            f'<li><a href="{href}"><span>{htmlmod.escape(name)}</span>'
            f'<em><span class="vh">Distance </span>{htmlmod.escape(format_miles(miles))}</em></a></li>'
        )
    return (
        f'<section class="cnear"><h2>Pickleball near {htmlmod.escape(city)}</h2>'
        '<p class="cnote">Nearest city pages, measured between the average coordinates '
        "of the courts mapped on each page.</p>"
        f'<ul>{"".join(items)}</ul></section>'
    )


def fix_grammar(text):
    text = OF_THEM_ARE_RE.sub(lambda m: free_play_phrase(int(m.group(1)), "of-them-are"), text)
    text = ARE_RE.sub(lambda m: free_play_phrase(int(m.group(1)), "are"), text)
    text = OF_THEM_BARE_RE.sub(lambda m: free_play_phrase(int(m.group(1)), "of-them-bare"), text)
    text = SHOWING_RE.sub(lambda m: showing_free(int(m.group(1)), int(m.group(2))), text)
    text = ZERO_FREE_RE.sub("<em>none free</em>", text)
    return text


def add_links(text):
    text = COMM_RE.sub(r'\1<a href="/blog/">Blog</a>', text)
    if COURT_FOOT in text:
        text = text.replace(COURT_FOOT, COURT_FOOT_BLOG)
    return text


def add_organizer(text):
    if 'href="/organizer-templates"' in text:
        return text
    needle = "spots left, inside the app.</p></div>"
    if "Open games around " in text and needle in text:
        text = text.replace(
            needle,
            "spots left, inside the app.</p>\n  " + ORG_NOTE + "</div>",
            1,
        )
    return text


def main():
    cities = []
    missing = []
    for path in sorted(COURTS.rglob("*.html")):
        key = city_key(path)
        if not key:
            continue
        html = path.read_text(encoding="utf-8")
        pts = points_of(html)
        cen = centroid(pts)
        state_slug, city_slug = key
        name = locality_of(html, city_slug)
        if not cen:
            missing.append(f"{state_slug}/{city_slug}")
            continue
        cities.append({
            "path": path,
            "state": state_slug,
            "slug": city_slug,
            "name": name,
            "cen": cen,
            "href": f"/courts/us/{state_slug}/{city_slug}",
        })

    by_path = {c["path"]: c for c in cities}
    changed = 0
    linked = 0
    for path in [ROOT / "index.html", ROOT / "organizers.html", ROOT / "players.html",
                 ROOT / "clubs.html", ROOT / "community.html", ROOT / "live-scores.html",
                 ROOT / "support.html", *COURTS.rglob("*.html")]:
        if not path.exists():
            continue
        html = path.read_text(encoding="utf-8")
        new = add_links(html)
        if path in by_path:
            origin = by_path[path]
            ranked = []
            for other in cities:
                if other["path"] == path:
                    continue
                miles = haversine_miles(origin["cen"], other["cen"])
                ranked.append((miles, other["href"], other["name"]))
            ranked.sort(key=lambda t: (t[0], t[2]))
            section = near_html(origin["name"], ranked[:6])
            if NEAR_RE.search(new):
                new = NEAR_RE.sub(section, new, count=1)
            new = add_organizer(new)
            new = fix_grammar(new)
        elif path.is_relative_to(COURTS):
            new = fix_grammar(new)
        if new != html:
            path.write_text(new, encoding="utf-8")
            changed += 1
            if 'href="/blog/"' in new:
                linked += 1
    lake = next(c for c in cities if c["slug"] == "lake-forest" and c["state"] == "california")
    nearest = sorted(
        ((haversine_miles(lake["cen"], c["cen"]), c["name"], c["href"]) for c in cities if c is not lake),
        key=lambda t: (t[0], t[1]),
    )[:6]
    print(f"updated {changed} files; cities with coordinates {len(cities)}; missing {len(missing)}")
    if missing:
        print("no coordinates:", ", ".join(missing[:12]))
    print("Lake Forest nearest:")
    for miles, name, href in nearest:
        print(f"  {format_miles(miles):>6}  {name}  {href}")


if __name__ == "__main__":
    main()
