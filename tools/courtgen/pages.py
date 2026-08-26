#!/usr/bin/env python3
"""Builders for the PickleCue court page family.

Built:  city landing, city directory, court detail, state hub, methodology.
NOT built, deliberately:
  - Open games in city / game detail. Those publish who is playing, where and
    when, about identifiable people, on indexable pages. CLAUDE.md section 9
    records that anon EXECUTE on nearby_games was revoked on 2026-08-03 for
    exactly this reason. Building them would reverse a documented control.
"""
from pathlib import Path

from gate import BANNED_STATS, display_label


def plural(n, one, many):
    """Five state cards shipped "1 cities". Counts come from live data, so
    every rendered count needs this, not just the ones that looked plural."""
    return one if n == 1 else many
from icons import STAT_ICON, icon
from shell import (MAP_CREDIT, attribution, courts, crumbs, esc, map_chrome,
                   map_payload, page, plot, slugify)

SITE = Path("/Volumes/Mini Drive 2/Xcode Projects/picklecue-website")
OUT = SITE  # prototypes land at the web root as _courts-*.html, noindex

STATE_FULL = {"TX": "Texas", "CA": "California", "NY": "New York", "FL": "Florida"}


def label_all(rows):
    for r in rows:
        r["label"], r["derived"] = display_label(r)
    return rows


def city_path(state_full, city):
    return f"/courts/us/{slugify(state_full)}/{slugify(city)}"


def stats_for(rows):
    """Only stats whose column is populated enough to mean something.
    indoor, lights, verified, ratings, photos and hours are banned in gate.py."""
    total = len(rows)
    free = sum(1 for r in rows if r.get("is_free") is True)
    paid = sum(1 for r in rows if r.get("is_free") is False)
    counted = [r for r in rows if r.get("court_count")]
    out = [(total, "Courts"), (free, "Free to play")]
    if counted:
        out.append((sum(r["court_count"] for r in counted), "Dedicated courts"))
    if paid:
        out.append((paid, "Clubs &amp; centers"))
    return out, total, free, paid, counted


def stat_block(stats):
    return ('<dl class="cstats">' + "".join(
        f'<div>{icon(STAT_ICON.get(lbl, "map-pin"), "sti")}'
        f'<dt>{lbl}</dt><dd>{val}</dd></div>' for val, lbl in stats) + '</dl>')


def court_row(r, href=None, city=""):
    n = r.get("court_count")
    meta = f'{n} courts' if n else ("Free" if r.get("is_free") else "Members")
    inner = (f'<span class="rn">{esc(r["label"])}'
             f'<em>{esc(r.get("address") or city)}</em></span>'
             f'<span class="rm">{meta}</span>')
    return f'<li><a href="{href}">{inner}</a></li>' if href else f'<li>{inner}</li>'


def court_card(r, href, city=""):
    n = r.get("court_count")
    badge = f'<span class="cnum">{n}</span>' if n else ""
    return (f'<a class="cc" href="{href}">{badge}'
            f'<span class="cc-art" aria-hidden="true"></span>'
            f'<span class="cc-body"><span class="cc-name">{esc(r["label"])}</span>'
            f'<span class="cc-addr">{esc(r.get("address") or city)}</span>'
            f'<span class="cc-go">View court {icon("arrow", "ai")}</span></span></a>')


# ---------------------------------------------------------------- city landing
def build_city(city, state):
    sf = STATE_FULL[state]
    rows = label_all(courts(city=f"eq.{city}", state=f"eq.{state}"))
    if not rows:
        raise SystemExit(f"no publishable courts for {city}")
    return build_city_from(city, state, sf, rows,
                           OUT / f"_courts-{slugify(city)}.html", False)


