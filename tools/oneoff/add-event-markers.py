#!/usr/bin/env python3
"""One-shot: insert the EVENT:* lifecycle markers into the event page and the
community card. Kept in the repo so the markup change is reproducible and
reviewable rather than a pile of hand edits nobody can replay.

Idempotent: exits 0 with "already marked" if the markers are already there.
"""
import pathlib, re, sys

P = pathlib.Path('events/pickle-for-a-purpose/index.html')
C = pathlib.Path('community.html')
s = P.read_text()
if 'EVENT:JSONLD' in s:
    print('already marked'); sys.exit(0)

def sub(pat, rep, n=1):
    global s
    s2, c = re.subn(pat, rep, s, count=n)
    if c != n: sys.exit(f'FAILED: {pat[:70]} (matched {c}, wanted {n})')
    s = s2

# Machine-readable state: gates read it, tests read it, and the "nothing looks
# purchasable" CSS keys off it.
sub(r'<body data-audience="event">', '<body data-audience="event" data-event-state="upcoming-unavailable">')

# The whole SportsEvent node is generated. JSON has no comments, so the markers
# wrap the <script> tag rather than living inside it.
sub(r'\n  <script type="application/ld\+json">\n[\s\S]*?\n  </script>\n',
    '\n  <!-- EVENT:JSONLD --><!-- /EVENT:JSONLD -->\n')

# One sentence, three copies, all state-dependent.
sub(r'\n  <meta name="description" content="[^"]*">', '\n  <!-- EVENT:META --><!-- /EVENT:META -->')
sub(r'\n  <meta property="og:description" content="[^"]*">', '')
sub(r'\n  <meta name="twitter:description" content="[^"]*">', '')

# Hero status line and both visible CTA labels.
sub(r'(<p class="cta-note">)<strong>Registration is currently[\s\S]*?(</p>)',
    r'\1<!-- EVENT:STATUS --><!-- /EVENT:STATUS -->\2')
sub(r'(data-placement="hero">\n            )View official event page',
    r'\1<!-- EVENT:CTA -->View official event page<!-- /EVENT:CTA -->')
sub(r'(data-placement="pricing">\n          )View official event page',
    r'\1<!-- EVENT:CTA -->View official event page<!-- /EVENT:CTA -->')

# Section framing that reads forward-looking once the event is over.
sub(r'<h2 id="expect-title">What to expect</h2>',
    '<h2 id="expect-title"><!-- EVENT:EXPECT_HEAD -->What to expect<!-- /EVENT:EXPECT_HEAD --></h2>')
sub(r'<span>Register solo or bring a partner</span>',
    '<span><!-- EVENT:ENTRY_CARD -->Register solo or bring a partner<!-- /EVENT:ENTRY_CARD --></span>')
# The whole <div> goes, not just its contents — an empty callout is a stray box.
sub(r'\n      <div class="callout">\n        <strong>No partner\?[\s\S]*?\n      </div>',
    '\n      <!-- EVENT:CALLOUT --><!-- /EVENT:CALLOUT -->')
sub(r'<h3>Player registration includes</h3>',
    '<h3>Player registration <!-- EVENT:INCLUDES -->includes<!-- /EVENT:INCLUDES --></h3>')
sub(r'<h3>General admission includes</h3>',
    '<h3>General admission <!-- EVENT:INCLUDES -->includes<!-- /EVENT:INCLUDES --></h3>')
sub(r'<h2 id="pricing-title">Published prices</h2>',
    '<h2 id="pricing-title"><!-- EVENT:PRICING_HEAD -->Published prices<!-- /EVENT:PRICING_HEAD --></h2>')

# Prices come from observed offers, so a price cannot be edited on the page
# without being edited in the record first.
sub(r'(<div class="price-row">)\n        <div class="price">[\s\S]*?(\n      </div>\n      <!-- Prices re-verified)',
    r'\1<!-- EVENT:PRICES --><!-- /EVENT:PRICES -->\2')
sub(r'(<p class="limited" style="margin-top:16px">)<strong>Registration is currently[\s\S]*?(</p>)',
    r'\1<!-- EVENT:PRICING_NOTE --><!-- /EVENT:PRICING_NOTE -->\2')

# The sticky bar is emitted or omitted WHOLE: a display rule still ships the
# markup, and a screen reader still finds the link inside it.
sub(r'\n  <div class="sticky-cta" id="stickyCta" hidden>\n[\s\S]*?\n  </div>\n(  <script>)',
    r'\n  <!-- EVENT:STICKY --><!-- /EVENT:STICKY -->\n\1')

# The seam cover's end time comes from the record like everything else, and it
# stands down once the page has actually been rebuilt in the ended state —
# otherwise its rules hide the very paragraph explaining the event is over.
sub(r"var ENDS = new Date\('[^']*'\);",
    "var ENDS = new Date('<!-- EVENT:ENDSAT -->2026-08-29T20:00:00-07:00<!-- /EVENT:ENDSAT -->');")
sub(r"(\(function \(\) \{\n    var ENDS = new Date)",
    "(function () {\n    if (document.body.dataset.eventState === 'ended') return;   // page already rebuilt\n    var ENDS = new Date")

# Two ended treatments, for two different pages.
sub(re.escape("""    /* Once the event is over nothing on the page may look purchasable. */
    html.event-over .cta, html.event-over .cta-big, html.event-over .sticky-cta,
    html.event-over .price .amt small, html.event-over .limited{ display:none !important; }
    html.event-over .price{ opacity:.6; }"""),
    """    /* TWO ended treatments, for two different pages.

       .event-over is the SEAM: applied by script to a page still built as
       upcoming, in the hours between the final whistle and the next deploy.
       That page's copy is wrong, so its registration controls all go away.

       [data-event-state="ended"] is the BUILT page. Its copy is already past
       tense and its outbound link is the only place updates can come from, so
       the link stays; only what implies a purchase is softened. */
    html.event-over .cta, html.event-over .cta-big, html.event-over .sticky-cta,
    html.event-over .price .amt small, html.event-over .limited{ display:none !important; }
    html.event-over .price{ opacity:.6; }
    body[data-event-state="ended"] .price{ opacity:.72; }
    body[data-event-state="ended"] .price .amt small{ display:none; }""")

P.write_text(s)

c = C.read_text()
c, n = re.subn(r'(<h3>Pickle for a Purpose</h3>)',
    r'\1\n        <p class="ev-state"><!-- EVENT:CARD_STATUS -->Registration is currently unavailable on the organizer&rsquo;s site.<!-- /EVENT:CARD_STATUS --></p>', c, count=1)
assert n == 1, 'community card status anchor not found'
c, n = re.subn(r'(data-placement="card" data-audience="community">)View event(</a>)',
    r'\1<!-- EVENT:CARD_CTA -->View event<!-- /EVENT:CARD_CTA -->\2', c, count=1)
assert n == 1, 'community card CTA anchor not found'
C.write_text(c)

print(f'event page: {len(re.findall(r"<!-- EVENT:", s))} markers; community card: 2')
