#!/usr/bin/env python3
"""Generate /licenses.html — the third-party notices page.

Why this exists rather than a line in the footer:

  MapLibre GL JS is BSD 3-Clause. Clause 2 does not ask us to link to the
  licence, it asks us to REPRODUCE it "in the documentation and/or other
  materials provided with the distribution". We self-host the library, so we
  are the distributor. A URL in a comment header is a pointer, not a copy.

  Lucide is ISC: "The above copyright notice and this permission notice shall
  be included in all copies or substantial portions of the Software." We inline
  its icon paths into every generated page.

  The three fonts are SIL OFL 1.1, which requires the copyright notice and the
  licence to travel WITH the font files whenever they are redistributed.
  Self-hosting woff2 files is redistribution.

None of these are onerous and all three were unmet. This page embeds the real
licence texts, fetched from each project's own repository rather than typed
from memory, and the files themselves ship next to the assets they cover.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import shell as S  # noqa: E402

SITE = Path("/Volumes/Mini Drive 2/Xcode Projects/picklecue-website")

# (heading, what it is / where it is used, licence name, path to licence text)
ITEMS = [
    ("MapLibre GL JS 5.6.0",
     "Renders the interactive map on court pages. Self-hosted at "
     "<code>/assets/vendor/maplibre-gl.js</code>, so no third-party script "
     "origin is involved. Its licence file also carries the notices for the "
     "Mapbox, Evan Wallace and Mike Bostock code it bundles.",
     "BSD 3-Clause", "assets/vendor/LICENSE-maplibre.txt",
     "https://maplibre.org"),

    ("Lucide icons",
     "The small line icons used across the court pages. The paths are inlined "
     "into the HTML rather than loaded as a font or sprite.",
     "ISC", "assets/vendor/LICENSE-lucide.txt",
     "https://lucide.dev"),

    ("Instrument Sans",
     "The interface typeface. Self-hosted woff2.",
     "SIL Open Font License 1.1", "fonts/LICENSE-instrument-sans.txt",
     "https://github.com/Instrument/instrument-sans"),

    ("Fraunces",
     "The display typeface. Self-hosted woff2.",
     "SIL Open Font License 1.1", "fonts/LICENSE-fraunces.txt",
     "https://github.com/undercasetype/Fraunces"),

    ("JetBrains Mono",
     "The monospace typeface. Self-hosted woff2.",
     "SIL Open Font License 1.1", "fonts/LICENSE-jetbrains-mono.txt",
     "https://github.com/JetBrains/JetBrainsMono"),
]

DATA = """
<section class="csec"><h2>Map and court data</h2>
  <p class="cnote">Court locations published on this site come from
  <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap
  contributors</a> and from people who submitted a court through PickleCue.
  OpenStreetMap data is made available under the
  <a href="https://opendatacommons.org/licenses/odbl/" rel="noopener">Open
  Database License (ODbL)</a>: you are free to copy, distribute and adapt it,
  provided you credit OpenStreetMap contributors and keep any adapted database
  under the same licence. OpenStreetMap is a trademark of the OpenStreetMap
  Foundation; this site is neither endorsed by nor affiliated with it.</p>

  <p class="cnote">Not every court in the PickleCue app appears here. Records
  whose licence does not permit republication are excluded from this website by
  a check that runs before any page is rendered, and the weekly rebuild fails
  rather than publishing if that check does not hold. How the published set is
  chosen, and which figures we will and will not put on a page, is written out
  on <a href="/courts/methodology">how we count courts</a>.</p>

  <p class="cnote">Map tiles are served by
  <a href="https://openfreemap.org" rel="noopener">OpenFreeMap</a> and built with
  <a href="https://www.openmaptiles.org/" rel="noopener">OpenMapTiles</a> from
  that same OpenStreetMap data. Tiles are fetched by your browser when a map
  scrolls into view, which means your IP address reaches OpenFreeMap. They set no
  cookies and we send them nothing else about you. If you never scroll a map into
  view, or your browser cannot run WebGL, no request is made at all and the page
  shows a static map drawn on our own server instead. The
  <a href="/privacy.html">privacy policy</a> covers this.</p>
</section>
"""


def main():
    body = ['<p class="ceyebrow">Legal</p>',
            "<h1>Third-party notices</h1>",
            '<p class="clede">The software, typefaces and data this site '
            'redistributes, and the licences they are redistributed under.</p>',
            DATA,
            '<section class="csec"><h2>Software and typefaces</h2>']

    for name, use, lic, path, home in ITEMS:
        text = (SITE / path).read_text(encoding="utf-8").strip()
        body.append(
            f'<details class="lic"><summary><b>{S.esc(name)}</b>'
            f'<span>{S.esc(lic)}</span></summary>'
            f'<p class="cnote">{use} '
            f'<a href="{S.esc(home)}" rel="noopener">Project home</a>. '
            f'The same text ships at <code>/{S.esc(path)}</code>.</p>'
            f'<pre class="lictext">{S.esc(text)}</pre></details>')

    body.append("</section>")
    body.append(
        '<section class="csec"><h2>Reporting a problem</h2>'
        '<p class="cnote">If you believe something on this site is published '
        'without the right to publish it, or attributed incorrectly, write to '
        '<a href="mailto:privacy@picklecue.com">privacy@picklecue.com</a> and '
        'say which page and which record. We would rather remove it and be '
        'wrong about the need than leave it up and be wrong about the right.</p>'
        "</section>")

    out = SITE / "licenses.html"
    out.write_text(S.page(
        "Third-party notices · PickleCue",
        "Licences for the software, typefaces and map data PickleCue's website "
        "redistributes, including OpenStreetMap, MapLibre, Lucide and the SIL "
        "Open Font License typefaces.",
        "https://www.picklecue.com/licenses.html",
        "\n".join(body), indexable=True), encoding="utf-8")
    print(f"  wrote {out.name} ({out.stat().st_size // 1024} KB, "
          f"{len(ITEMS)} licence texts embedded)")


if __name__ == "__main__":
    main()