def build_city_from(city, state, sf, rows, out, indexable=False, near_rows=None):
    stats, total, free, paid, counted = stats_for(rows)
    ranked = sorted(rows, key=lambda r: (-(r.get("court_count") or 0), r["label"]))
    base = city_path(sf, city)
    cb, ld = crumbs([("Courts", "/courts/"), ("United States", "/courts/us"),
                     (sf, f"/courts/us/{slugify(sf)}"), (city, None)])
    svg, plotted = plot(rows)

    near = {}
    for r in (near_rows if near_rows is not None else courts(state=f"eq.{state}")):
        c = r.get("city")
        if c and c != city:
            near[c] = near.get(c, 0) + 1
    near = sorted(near.items(), key=lambda kv: -kv[1])[:6]

    free_rows = [r for r in ranked if r.get("is_free") is True][:8]
    paid_rows = [r for r in ranked if r.get("is_free") is False][:8]
    top = [r for r in ranked if r.get("court_count")][:4]

    body = f"""{cb}
<section class="chero">
  <div><p class="ceyebrow">Pickleball courts in</p>
  <h1>{esc(city)}, {esc(sf)}</h1>
  <p class="clede">{total} courts across {esc(city)}. {free} of them are free to play,
  with an address and a location for every one.</p></div>
  {stat_block(stats)}
</section>

<section class="cmap" aria-label="Court locations" data-courtmap="{map_payload(rows, base)}">{svg}{map_chrome(total)}
  <p class="cmap-note"><span><i class="dot-f"></i>Free to play</span>
  <span><i class="dot-p"></i>Club or paid</span>
  <span class="cmap-count">{plotted} of {total} mapped</span>{MAP_CREDIT}</p></section>

<section class="csec"><h2>Venues with the most courts</h2>
  <p class="cnote">These publish a court count, so you know what you are turning up to.</p>
  <div class="ccards">{"".join(court_card(r, f'{base}/{esc(slugify(r["slug"]))}', city) for r in top)}</div>
  <p class="ccount"><a class="clink" href="{base}/all">Browse all {total} courts in {esc(city)}</a></p>
</section>

<section class="csec ctwo">
  <div><h2>Free and open</h2><p class="cnote">Public parks and school courts.</p>
  <ul class="crows">{"".join(court_row(r, f'{base}/{esc(slugify(r["slug"]))}', city) for r in free_rows)}</ul>
  <p class="ccount">Showing {len(free_rows)} of {free} free courts.</p></div>
  <div><h2>Clubs &amp; centers</h2>
  <p class="cnote">{'Membership or a day rate applies.' if paid_rows else 'None recorded here yet.'}</p>
  <ul class="crows">{"".join(court_row(r, f'{base}/{esc(slugify(r["slug"]))}', city) for r in paid_rows)
      or '<li class="cempty">Nothing recorded yet. You can add one from inside PickleCue.</li>'}</ul>
  {f'<p class="ccount">Showing {len(paid_rows)} of {paid}.</p>' if paid_rows else ''}</div>
</section>

<section class="ccta"><div>
  <h2>Courts tell you where. PickleCue tells you who is playing.</h2>
  <p>Open games around {esc(city)}, skill levels and spots left, inside the app.</p></div>
  <a class="btn btn-primary" data-track="app_store_click" data-placement="final" data-audience="courts" href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a></section>

<section class="cnear"><h2>Pickleball near {esc(city)}</h2><ul>{"".join(
  f'<li><a href="{city_path(sf, c)}"><span>{esc(c)}</span><em>{n}</em></a></li>'
  for c, n in near)}</ul></section>
{attribution()}"""

    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page(f"Pickleball courts in {city}, {sf} | PickleCue",
                      f"{total} pickleball courts in {city}, {sf}. {free} are free to play. "
                      f"Addresses and locations for every one.", base, body, ld,
                      indexable), encoding="utf-8")
    return p, rows, sf


# ------------------------------------------------------------------- directory
def build_directory(city, state, rows, sf):
    return build_directory_from(city, state, sf, rows,
                                OUT / f"_courts-{slugify(city)}-all.html", False)


