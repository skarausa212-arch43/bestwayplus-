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

# ---- the B monogram --------------------------------------------------------
# Outer silhouette: a stem plus two angular bowls, chamfered corners at top and
# bottom to match the brand's faceted style. The two counters (the "windows"
# that make it read as a B rather than a wedge) are true rounded ellipses, not
# the pointed hexagon notches of the first draft — those looked like arrowheads
# cut into a slab rather than the inside of a letter. fill-rule=evenodd punches
# both holes through the one gradient fill.
_B_OUTER = "M12 6 H64 L82 24 V38 L68 52 L86 68 V92 L68 110 H12 Z"


def _ellipse_hole(cx, cy, rx, ry):
    """A closed ellipse as a cubic-bezier subpath, for use as an evenodd hole."""
    k = 0.5522847498
    kx, ky = rx * k, ry * k
    return (
        f"M{cx+rx:.2f} {cy:.2f} "
        f"C{cx+rx:.2f} {cy+ky:.2f} {cx+kx:.2f} {cy+ry:.2f} {cx:.2f} {cy+ry:.2f} "
        f"C{cx-kx:.2f} {cy+ry:.2f} {cx-rx:.2f} {cy+ky:.2f} {cx-rx:.2f} {cy:.2f} "
        f"C{cx-rx:.2f} {cy-ky:.2f} {cx-kx:.2f} {cy-ry:.2f} {cx:.2f} {cy-ry:.2f} "
        f"C{cx+kx:.2f} {cy-ry:.2f} {cx+rx:.2f} {cy-ky:.2f} {cx+rx:.2f} {cy:.2f} Z"
    )


_B = _B_OUTER + " " + _ellipse_hole(56, 29, 19, 12.5) + " " + _ellipse_hole(59, 81, 20, 14)


def logo(cls="mk", grad="bwG"):
    """The B mark. A soft diagonal light sweeps across it every few seconds —
    restrained rather than constant, so it reads as a glint, not a spinner.
    Reduced-motion viewers get the static mark (see .shine in site.css)."""
    return (f'<svg class="{cls}" viewBox="0 0 104 116" aria-hidden="true">'
            f'<defs><clipPath id="bclip{cls}"><path d="{_B}" fill-rule="evenodd"/></clipPath></defs>'
            f'<g transform="skewX(-7) translate(7 0)">'
            f'<path d="{_B}" fill="url(#{grad})" fill-rule="evenodd"/>'
            f'<g clip-path="url(#bclip{cls})">'
            f'<rect class="shine" x="-34" y="-20" width="30" height="160" fill="url(#bwGf)"/>'
            f'</g></g></svg>')

def logo_flat(colour="#0B120E"):
    """Single-colour cut, for tiles and small sizes."""
    return (f'<svg class="mk" viewBox="0 0 104 116" aria-hidden="true">'
            f'<g transform="skewX(-7) translate(7 0)">'
            f'<path d="{_B}" fill="{colour}" fill-rule="evenodd"/></g></svg>')

_ICON_SVG = ("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>"
   "<rect width='128' height='128' rx='28' fill='#07160E'/>"
   "<linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>"
   "<stop offset='0' stop-color='#8DF3B6'/><stop offset='1' stop-color='#159A56'/></linearGradient>"
   "<g transform='translate(20 6) scale(0.79) skewX(-7) translate(7 0)'>"
   "<path d='" + _B + "' fill='url(%23g)' fill-rule='evenodd'/></g></svg>")

FAVICON = ("data:image/svg+xml,"
           + _ICON_SVG.replace('<', '%3C').replace('>', '%3E').replace('"', "'"))

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
