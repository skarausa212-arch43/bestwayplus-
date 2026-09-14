---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/styles.css","public/js/views/browse.js"]
---

# Surface brief — Driveway marketplace (homepage + browse, listing, sell, garage, boards)

Mode: Persuade on the homepage/browse surface; Operate inside listing, sell, garage,
boards. One world across both registers.

## Direction contract

**THESIS.** Driveway computes the parts of a private car sale that strangers
normally argue about, so the surface is built like a factory shop manual: every
figure is drawn, labeled, and traceable to the thing it measures. It refuses
the category arrangement — dusk photograph of a car behind a dark gradient, red
accent, one fat search bar floating over it — and it refuses the classifieds
grid of unlabeled thumbnails. Nothing here is a mood shot; every mark on the
page is either a measurement, a callout, or a control.

**OWN-WORLD.** Shop-manual plate on warm off-white stock (#f6f4ef), navy plate
ink (#0f1b33) for all type and line work, one electric automotive blue (#1a4cff)
that is the live layer the printed manual never had — it owns every primary
action, active state, and computed figure. Green (#0a7d4f) only for deal ratings,
verification and success; amber (#b26a00) only for star ratings. Components:
drawn 1.5px outline icons in one stroke family, callout leader lines with small
ruled terminals, tick-mark rules instead of plain hairlines, figure numbers on
diagrams only, tabular lining numerals everywhere a number can be compared,
and flat 2–4px radii. No cards-as-structure, no nested cards, no eyebrows.

**STORY.** The visitor understands within one screen that this is a private-party
market where the price is computed, not asserted; believes it because the first
viewport shows the mechanism (a drawn vehicle with leader lines to the real
derived figures) instead of claiming trust in adjectives; and acts by running a
search or opening a listing to see the deal rating and the monthly estimate.

**FIRST VIEWPORT.** Full-bleed paper plate. Left column (7 of 12 at ≥1024px):
condition selector (New / Used / Verified / Electric) as a ruled segmented
control at 15px, then the headline at clamp(2.75rem, 5.2vw, 4.75rem) in Archivo
600 on two lines, a 17px subhead at 60ch, then the search plate — Make, Model,
Price, ZIP on one ruled row with a blue Search button at the right end, and an
"All filters" text control beneath. Right column (5 of 12): the drawn vehicle
plate — an original outline-and-flat SVG three-quarter sedan over a CSS road
horizon with ridge line, sitting inside a documented `.hero-photo-slot` that a
real photograph can replace — with three callout leaders terminating in live
figures (estimated value, deal rating, verified seller). Primary action is the
blue Search button, on the fold at every breakpoint; on mobile the plate moves
above the headline and the search row stacks to two rows.

**FORM.** Shop-manual technical plate; candidate 5 of the ordered grounded list
(Monroney sticker, instrument cluster, interstate signage, auction catalogue,
**shop manual**, 60s brochure, license plate); seed key 11e6652f.

**FINISH.** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