def build_directory_from(city, state, sf, rows, out, indexable=False):
    total = len(rows)
    free = sum(1 for r in rows if r.get("is_free") is True)
    paid = sum(1 for r in rows if r.get("is_free") is False)
    base = city_path(sf, city)
    cb, ld = crumbs([("Courts", "/courts/"), ("United States", "/courts/us"),
                     (sf, f"/courts/us/{slugify(sf)}"), (city, base), ("All courts", None)])
    ranked = sorted(rows, key=lambda r: (-(r.get("court_count") or 0), r["label"]))

    def drow(r):
        n = r.get("court_count")
        access = "Free" if r.get("is_free") else ("Members" if r.get("is_free") is False else "")
        return (f'<li class="drow" data-access="{"free" if r.get("is_free") else "paid"}" '
                f'data-name="{esc((r["label"] + " " + (r.get("address") or "")).lower())}" '
                f'data-courts="{n or 0}">'
                f'<a href="{base}/{esc(slugify(r["slug"]))}">'
                f'<span class="d-art" aria-hidden="true"></span>'
                f'<span class="d-main"><span class="d-name">{esc(r["label"])}</span>'
                f'<span class="d-addr">{esc(r.get("address") or city)}</span></span>'
                f'<span class="d-meta">{f"<b>{n}</b> courts" if n else "&nbsp;"}</span>'
                f'<span class="d-meta">{access}</span>'
                f'<span class="d-go" aria-hidden="true">&rarr;</span></a></li>')

    body = f"""{cb}
<section class="dhead">
  <h1>Pickleball courts in {esc(city)}, {esc(sf)}</h1>
  <p class="clede">Every court we have on record in {esc(city)}. Filter by cost, search by
  name or street, or sort by size.</p>
</section>

<div class="dbar">
  <div class="dtabs" role="group" aria-label="Filter by access">
    <button class="dtab is-on" data-filter="all">All courts <span>{total}</span></button>
    <button class="dtab" data-filter="free">Free to play <span>{free}</span></button>
    <button class="dtab" data-filter="paid">Clubs &amp; centers <span>{paid}</span></button>
  </div>
  <div class="dtools">
    <label class="dsearch"><span class="vh">Search courts</span>
      <input type="search" id="dq" placeholder="Search by name or street" autocomplete="off"></label>
    <label class="dsort"><span class="vh">Sort courts</span>
      <select id="dsort"><option value="courts">Most courts</option>
      <option value="name">Name</option></select></label>
  </div>
</div>

<p class="dcount" id="dcount" role="status">{total} courts</p>
<ul class="drows" id="drows">{"".join(drow(r) for r in ranked)}</ul>
<p class="dempty" id="dempty" hidden>No courts match that search.</p>
{attribution()}
<script>
/* Static page: every row is already in the HTML, so it stays crawlable.
   Filtering, search and sort are progressive enhancement over rendered rows. */
(function(){{
  var list=document.getElementById('drows'), q=document.getElementById('dq'),
      sort=document.getElementById('dsort'), count=document.getElementById('dcount'),
      empty=document.getElementById('dempty'),
      rows=[].slice.call(list.querySelectorAll('.drow')), filter='all';
  function apply(){{
    var term=(q.value||'').trim().toLowerCase(), shown=0;
    rows.forEach(function(r){{
      var ok=(filter==='all'||r.dataset.access===filter) &&
             (!term||r.dataset.name.indexOf(term)>-1);
      r.hidden=!ok; if(ok) shown++;
    }});
    count.textContent=shown+(shown===1?' court':' courts');
    empty.hidden=shown>0;
  }}
  document.querySelectorAll('.dtab').forEach(function(b){{
    b.addEventListener('click',function(){{
      document.querySelectorAll('.dtab').forEach(function(x){{x.classList.remove('is-on');
        x.setAttribute('aria-pressed','false');}});
      b.classList.add('is-on'); b.setAttribute('aria-pressed','true');
      filter=b.dataset.filter; apply();
    }});
    b.setAttribute('aria-pressed', b.classList.contains('is-on')?'true':'false');
  }});
  q.addEventListener('input',apply);
  sort.addEventListener('change',function(){{
    var by=sort.value;
    rows.sort(function(a,b){{
      if(by==='name') return a.dataset.name.localeCompare(b.dataset.name);
      return (+b.dataset.courts)-(+a.dataset.courts) ||
             a.dataset.name.localeCompare(b.dataset.name);
    }});
    rows.forEach(function(r){{list.appendChild(r);}});
  }});
}})();
</script>"""
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page(f"All pickleball courts in {city}, {sf} | PickleCue",
                      f"Browse all {total} pickleball courts in {city}, {sf}. Filter by cost, "
                      f"search by name or street.", base, body, ld,
                      indexable), encoding="utf-8")
    return p


