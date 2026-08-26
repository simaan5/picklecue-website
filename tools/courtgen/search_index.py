"""Static search index for the public court directory.

WHY IT IS SHAPED LIKE THIS

The Courts page is a static SEO asset and must stay one — no SPA, no
authenticated RPC, no runtime backend. So search is a file, generated from the
same rows that generate the pages, and fetched only when somebody actually
searches.

Three rules decided the format:

1. **Nothing in the index that is not on a published page.** It is built from
   the eligible set `build_site.py` renders, so a result can never point at a
   URL that does not exist.

2. **No path repetition.** A naive row would carry
   "/courts/us/california/san-diego/..." 3,443 times. States and cities are
   listed once and courts reference them by position, so the state and city
   slugs appear once each instead of once per court.

3. **No field that is not needed to choose a result.** No descriptions, no
   coordinates, no photos, no reviews, no popularity score, and specifically
   no `verified` flag — that column marks the import source, not a checked
   place (see plan 091 in the iOS repo), and it has no business steering a
   search ranking.

Shape:

    {"v":1, "n":{"st":38,"ci":310,"co":3443},
     "st":[["California","california",574,46], ...],
     "ci":[[stateIdx,"San Diego","san-diego",40], ...],
     "co":[[cityIdx,"Balboa Park Courts","balboa-park-courts",8,1], ...]}

    st: name, slug, locations, cities
    ci: state index, name, slug, locations
    co: city index, label, slug, court count, free (1/0)

Paths are rebuilt client-side:
    /courts/us/{st.slug}
    /courts/us/{st.slug}/{ci.slug}
    /courts/us/{st.slug}/{ci.slug}/{co.slug}
"""
import json

from shell import slugify

INDEX_VERSION = 1


def build(eligible, states_full, out_path):
    """eligible: {(state_code, city): [rows]} — exactly what gets published."""
    by_state = {}
    for (st, city), rows in eligible.items():
        by_state.setdefault(st, []).append((city, rows))

    st_list, ci_list, co_list = [], [], []

    # States, biggest first, so a query that matches many things surfaces the
    # place most people mean.
    ordered_states = sorted(by_state.items(), key=lambda kv: -sum(len(r) for _, r in kv[1]))
    for st, cities in ordered_states:
        full = states_full[st]
        st_idx = len(st_list)
        st_list.append([full, slugify(full), sum(len(r) for _, r in cities), len(cities)])

        for city, rows in sorted(cities, key=lambda cr: -len(cr[1])):
            ci_idx = len(ci_list)
            ci_list.append([st_idx, city, slugify(city), len(rows)])

            for r in sorted(rows, key=lambda x: (x.get("label") or "").lower()):
                label = r.get("label") or "Pickleball courts"
                co_list.append([
                    ci_idx,
                    label,
                    slugify(r["slug"]),
                    int(r.get("court_count") or 0),
                    1 if r.get("is_free") else 0,
                ])

    payload = {
        "v": INDEX_VERSION,
        "n": {"st": len(st_list), "ci": len(ci_list), "co": len(co_list)},
        "st": st_list,
        "ci": ci_list,
        "co": co_list,
    }
    # separators= drops the space after every comma and colon: on 3,443 rows
    # that is real bytes, and nothing reads this by hand.
    text = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8")), payload["n"]
