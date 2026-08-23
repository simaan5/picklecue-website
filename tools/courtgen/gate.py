"""Publication gate for PickleCue court pages.

READ THIS BEFORE CHANGING ANYTHING HERE.

Two thirds of the `courts` table (14,903 of 22,312) was scraped from
PlayPickleball.com. Their Terms of Use, clause (xi), prohibits using any
"robot, spider, site search/retrieval application, or other manual or automatic
device or process to retrieve, index, 'data mine,' or in any way reproduce"
the site or its contents. That data must never reach a public page.

`Docs/COURTS_DATA_PIPELINE.md` already deprecated two sibling sources
(Pickleheads, Places2Play) for exactly this reason. PlayPickleball is the same
category and was not deprecated.

PUBLISHABLE = OpenStreetMap (ODbL, attribution required) + our own user
submissions. Nothing else. If a new source is added to the courts table it is
NOT publishable until someone confirms the licence and adds it here.
"""

PUBLISHABLE_SOURCES = ("osm", "user")

# ODbL requires attribution wherever OSM-derived data is publicly used.
#
# The OSM Foundation's attribution guidelines are more specific than "say the
# words". For browsable electronic media they ask for the credit
# "(c) OpenStreetMap contributors" and for that credit to be a LINK to
# openstreetmap.org/copyright, plus an indication of the licence. Plain prose
# naming ODbL — which is what this used to be — satisfies the spirit and fails
# the letter. Both links are now real anchors, and they appear on every
# generated page, not only the ones that happen to carry a map.
ODBL_ATTRIBUTION = (
    'Court locations include data &copy; '
    '<a href="https://www.openstreetmap.org/copyright" rel="noopener">'
    'OpenStreetMap contributors</a>, available under the '
    '<a href="https://opendatacommons.org/licenses/odbl/" rel="noopener">'
    'Open Database License (ODbL)</a>.'
)

# Stats we are allowed to render, and why. A stat is only listed here if the
# underlying column is populated well enough that the number means something.
#
#   courts        43/43 known           -> safe
#   free_to_play  43/43 known in Austin -> safe
#   dedicated     14/43 report a count  -> safe ONLY if the label says so
#   indoor        2/43 known            -> BANNED, 95% null
#   lights        2/43 true             -> BANNED, too sparse to be meaningful
#   verified      marks import source,  -> BANNED, never means "player verified"
#                 not a player action
BANNED_STATS = {
    "indoor": "indoor is null for ~95% of publishable rows",
    "lights": "only 520 of 22,312 rows nationally have lights=true",
    "verified": "verified marks the import source, not a player verification",
    "rating": "court_reviews is empty; there are no ratings",
    "reviews": "court_reviews is empty",
    "photos": "court_photos is empty",
    "hours": "open_play_schedule is null for every row",
    "amenities": "amenities populated on 6 rows out of 22,312",
}


def assert_publishable(rows):
    """Hard stop if a non-publishable source ever reaches the renderer."""
    bad = sorted({r["source"] for r in rows if r.get("source") not in PUBLISHABLE_SOURCES})
    if bad:
        raise SystemExit(
            f"PUBLICATION GATE: refusing to render. Non-publishable source(s): {bad}. "
            f"Only {PUBLISHABLE_SOURCES} may appear on a public page."
        )
    return rows


GENERIC_PREFIX = ("pickleball court", "tennis court")


def display_label(row):
    """An honest, readable label.

    88.9% of publishable rows carry OSM's generic tag ("Pickleball Courts -
    Austin, TX"), which would render a page of identical rows. Rules:

      1. A name containing " at " names a real place. Keep it.
         ("Pickleball Courts at Civitan Neighborhood Park")
      2. Any other name starting with a generic prefix is not a venue name.
         Describe the real location from the real address instead.
      3. Anything else is a real venue name. Keep it. ("Austin Pickle Ranch")

    We never invent a venue name. Returns (label, is_derived).
    """
    name = (row.get("name") or "").strip()
    addr = (row.get("address") or "").strip()
    low = name.lower()

    if " at " in low:
        return name, False
    if name and not any(low.startswith(g) for g in GENERIC_PREFIX):
        return name, False

    if not addr:
        return "Pickleball courts", True
    if addr[0].isdigit():
        return f"Pickleball courts, {addr}", True
    return f"Pickleball courts on {addr}", True