# ---------------------------------------------------------------- court detail
def build_court(r, city, state, sf, siblings):
    return build_court_to(r, city, state, sf, siblings,
                          OUT / f"_court-{slugify(r['slug'])[:60]}.html")


def build_court_to(r, city, state, sf, siblings, out, indexable=False):
    base = city_path(sf, city)
    cb, ld = crumbs([("Courts", "/courts/"), ("United States", "/courts/us"),
                     (sf, f"/courts/us/{slugify(sf)}"), (city, base), (r["label"], None)])
    svg, _ = plot([r] + [s for s in siblings if s["id"] != r["id"]][:40], maxh=300, focus=r["id"])
    n = r.get("court_count")

    facts = []
    if n:
        facts.append((n, "Dedicated courts", "Published by the venue"))
    if r.get("is_free") is True:
        facts.append(("Free", "Always free", "No membership or booking"))
    elif r.get("is_free") is False:
        facts.append(("Members", "Membership or day rate", "Check with the venue"))
    # indoor, lights, hours, amenities, photos and ratings are all banned in
    # gate.py: unknown is not the same as no, so they are omitted entirely.

    nearby_rows = [s for s in siblings if s["id"] != r["id"]][:6]
    derived_note = ('<p class="cnote">This venue is not individually named in our source data, '
                    'so we describe it by its street.</p>' if r["derived"] else '')

    body = f"""{cb}
<section class="vhero">
  <div class="vhero-art" aria-hidden="true"></div>
  <div class="vhero-body">
    <h1>{esc(r["label"])}</h1>
    <p class="vaddr">{esc(r.get("address") or "")}{", " if r.get("address") else ""}{esc(city)}, {esc(state)}</p>
    <div class="vbadges">{"".join(
      f'<span class="vbadge">{esc(b)}</span>' for b in
      ([f'{n} courts'] if n else []) +
      (['Free to play'] if r.get("is_free") is True else
       ['Membership'] if r.get("is_free") is False else []))}</div>
  </div>
</section>

<section class="csec"><h2>About this venue</h2>
  {derived_note}
  <div class="vfacts">{"".join(
    f'<div><b>{esc(v)}</b><span>{esc(t)}</span><em>{esc(sub)}</em></div>'
    for v, t, sub in facts) or '<p class="cnote">We only have a location for this one so far.</p>'}</div>
</section>

<section class="csec"><h2>Where it is</h2>
  <div class="cmap vmap">{svg}
  <p class="cmap-note"><span><i class="dot-s"></i>This venue</span>
  <span><i class="dot-f"></i>Other courts nearby</span></p></div>
</section>

<section class="csec"><h2>Open games here</h2>
  <div class="vempty">
    <p>Open games, skill levels and spots left live inside PickleCue. We do not publish
    who is playing on the open web.</p>
    <a class="btn btn-primary" data-track="app_store_click" data-placement="final" data-audience="courts" href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a>
  </div>
</section>

<section class="cnear"><h2>Other courts in {esc(city)}</h2>
  <ul class="crows vlist">{"".join(court_row(s, f'{base}/{esc(slugify(s["slug"]))}', city) for s in nearby_rows)}</ul>
  <p class="ccount"><a class="clink" href="{base}/all">All courts in {esc(city)}</a></p>
</section>
{attribution()}"""
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page(f"{r['label']} | PickleCue",
                      f"{r['label']} in {city}, {sf}." +
                      (f" {n} dedicated pickleball courts." if n else "") +
                      " Location, access and nearby courts.",
                      f"{base}/{slugify(r['slug'])}", body, ld, indexable), encoding="utf-8")
    return p


