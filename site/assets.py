# -*- coding: utf-8 -*-
"""Brand assets rebuilt as clean vectors from the supplied style sheet."""

# ---- gradient sprite, injected once per document -------------------------
SPRITE = ('<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'
 '<linearGradient id="bwG" x1="0" y1="0" x2="1" y2="1">'
 '<stop offset="0" stop-color="#8DF3B6"/><stop offset=".46" stop-color="#33C177"/>'
 '<stop offset="1" stop-color="#0C7B45"/></linearGradient>'
 '<linearGradient id="bwGf" x1="0" y1="0" x2="1" y2="0">'
 '<stop offset="0" stop-color="#fff" stop-opacity="0"/>'
 '<stop offset=".5" stop-color="#fff" stop-opacity=".8"/>'
 '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
 '<linearGradient id="bwI" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="24" y2="24">'
 '<stop offset="0" stop-color="#93F2BA"/><stop offset="1" stop-color="#25AE68"/></linearGradient>'
 '</defs></svg>')

# ---- the mark: a faceted ball in flight -----------------------------------
# A ten-sided ball (not a smooth circle — the straight facet edges match the
# faceted style used everywhere else on the site) with the classic soccer-ball
# centre panel, trailing three receding bars like a kicked ball's motion blur —
# football and forward motion in one shape, no letter required. Two renderings
# share the same geometry logic: SIMPLE is the ball alone, solid and bold
# enough to survive a 24px favicon; DETAILED adds the seam lines and the
# trail, for the one place — the homepage hero — big enough to carry them.

# -- simple: centred in its own box, no trail (header, footer, favicon) -----
_BALL_SIMPLE_OUTER = "M50 6 L75.86 14.4 L91.85 36.4 L91.85 63.6 L75.86 85.6 L50 94 L24.14 85.6 L8.15 63.6 L8.15 36.4 L24.14 14.4 Z"
_BALL_SIMPLE_INNER = "M59.99 36.25 L66.17 55.25 L50 67 L33.83 55.25 L40.01 36.25 Z"

# -- detailed: pushed up-right within a wider box, leaving room for the trail
_BALL_VB = 140
_BALL_OUTER = "M76 8 L99.51 15.64 L114.04 35.64 L114.04 60.36 L99.51 80.36 L76 88 L52.49 80.36 L37.96 60.36 L37.96 35.64 L52.49 15.64 Z"
_BALL_INNER = "M84.82 35.86 L90.27 52.64 L76 63 L61.73 52.64 L67.18 35.86 Z"
_BALL_SPOKES = (
    "M84.82 35.86 L88.36 9.96", "M84.82 35.86 L108.36 24.49",
    "M90.27 52.64 L116 48", "M90.27 52.64 L108.36 71.51",
    "M76 63 L88.36 86.04", "M76 63 L63.64 86.04",
    "M61.73 52.64 L43.64 71.51", "M61.73 52.64 L36 48",
    "M67.18 35.86 L43.64 24.49", "M67.18 35.86 L63.64 9.96",
)
# Three bars along one ray out of the ball's lower-left edge, shrinking and
# fading with distance — a receding kick trail, not a comet with no source.
_BALL_TRAIL_ORIGIN = (51.95, 83.65)
_BALL_TRAIL_UNIT = (-0.5592, 0.829)   # direction cosine of the trail ray
_BALL_TRAIL_BARS = ((0, 25, 7.5, 1), (26, 17, 6, .58), (45, 10, 4.5, .3))


def _ball_trail():
    ox, oy = _BALL_TRAIL_ORIGIN
    ux, uy = _BALL_TRAIL_UNIT
    bars = []
    for dist, length, w, op in _BALL_TRAIL_BARS:
        cx, cy = ox + ux * dist, oy + uy * dist
        bars.append(
            f'<rect x="{-length/2:.1f}" y="{-w/2:.1f}" width="{length}" height="{w}" '
            f'rx="{w/2:.1f}" fill="url(#bwG)" opacity="{op}" '
            f'transform="translate({cx:.1f} {cy:.1f}) rotate(34)"/>'
        )
    return "".join(bars)


