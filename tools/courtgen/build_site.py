#!/usr/bin/env python3
"""Build the whole PickleCue court site.

One fetch of every publishable court, grouped in memory, then rendered to the
real route shape so Cloudflare Pages serves clean URLs:

    courts/methodology.html          -> /courts/methodology
    courts/us/texas.html             -> /courts/us/texas
    courts/us/texas/austin.html      -> /courts/us/texas/austin
    courts/us/texas/austin/all.html  -> /courts/us/texas/austin/all

Court DETAIL pages are deliberately not generated in bulk. With no photos,
hours, amenities or reviews, 7,409 of them would be thin duplicates and a
sitewide quality risk. They come back when the app has filled those fields.

Everything renders noindex unless --index is passed. Even then, only city and
state pages become indexable.
"""
import argparse
import shutil
from collections import defaultdict
from pathlib import Path

import pages as P
import shell as S
from gate import PUBLISHABLE_SOURCES

SITE = Path("/Volumes/Mini Drive 2/Xcode Projects/picklecue-website")
ROOT = SITE / "courts"

# Labels that are not cities. Publishing "Pickleball courts in Travis County"
# reads as a data error and competes with the real city page.
NOT_A_CITY = ("county", "township", "borough", "parish", "municipality",
              "unorganized", "census area")

STATES = {
 "AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California",
 "CO":"Colorado","CT":"Connecticut","DE":"Delaware","FL":"Florida","GA":"Georgia",
 "HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas",
 "KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts",
 "MI":"Michigan","MN":"Minnesota","MS":"Mississippi","MO":"Missouri","MT":"Montana",
 "NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico",
 "NY":"New York","NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma",
 "OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina",
 "SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont",
 "VA":"Virginia","WA":"Washington","WV":"West Virginia","WI":"Wisconsin","WY":"Wyoming",
 "DC":"District of Columbia",
}

MIN_COURTS = 5


def is_city(name):
    low = (name or "").lower()
    return bool(name) and not any(w in low for w in NOT_A_CITY)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", action="store_true",
                    help="make city and state pages indexable (court detail stays noindex)")
    ap.add_argument("--limit", type=int, default=0, help="only build N cities (smoke test)")
    a = ap.parse_args()

    print("Fetching every publishable court once...")
    rows = P.label_all(S.courts())
    print(f"  {len(rows):,} courts, sources {sorted({r['source'] for r in rows})}\n")

    by_city = defaultdict(list)
    for r in rows:
        st, ct = r.get("state"), r.get("city")
        if st in STATES and is_city(ct):
            by_city[(st, ct)].append(r)

    eligible = {k: v for k, v in by_city.items() if len(v) >= MIN_COURTS}
    by_state = defaultdict(list)
    for (st, ct), v in eligible.items():
        by_state[st].extend(v)

    skipped = sorted({c for (s, c), v in by_city.items()
                      if len(v) >= MIN_COURTS and not is_city(c)})
    print(f"  cities to build : {len(eligible)}")
    print(f"  states to build : {len(by_state)}\n")

    if ROOT.exists():
        shutil.rmtree(ROOT)
    ROOT.mkdir(parents=True)

    # Patch the renderers to write into the real route shape.
    P.STATE_FULL = STATES
    written = []

    items = sorted(eligible.items(), key=lambda kv: -len(kv[1]))
    if a.limit:
        items = items[:a.limit]

    for (st, ct), crows in items:
        sf = STATES[st]
        d = ROOT / "us" / S.slugify(sf)
        d.mkdir(parents=True, exist_ok=True)
        (d / S.slugify(ct)).mkdir(parents=True, exist_ok=True)

        P.OUT = d
        p_city, _, _ = P.build_city_from(ct, st, sf, crows,
                                         out=d / f"{S.slugify(ct)}.html",
                                         indexable=a.index,
                                         near_rows=by_state[st])
        p_dir = P.build_directory_from(ct, st, sf, crows,
                                       out=d / S.slugify(ct) / "all.html",
                                       indexable=a.index)
        written += [p_city, p_dir]

    for st, srows in sorted(by_state.items(), key=lambda kv: -len(kv[1])):
        if a.limit and not any(k[0] == st for k, _ in items):
            continue
        sf = STATES[st]
        p = P.build_state_from(st, sf, srows,
                               out=ROOT / "us" / f"{S.slugify(sf)}.html",
                               indexable=a.index)
        written.append(p)

    # Court detail pages for every court in a built city. They stay noindex
    # (thin without photos or reviews) but they must EXIST, because the city
    # and directory pages link to each one.
    for (st, ct), crows in items:
        sf = STATES[st]
        d = ROOT / "us" / S.slugify(sf) / S.slugify(ct)
        for r in crows:
            written.append(P.build_court_to(r, ct, st, sf, crows,
                                            d / f"{S.slugify(r['slug'])}.html"))

    state_cards = []
    for st, srows in by_state.items():
        if a.limit and not any(k[0] == st for k, _ in items):
            continue
        ncities = len({k[1] for k in eligible if k[0] == st})
        state_cards.append((STATES[st], len(srows), ncities))

    written.append(P.build_index(state_cards, sum(c[1] for c in state_cards),
                                 len(eligible), ROOT / "us.html",
                                 indexable=a.index, us=True))
    written.append(P.build_index(state_cards, sum(c[1] for c in state_cards),
                                 len(eligible), ROOT / "index.html",
                                 indexable=a.index, us=False))

    published_total = sum(c[1] for c in state_cards)
    p_meth = P.build_methodology_to(len(rows), published_total, len(eligible),
                                    ROOT / "methodology.html", indexable=a.index)
    written.append(p_meth)

    # ---- sitemap ----------------------------------------------------------
    # Only what is indexable goes in. Court detail pages are noindex, so listing
    # them would ask Google to crawl 2,149 pages it is told to ignore.
    if a.index:
        urls = ["/courts/", "/courts/us", "/courts/methodology"]
        urls += [f"/courts/us/{S.slugify(STATES[st])}" for st in sorted(by_state)]
        urls += [f"/courts/us/{S.slugify(STATES[st])}/{S.slugify(ct)}"
                 for (st, ct) in sorted(eligible)]
        frag = "\n".join(
            f"  <url>\n    <loc>https://www.picklecue.com{u}</loc>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>{'0.7' if u.count('/') <= 3 else '0.6'}</priority>\n  </url>"
            for u in urls)
        sm = SITE / "sitemap.xml"
        txt = sm.read_text(encoding="utf-8")
        start, end = "<!-- courts:start -->", "<!-- courts:end -->"
        block = f"{start}\n{frag}\n  {end}"
        if start in txt:
            import re as _re
            txt = _re.sub(_re.escape(start) + r".*?" + _re.escape(end), block, txt, flags=_re.S)
        else:
            txt = txt.replace("</urlset>", f"  {block}\n</urlset>")
        sm.write_text(txt, encoding="utf-8")
        print(f"  sitemap: {len(urls)} court URLs written")

    total_kb = sum(p.stat().st_size for p in written) // 1024
    print(f"  wrote {len(written)} pages, {total_kb:,} KB total")
    print(f"  indexable: {'city + state' if a.index else 'nothing (all noindex)'}")
    if skipped:
        print(f"\n  skipped {len(skipped)} non-city labels: {', '.join(skipped[:6])}"
              f"{' ...' if len(skipped) > 6 else ''}")
    return written


if __name__ == "__main__":
    main()