# -------------------------------------------------------------------- state hub
def build_state(state):
    sf = STATE_FULL[state]
    rows = label_all(courts(state=f"eq.{state}"))
    return build_state_from(state, sf, rows,
                            OUT / f"_courts-state-{slugify(sf)}.html", False)


def build_state_from(state, sf, rows, out, indexable=False):
    by_city = {}
    for r in rows:
        c = r.get("city")
        if c:
            by_city.setdefault(c, []).append(r)
    ranked = sorted(by_city.items(), key=lambda kv: -len(kv[1]))
    stats, total, free, paid, counted = stats_for(rows)
    cb, ld = crumbs([("Courts", "/courts/"), ("United States", "/courts/us"), (sf, None)])
    svg, plotted = plot(rows, maxh=430, r=4)

    body = f"""{cb}
<section class="chero">
  <div><p class="ceyebrow">Pickleball in</p><h1>{esc(sf)}</h1>
  <p class="clede">{total} court locations across {len(by_city)} {plural(len(by_city), "city or town", "cities and towns")} in {esc(sf)},
  {free} of them free to play.</p></div>
  {stat_block(stats)}
</section>

<section class="cmap" aria-label="Courts across {esc(sf)}" data-courtmap="{map_payload(rows)}">{svg}{map_chrome(total)}
  <p class="cmap-note"><span><i class="dot-f"></i>Free to play</span>
  <span><i class="dot-p"></i>Club or paid</span>
  <span class="cmap-count">{plotted} of {total} mapped</span>{MAP_CREDIT}</p></section>

<section class="csec"><h2>Cities with the most courts</h2>
  <p class="cnote">Every city we have court records for in {esc(sf)}.</p>
  <ul class="scities">{"".join(
    f'<li><a href="{city_path(sf, c)}"><b>{len(v)}</b><span>{esc(c)}</span>'
    f'<em>{sum(1 for x in v if x.get("is_free"))} free</em></a></li>'
    for c, v in ranked[:24])}</ul>
</section>

<section class="ccta"><div>
  <h2>Courts tell you where. PickleCue tells you who is playing.</h2>
  <p>Open games across {esc(sf)}, skill levels and spots left, inside the app.</p></div>
  <a class="btn btn-primary" data-track="app_store_click" data-placement="final" data-audience="courts" href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a></section>
{attribution()}"""
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page(f"Pickleball courts in {sf} | PickleCue",
                      f"{total} pickleball court locations across {len(by_city)} "
                      f"{plural(len(by_city), 'city', 'cities')} in {sf}. "
                      f"{free} are free to play.", f"/courts/us/{slugify(sf)}", body, ld,
                      indexable), encoding="utf-8")
    return p


# ------------------------------------------------------------------ methodology
def build_methodology(total_pub, cities_pub):
    return build_methodology_to(total_pub, cities_pub, OUT / "_courts-methodology.html")