def logo(cls="mk", grad="bwG", detail=False):
    """The ball mark. Detailed (seams + trail) only where it is large enough
    to read — the hero; everywhere else gets the bold, centred, trail-less cut
    that still reads at a 24px favicon. Either way a soft diagonal light sweeps
    across it every few seconds — restrained rather than constant, so it reads
    as a glint, not a spinner. Reduced-motion viewers get the static mark."""
    if detail:
        vb = _BALL_VB
        body = (f'<path d="{_BALL_OUTER}" fill="url(#{grad})"/>'
                f'<path d="{_BALL_INNER}" fill="#04150C" opacity=".16"/>'
                + "".join(f'<path d="{s}" stroke="#04150C" stroke-width="1.5" '
                          f'stroke-linecap="round" opacity=".5"/>' for s in _BALL_SPOKES)
                + _ball_trail())
        clip = _BALL_OUTER
    else:
        vb = 100
        body = (f'<path d="{_BALL_SIMPLE_OUTER}" fill="url(#{grad})"/>'
                f'<path d="{_BALL_SIMPLE_INNER}" fill="#04150C"/>')
        clip = _BALL_SIMPLE_OUTER
    return (f'<svg class="{cls}" viewBox="0 0 {vb} {vb}" aria-hidden="true">'
            f'<defs><clipPath id="bclip{cls}"><path d="{clip}"/></clipPath></defs>'
            f'{body}'
            f'<g clip-path="url(#bclip{cls})">'
            f'<rect class="shine" x="{-vb*0.3:.0f}" y="{-vb*0.2:.0f}" width="{vb*0.28:.0f}" '
            f'height="{vb*1.4:.0f}" fill="url(#bwGf)"/>'
            f'</g></svg>')


_ICON_SVG = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>"
   "<rect width='128' height='128' rx='28' fill='#07160E'/>"
   "<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
   "<stop offset='0' stop-color='#8DF3B6'/><stop offset='1' stop-color='#159A56'/></linearGradient>"
   "<g transform='translate(14 14)'>"
   "<path d='" + _BALL_SIMPLE_OUTER + "' fill='url(#g)'/>"
   "<path d='" + _BALL_SIMPLE_INNER + "' fill='#04150C'/></g></svg>")

# A raw '#' in a data: URI ends the URL and starts a fragment — everything
# after the first one (the background fill, here) was silently dropped, so
# every favicon this site has ever shipped, including the letter mark before
# this one, rendered as a blank or broken tab icon. '#' now goes through the
# same encoding pass as '<', '>' and '"' instead of being hand-encoded only
# at the two call sites someone happened to remember.
FAVICON = ("data:image/svg+xml,"
           + _ICON_SVG.replace('<', '%3C').replace('>', '%3E')
                       .replace('"', "'").replace('#', '%23'))

