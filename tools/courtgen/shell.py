"""Shared page shell for PickleCue court pages.

One masthead, one footer, one head. Every court page uses these so the eight
page families read as one system rather than eight separately built pages.
"""
import html
import json
import math
import re
import urllib.parse
import urllib.request

from gate import ODBL_ATTRIBUTION, PUBLISHABLE_SOURCES, assert_publishable

SUPABASE = "https://uejmhtdfbqbotvbqvfja.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6"
        "InVlam1odGRmYnFib3R2YnF2ZmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcyMjYzMjAs"
        "ImV4cCI6MjA4MjgwMjMyMH0.oSZlTczSfIe1Jls0DSG6br1pVLKZ1F6e_DOPgndPdOc")

FIELDS = "id,name,slug,address,court_count,is_free,lat,lng,source,city,state"


def esc(s):
    return html.escape(str(s), quote=True)


def slugify(s):
    """Collapse ALL runs of separators, not just doubles. A single `.replace`
    turns "a---b" into "a--b", which then mismatches the filename it produced."""
    out = "".join(c if c.isalnum() else "-" for c in str(s).lower())
    return re.sub(r"-{2,}", "-", out).strip("-")


def fetch(path, params):
    url = f"{SUPABASE}/rest/v1/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"apikey": ANON, "Authorization": f"Bearer {ANON}"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def courts(**filters):
    """Every read goes through here, so the publication gate cannot be bypassed.

    PostgREST caps a response at 1000 rows regardless of `limit`, so this pages
    through with Range headers. Without it, a page would silently render a
    truncated set and report it as the total, which is how "1,000 publishable
    courts" nearly shipped as a fact.
    """
    params = {"select": FIELDS, "removed_at": "is.null",
              "source": f"in.({','.join(PUBLISHABLE_SOURCES)})"}
    params.update(filters)
    out, step, start = [], 1000, 0
    while True:
        url = f"{SUPABASE}/rest/v1/courts?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "apikey": ANON, "Authorization": f"Bearer {ANON}",
            "Range-Unit": "items", "Range": f"{start}-{start + step - 1}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            batch = json.load(r)
        out.extend(batch)
        if len(batch) < step:
            break
        start += step
    return assert_publishable(out)


def court_count(**filters):
    """Exact row count via PostgREST's count header. Never infer a total from
    a page of results."""
    params = {"select": "id", "removed_at": "is.null",
              "source": f"in.({','.join(PUBLISHABLE_SOURCES)})", "limit": "1"}
    params.update(filters)
    url = f"{SUPABASE}/rest/v1/courts?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "apikey": ANON, "Authorization": f"Bearer {ANON}",
        "Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
    with urllib.request.urlopen(req, timeout=40) as r:
        cr = r.headers.get("Content-Range", "")
    return int(cr.split("/")[-1]) if "/" in cr else 0


def head(title, desc, canonical, extra_ld=None, indexable=False):
    robots = "" if indexable else '<meta name="robots" content="noindex">'
    ld = ""
    if extra_ld:
        ld = f'<script type="application/ld+json">{json.dumps(extra_ld)}</script>'
    return f"""<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
{robots}
<link rel="canonical" href="https://www.picklecue.com{canonical}">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png?v=20260812b">
<meta name="theme-color" content="#F7F7F2">
<link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/instrumentsans-pxiTypc9vsFDm051Uf6KVwgkfoSxQ0GsQv8ToedPibnr0SZe1ZuWi3g.woff2">
<link rel="stylesheet" href="/fonts.css">
<link rel="stylesheet" href="/assets/site-v2.css?v=20260824a">
<link rel="stylesheet" href="/assets/courts.css?v=2">
<script defer src="/assets/site-v2.js?v=20260822c"></script>
<script defer src="/assets/courtmap.js?v=1"></script>
<style>.site-menu[hidden],.lightbox[hidden]{{display:none !important}}</style>
<script>(function(){{try{{var t=localStorage.getItem('pc_theme');
var d=window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-theme',t||(d?'dark':'light'));}}catch(e){{}}}})();</script>
{ld}"""