def build_methodology_to(pool_total, published_total, cities_pub, out, indexable=False):
    cb, ld = crumbs([("Courts", "/courts/"), ("How we count courts", None)])
    banned = "".join(f"<li><b>{esc(k)}</b> {esc(v)}</li>" for k, v in sorted(BANNED_STATS.items()))
    body = f"""{cb}
<section class="chero mhero">
  <div><p class="ceyebrow">Court data</p><h1>How we count courts</h1>
  <p class="clede">PickleCue is built by players. Here is exactly where court
  information comes from, what we will and will not claim about it, and how to
  correct it.</p></div>
</section>

<section class="csec"><h2>Where this data comes from</h2>
  <p class="cnote">Every court on these pages comes from one of two places.</p>
  <div class="msrc">
    <div><h3>OpenStreetMap</h3>
      <p>Community mapped, published under the Open Database License. This is the
      large majority of what you see here. We import it, we do not edit the
      original.</p></div>
    <div><h3>PickleCue players</h3>
      <p>Courts submitted from inside the app by people who play on them. These
      start at a low confidence score and rise as others confirm them.</p></div>
  </div>
  <p class="cnote">We publish {published_total:,} court locations across
  {cities_pub} {plural(cities_pub, "city", "cities")} here. The app holds
  {pool_total:,} — the difference is smaller towns that do not yet have enough
  courts to justify a page of their own.</p>
</section>

<section class="csec"><h2>What we will not claim</h2>
  <p class="cnote">A field being empty is not the same as the answer being no. Where
  we do not know something, we leave it out rather than guess. These are the
  things we deliberately do not show on a court page, and why.</p>
  <ul class="mlist">{banned}</ul>
</section>

<section class="csec"><h2>How a court gets named</h2>
  <p class="cnote">Most public courts are not individually named in the source data.
  Where a venue has a real name we use it. Where it does not, we describe it by
  its street, for example "Pickleball courts on Lost Creek Boulevard". We never
  invent a venue name.</p>
</section>

<section class="csec"><h2>Corrections</h2>
  <p class="cnote">Court details change. Nets come down, gates get locked, fees
  appear. If something here is wrong you can correct it from inside PickleCue,
  and the correction is reviewed before it goes live.</p>
</section>

<section class="csec"><h2>Licensing and attribution</h2>
  <p class="cnote">Court locations include data &copy;
  <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap
  contributors</a>, available under the
  <a href="https://opendatacommons.org/licenses/odbl/" rel="noopener">Open
  Database License (ODbL)</a>. OpenStreetMap is a trademark of the OpenStreetMap
  Foundation, and this site is not endorsed by or affiliated with it.</p>

  <p class="cnote">The map is rendered by
  <a href="https://maplibre.org" rel="noopener">MapLibre GL JS</a> (BSD 3-Clause)
  over vector tiles from <a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a>,
  built with <a href="https://www.openmaptiles.org/" rel="noopener">OpenMapTiles</a>
  from that same OpenStreetMap data. Loading the map sends a request from your
  browser to OpenFreeMap, so your IP address reaches them; the
  <a href="/privacy">privacy policy</a> says what that does and does not
  involve. Icons are from <a href="https://lucide.dev" rel="noopener">Lucide</a>
  (ISC). Full licence texts for everything this site redistributes are on the
  <a href="/licenses">third-party notices</a> page.</p>
</section>

<section class="ccta"><div><h2>Found something wrong?</h2>
  <p>Corrections come from players. That is the only way court data stays true.</p></div>
  <a class="btn btn-primary" data-track="app_store_click" data-placement="final" data-audience="courts" href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a></section>"""
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page("How we count courts | PickleCue",
                      "Where PickleCue court data comes from, what we will and will not "
                      "claim about it, and how to correct it.",
                      "/courts/methodology", body, ld, indexable), encoding="utf-8")
    return p