# ---- icon set ------------------------------------------------------------
_ICONS = {
 "players":   ('<circle cx="9.5" cy="7" r="3.6"/>'
               '<path d="M2.8 20.2c0-3.7 3-6.7 6.7-6.7 1 0 2 .2 2.9.7"/>'
               '<circle cx="17.6" cy="17.4" r="4.6"/><path d="M17.6 15.1v2.4l1.6 1"/>'),
 "clubs":     ('<circle cx="8.6" cy="8" r="3.2"/>'
               '<path d="M2.6 19.6c0-3.3 2.7-6 6-6s6 2.7 6 6"/>'
               '<circle cx="17" cy="9.6" r="2.5"/><path d="M15.6 14.4c3 .3 5.8 2.4 5.8 5.2"/>'),
 "agents":    ('<rect x="2.8" y="7.6" width="18.4" height="12.6" rx="2.2"/>'
               '<path d="M8.6 7.6V5.9a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.7"/>'
               '<path d="M2.8 13h18.4"/>'),
 "investors": ('<path d="M3 17.2l5.2-5.2 3.6 3.6L20.4 7"/>'
               '<path d="M14.9 7h5.5v5.5"/><path d="M3 21h18"/>'),
 "brands":    ('<path d="M3 10.2v3.6a1.6 1.6 0 0 0 1.6 1.6h2.6L13 19V5l-5.8 4H4.6A1.6 1.6 0 0 0 3 10.2z"/>'
               '<path d="M16.6 9.4a4 4 0 0 1 0 5.2"/><path d="M19 7a7.4 7.4 0 0 1 0 10"/>'),
 "legal":     ('<path d="M13.4 3H6.6A1.6 1.6 0 0 0 5 4.6v14.8A1.6 1.6 0 0 0 6.6 21H14"/>'
               '<path d="M13.4 3l4.6 4.6v2.6"/><path d="M13.4 3v4.6H18"/>'
               '<path d="M20.6 13.4l-6 6-2.6.7.7-2.6 6-6a1.35 1.35 0 0 1 1.9 1.9z"/>'),
 "financial": ('<ellipse cx="12" cy="6" rx="7" ry="2.9"/>'
               '<path d="M5 6v5c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9V6"/>'
               '<path d="M5 11v5c0 1.6 3.1 2.9 7 2.9s7-1.3 7-2.9v-5"/>'),
 "recruitment":('<circle cx="10.6" cy="10.6" r="6.6"/><path d="M15.3 15.3L21 21"/>'),
 "international":('<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3v18"/>'
               '<path d="M4.6 7.2h14.8"/><path d="M4.6 16.8h14.8"/>'
               '<path d="M12 3c2.7 2.4 4.2 5.6 4.2 9s-1.5 6.6-4.2 9c-2.7-2.4-4.2-5.6-4.2-9S9.3 5.4 12 3z"/>'),
 "relocation":('<path d="M21.5 2.5L10.6 13.4"/><path d="M21.5 2.5l-6.9 19.8-3.9-8.9-8.9-3.9z"/>'),
 "insurance": ('<path d="M12 2.6l8 3v6.1c0 4.5-3.2 8.5-8 9.9-4.8-1.4-8-5.4-8-9.9V5.6z"/>'
               '<path d="M8.7 11.9l2.4 2.4 4.6-4.6"/>'),
 "education": ('<path d="M2.6 8.6L12 4l9.4 4.6L12 13.2z"/>'
               '<path d="M6.6 10.6V16c0 1.7 2.4 3 5.4 3s5.4-1.3 5.4-3v-5.4"/><path d="M20.6 9.2v5.4"/>'),
 # contact rail
 "mail":  '<rect x="2.8" y="5.4" width="18.4" height="13.2" rx="2"/><path d="M3.4 6.6L12 13l8.6-6.4"/>',
 "phone": ('<path d="M6.4 3.4h3.1l1.5 3.9-2 1.5a12.4 12.4 0 0 0 6.2 6.2l1.5-2 3.9 1.5v3.1a2 2 0 0 1-2.1 2A17.2 17.2 0 0 1 4.4 5.5a2 2 0 0 1 2-2.1z"/>'),
 "pin":   '<path d="M12 21.4s6.9-6.1 6.9-10.9a6.9 6.9 0 1 0-13.8 0c0 4.8 6.9 10.9 6.9 10.9z"/><circle cx="12" cy="10.4" r="2.6"/>',
 "calendar":'<rect x="3.4" y="5" width="17.2" height="15.6" rx="2"/><path d="M3.4 10h17.2"/><path d="M8 3v4"/><path d="M16 3v4"/>',
 "arrow": '<path d="M3.6 12h15.8"/><path d="M13.4 6.2L19.6 12l-6.2 5.8"/>',
}

def icon(name, cls="ic"):
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="url(#bwI)" '
            f'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" '
            f'aria-hidden="true">{_ICONS[name]}</svg>')

# ---- the twelve service tiles from the style sheet -----------------------
GRID = [
 ("players",      "Players",       "Career &amp; life support",        "players"),
 ("clubs",        "Clubs",         "Talent &amp; business solutions",  "clubs"),
 ("agents",       "Agents",        "Operational support",              "agents"),
 ("investors",    "Investors",     "Football opportunities",           "investors"),
 ("brands",       "Brands",        "Marketing &amp; partnerships",     "brands"),
 ("legal",        "Legal",         "Coordination &amp; support",       "legal-coordination"),
 ("financial",    "Financial",     "Planning &amp; coordination",      "financial-wealth"),
 ("recruitment",  "Recruitment",   "Talent sourcing &amp; scouting",   "recruitment"),
 ("international","International", "Network",                          "network"),
 ("relocation",   "Relocation",    "Move. Settle. Play.",              "relocation"),
 ("insurance",    "Insurance",     "Protection for your future",       "player-support"),
 ("education",    "Education",     "Beyond football",                  "player-support"),
]
CONTACT_RAIL = ["mail","phone","pin","calendar","international","arrow"]