MASTHEAD = """<a class="skip-link" href="#main">Skip to content</a>
<header class="masthead" id="masthead"><div class="masthead-inner">
<a class="brand" href="/" aria-label="PickleCue, home">
<img class="brand-mark" src="/images/email/cuemark.png" alt="" width="42" height="42">
<img class="brand-wordmark wm-light" src="/images/wordmark-on-light.png" alt="" width="1137" height="190">
<img class="brand-wordmark wm-dark" src="/images/wordmark-on-dark.png" alt="" width="744" height="126"></a>
<nav aria-label="Primary"><a href="/#product">Product</a><a href="/courts">Courts</a><a href="/players.html">Players</a>
<a href="/organizers.html">Organizers</a><a href="/community.html">Community</a><a href="/demo/">Live demo</a></nav>
<button class="theme-toggle" id="themeToggle" aria-label="Switch between light and dark mode">
<svg class="moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
<svg class="sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
<a class="btn btn-primary" href="/#early-access">Join the waitlist</a>
<button class="masthead-burger" aria-label="Open menu" aria-expanded="false" aria-controls="siteMenu">
<svg width="20" height="14" viewBox="0 0 20 14" fill="none"><path d="M1 1h18M1 7h18M1 13h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
</div></header>
<div class="site-menu" id="siteMenu" hidden><button class="site-menu-close" aria-label="Close menu">&times;</button>
<nav aria-label="Mobile"><a href="/#product">Product</a><a href="/courts">Courts</a><a href="/players.html">Players</a>
<a href="/organizers.html">Organizers</a><a href="/clubs.html">Clubs</a><a href="/community.html">Community</a>
<a href="/demo/">Live demo</a></nav><a class="btn btn-primary" href="/#early-access">Join the waitlist</a></div>"""

FOOTER = """<footer class="site-foot"><div class="foot-inner">
<div class="foot-brand"><img src="/images/wordmark-on-dark.png" alt="PickleCue" width="744" height="126">
<p>All the pickleball. One elegant app.</p></div>
<div class="foot-col"><h3>Product</h3><a href="/#product">Product</a><a href="/demo/">Live demo</a></div>
<div class="foot-col"><h3>For you</h3><a href="/players.html">Players</a><a href="/organizers.html">Organizers</a><a href="/clubs.html">Clubs</a></div>
<div class="foot-col"><h3>Courts</h3><a href="/courts">All courts</a><a href="/courts/methodology">How we count</a></div>
<div class="foot-col"><h3>Legal</h3><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a href="/licenses.html">Notices</a><a href="/support.html">Support</a></div>
</div></footer>"""


def attribution(extra=""):
    return (f'<p class="cattrib">{ODBL_ATTRIBUTION} Court details are community '
            f'maintained and can change. Found something wrong? You can correct it '
            f'from inside PickleCue. {extra}'
            f'<a href="/courts/methodology">How we count courts</a>.</p>')


def crumbs(items):
    """items: list of (label, href or None). Last one is aria-current."""
    parts = []
    for i, (label, href) in enumerate(items):
        last = i == len(items) - 1
        parts.append(f'<span aria-current="page">{esc(label)}</span>' if last
                     else f'<a href="{href}">{esc(label)}</a>')
    ld = {"@context": "https://schema.org", "@type": "BreadcrumbList",
          "itemListElement": [
              {"@type": "ListItem", "position": i + 1, "name": lbl,
               **({"item": f"https://www.picklecue.com{href}"} if href else {})}
              for i, (lbl, href) in enumerate(items)]}
    return ('<nav class="crumb" aria-label="Breadcrumb">'
            + '<span>/</span>'.join(parts) + '</nav>'), ld