# ------------------------------------------------------- /courts and /courts/us
def build_index(states, total, cities_n, out, indexable=False, us=False):
    """Country hub (/courts/us) and site root (/courts). Breadcrumbs on every
    city and state page point here, so these must exist or 448 pages link to a
    404."""
    if us:
        cb, ld = crumbs([("Courts", "/courts/"), ("United States", None)])
        title, h1 = "Pickleball courts in the United States | PickleCue", "United States"
        canon = "/courts/us"
    else:
        cb, ld = crumbs([("Courts", None)])
        title, h1 = "Pickleball courts | PickleCue", "Pickleball courts"
        canon = "/courts/"

    cards = "".join(
        f'<li><a href="/courts/us/{slugify(sf)}"><b>{n}</b><span>{esc(sf)}</span>'
        f'<em>{c} {plural(c, "city", "cities")}</em></a></li>'
        for sf, n, c in sorted(states, key=lambda x: -x[1]))

    # A-Z jump list. Plain anchors to the same cards, so a reader who thinks
    # alphabetically and a reader who thinks "biggest first" both get a path,
    # and neither needs JavaScript.
    az = "".join(
        f'<a href="#st-{slugify(sf)}">{esc(sf)}</a>'
        for sf, _, _ in sorted(states, key=lambda x: x[0]))

    cards = "".join(
        f'<li id="st-{slugify(sf)}"><a href="/courts/us/{slugify(sf)}">'
        f'<b>{n:,}</b><span>{esc(sf)}</span>'
        f'<em>court locations &middot; {c} {plural(c, "city", "cities")}</em></a></li>'
        for sf, n, c in sorted(states, key=lambda x: -x[1]))

    body = f"""{cb}
<section class="chero csearch-hero">
  <div class="csearch-copy">
    <p class="ceyebrow">Where to play</p>
    <h1>Know where to play before you leave.</h1>
    <p class="clede">{total:,} court locations across {cities_n} cities and {len(states)} states,
    every one with an address you can navigate to. Search a court, a city or a state.</p>
  </div>

  <form class="csearch" id="courtSearch" role="search" autocomplete="off">
    <label for="courtSearchInput">Search courts, cities and states</label>
    <div class="csearch-field">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z"/></svg>
      <input id="courtSearchInput" type="search" name="q"
             placeholder="Austin, California, or a court name"
             role="combobox" aria-expanded="false" aria-controls="courtSearchResults"
             aria-autocomplete="list" aria-describedby="courtSearchHint">
      <button type="submit">Search</button>
    </div>
    <p class="csearch-hint" id="courtSearchHint">Every result is a page on this site, not a login.</p>
    <div class="csearch-results" id="courtSearchResults" hidden></div>
    <p class="csearch-status" id="courtSearchStatus" role="status" aria-live="polite"></p>
  </form>
</section>

<section class="cbridge">
  <div class="cbridge-copy">
    <p class="ceyebrow">Why the app</p>
    <h2>These pages tell you where. PickleCue tells you what happens next.</h2>
    <p class="cnote">A directory ends at an address. In the app the same venue carries
    the detail that decides whether you drive over &mdash; how many courts, indoor or
    out, free or paid &mdash; plus directions, check-in, the court&rsquo;s chat, and a
    game you can host right there.</p>
    <p class="cnote"><a class="btn btn-primary" data-track="app_store_click"
      data-placement="mid" data-audience="courts"
      href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a></p>
  </div>
  <figure class="cbridge-shot">
    <img src="/images/app/courts-detail.webp" width="760" height="1651" loading="lazy" decoding="async"
         alt="A venue in PickleCue: eight courts, indoor and outdoor, paid, with the address, directions, check-in, court chat and a button to host a game here.">
  </figure>
</section>

<section class="csec" id="browse"><h2>Browse by state</h2>
  <p class="cnote">Every state we have court records for, largest first. Counts are
  court <em>locations</em> &mdash; a park or club, which may hold several courts.</p>
  <nav class="saz" aria-label="Jump to a state">{az}</nav>
  <ul class="scities">{cards}</ul>
</section>

<section class="ccta"><div>
  <h2>Courts tell you where. PickleCue tells you who is playing.</h2>
  <p>Open games, skill levels and spots left, inside the app.</p></div>
  <a class="btn btn-primary" data-track="app_store_click" data-placement="final" data-audience="courts" href="https://apps.apple.com/us/app/picklecue-pickleball/id6757326631">Download on iPhone</a></section>
{attribution()}"""
    p = Path(out)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(page(title,
                      f"{total:,} pickleball court locations across {cities_n} cities. "
                      f"Search by court, city or state.", canon, body, ld,
                      indexable, search=True), encoding="utf-8")
    return p