def plot(rows, vw=1100, maxh=470, r=7, focus=None, cluster_px=34):
    """Plot real coordinates, clustering markers that would overlap.

    INTERIM. The approved design calls for a real tiled map, which needs a
    provider, an API key, per-load cost across ~244 pages, and a third-party
    origin in the CSP. The projection, clustering and chrome here are all real,
    so a tile layer slides in behind these markers without a redesign.
    """
    pts = [(x["lat"], x["lng"], bool(x.get("is_free")), x.get("id"))
           for x in rows if x.get("lat") is not None and x.get("lng") is not None]
    if not pts:
        return "", 0
    lats = [p[0] for p in pts]; lngs = [p[1] for p in pts]
    pad = 0.012 if len(pts) > 1 else 0.02
    la0, la1 = min(lats) - pad, max(lats) + pad
    ln0, ln1 = min(lngs) - pad, max(lngs) + pad
    kx = math.cos(math.radians(sum(lats) / len(lats)))
    span_x = max(ln1 - ln0, 1e-6)
    vh = int(vw * (la1 - la0) / (span_x * kx))
    if vh > maxh:
        need = (la1 - la0) * vw / (maxh * kx); mid = (ln0 + ln1) / 2
        ln0, ln1 = mid - need / 2, mid + need / 2; vh = maxh; span_x = ln1 - ln0
    vh = max(vh, 200)

    def xy(la, ln):
        return ((ln - ln0) / span_x * vw, (1 - (la - la0) / (la1 - la0)) * vh)

    # Grid-cluster anything that would collide at render scale, so dense areas
    # read as "12 courts here" instead of an unreadable blob.
    cells = {}
    for la, ln, free, cid in pts:
        x, y = xy(la, ln)
        key = (int(x // cluster_px), int(y // cluster_px))
        cells.setdefault(key, []).append((x, y, free, cid))

    grid = "".join(f'<line x1="0" y1="{vh*i/5:.0f}" x2="{vw}" y2="{vh*i/5:.0f}"/>' for i in range(1, 5)) \
         + "".join(f'<line x1="{vw*i/8:.0f}" y1="0" x2="{vw*i/8:.0f}" y2="{vh}"/>' for i in range(1, 8))

    marks = []
    for members in cells.values():
        n = len(members)
        cx = sum(m[0] for m in members) / n
        cy = sum(m[1] for m in members) / n
        has_focus = focus is not None and any(m[3] == focus for m in members)
        if n == 1:
            x, y, free, cid = members[0]
            cls = "sel" if has_focus else ("f" if free else "p")
            marks.append(f'<circle class="{cls}" cx="{x:.1f}" cy="{y:.1f}" '
                         f'r="{r*1.7 if has_focus else r}"/>')
        else:
            rad = min(13 + n * 1.4, 26)
            allfree = all(m[2] for m in members)
            marks.append(
                f'<g class="cl{" sel" if has_focus else ""}">'
                f'<circle class="{"f" if allfree else "p"}" cx="{cx:.1f}" cy="{cy:.1f}" r="{rad:.1f}"/>'
                f'<text x="{cx:.1f}" y="{cy:.1f}" dy="0.36em" text-anchor="middle">{n}</text></g>')

    return (f'<svg viewBox="0 0 {vw} {vh}" role="img" aria-label="Court locations">'
            f'<g class="g">{grid}</g>{"".join(marks)}</svg>'), len(pts)


def map_payload(rows, city_base=""):
    """Real coordinates for the interactive layer. Same numbers the SVG plots."""
    pts, lats, lngs = [], [], []
    for r in rows:
        la, ln = r.get("lat"), r.get("lng")
        if la is None or ln is None:
            continue
        lats.append(la); lngs.append(ln)
        pts.append([round(la, 5), round(ln, 5), r.get("label") or "Pickleball courts",
                    f"{city_base}/{slugify(r['slug'])}" if city_base and r.get("slug") else "",
                    1 if r.get("is_free") else 0, r.get("court_count") or 0])
    if not pts:
        return ""
    payload = {"points": pts, "s": min(lats), "n": max(lats),
               "w": min(lngs), "e": max(lngs)}
    return html.escape(json.dumps(payload, separators=(",", ":")), quote=True)


MAP_CREDIT = (
    '<span class="cmap-credit">'
    '<a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a> '
    '&copy; <a href="https://www.openmaptiles.org/" rel="noopener">OpenMapTiles</a>, '
    'data from <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap</a>'
    '</span>')


def map_chrome(count, noun="courts"):
    """The control affordances from the approved design. Presentational until a
    tile provider is chosen; they are not wired to a live map yet, so they are
    rendered as disabled with an explicit note rather than as dead buttons."""
    from icons import icon
    return f"""<div class="cmap-ui" aria-hidden="true">
  <div class="cmap-tools">
    <span class="cmap-btn">{icon('search','i')}Search this area</span>
    <span class="cmap-btn">{icon('sliders','i')}Filters</span>
  </div>
  <div class="cmap-right"><span class="cmap-btn">{icon('locate','i')}Near me</span></div>
  <div class="cmap-zoom"><span class="cmap-zbtn">{icon('plus','i')}</span>
    <span class="cmap-zbtn">{icon('minus','i')}</span></div>
  <div class="cmap-card"><b>{count} {noun} in this area</b><span>Interactive map coming with the app launch</span></div>
</div>"""


def page(title, desc, canonical, body, extra_ld=None, indexable=False):
    return (f"<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n"
            f"{head(title, desc, canonical, extra_ld, indexable)}\n</head>\n<body>\n"
            f"{MASTHEAD}\n<main id=\"main\"><div class=\"wrap\">\n{body}\n</div></main>\n"
            f"{FOOTER}\n</body>\n</html>\n")
