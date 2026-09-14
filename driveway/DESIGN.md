---
name: Driveway
description: A private-party car marketplace drawn like a factory shop manual — warm paper, navy plate ink, and one electric blue for everything the marketplace computed.
colors:
  paper: "#f6f4ef"
  paper-tint: "#efebe1"
  paper-deep: "#e7e2d5"
  surface: "#fffefb"
  plate-ink: "#0f1b33"
  plate-ink-soft: "#2c3a55"
  muted: "#5d6b85"
  rule: "#d9d4c7"
  rule-strong: "#c2bbaa"
  live-blue: "#1a4cff"
  live-blue-deep: "#0b2fb5"
  live-blue-ink: "#10256e"
  live-blue-wash: "#e9edff"
  deal-green: "#0a7d4f"
  deal-green-deep: "#075c3a"
  deal-green-wash: "#e1f2e9"
  rating-gold: "#c96f00"
  rating-amber: "#8a5200"
  rating-wash: "#fbf0dd"
  alert-red: "#b3261e"
  alert-red-wash: "#fbeae9"
  on-dark: "#eef1f8"
  on-dark-2: "#cfd8e8"
  on-dark-3: "#8d9cb8"
  blue-on-dark: "#7d9cff"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(2.9rem, 3.6vw, 3.6rem)"
    fontWeight: 700
    lineHeight: 1.04
    letterSpacing: "-0.025em"
    fontVariation: "width 112"
  headline:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.3rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.018em"
  figure:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.028em"
    fontFeature: "tnum 1, lnum 1"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  body-sm:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  caption:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  micro:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.09em"
rounded:
  xs: "2px"
  sm: "4px"
  lg: "8px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
  s7: "48px"
  s8: "64px"
  s9: "96px"
  s10: "128px"
components:
  button-primary:
    backgroundColor: "{colors.live-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.live-blue-deep}"
    textColor: "#ffffff"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.plate-ink-soft}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.plate-ink-soft}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "38px"
  chip-on:
    backgroundColor: "{colors.plate-ink}"
    textColor: "#eef1f8"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.plate-ink}"
    rounded: "{rounded.sm}"
    padding: "16px"
  badge-deal:
    backgroundColor: "{colors.deal-green}"
    textColor: "#ffffff"
    rounded: "{rounded.xs}"
    padding: "6px 10px"
---

# Design System: Driveway

## Overview

**Creative North Star: "The Shop Manual Plate"**

Driveway's one job is to make a private car sale arguable with numbers instead of
adjectives, so the interface is built like a page torn out of a factory service
manual. The ground is warm paper stock. Every line of type and every stroke of
line-work is plate ink — a deep navy, never black. Vehicles are not photographed;
they are *drawn*, as side elevations in one outline weight, the way a manual draws
the thing it is about to measure. Leader lines run from the drawing to the figure
it carries. Numbers are tabular so one column can be read against another.

The one thing a printed manual never had is the live layer, and that is where the
electric blue lives. Blue means the marketplace computed this, or you can act on
this: primary buttons, active states, estimated payments, comp-anchored values,
focus rings. It appears nowhere else, which is what makes it legible at a glance.
Two further colors are rationed to a single job each — green for deal ratings,
verification and success, gold for star ratings — so a green pill on a card always
means the same thing as a green pill on a listing page.

The anti-references are the two rooms this category always ships: the dusk
photograph of a car behind a dark gradient with a red accent and a floating
search bar, and the classifieds grid of unlabeled thumbnails. Neither is here. A
listing with no photographs gets its own drawn elevation rather than a grey box,
and that drawing is labeled as a drawing.

**Key Characteristics:**

- Warm paper ground, deep navy ink, one saturated blue that only ever means *live*.
- Everything drawn: 1.6-unit outline icons and 4-unit outline vehicle elevations,
  one stroke family across the whole product.
- Hairline rules and 2–4px radii; the page is cut, not rounded.
- Tabular lining numerals wherever two figures could be compared.
- One authored motion moment (the hero plate draws itself) and nothing else that
  loops on its own.

## Colors

A warm neutral ground under navy line-work, with three reserved signal colors that
never take each other's jobs.

### Primary

- **Live Blue** (`#1a4cff`): the layer the printed manual could not have. Every
  primary button, every active segment, every focus ring, every figure the
  marketplace computed rather than copied — comp-anchored value, estimated monthly
  payment, all-in monthly cost. Never used for decoration, and never for a car's
  paint.
- **Live Blue Deep** (`#0b2fb5`): the pressed and hovered state of any blue surface.
- **Live Blue Wash** (`#e9edff`) / **Live Blue Ink** (`#10256e`): tinted panel and
  its text, for informational notes and focused search fields.

### Secondary

- **Deal Green** (`#0a7d4f`): deal ratings (Great deal / Good deal), verification
  marks, funds-verified pills, closed-sale marks, success toasts. Nothing else.
- **Rating Gold** (`#c96f00`) with **Rating Amber** (`#8a5200`) for text: star
  ratings, and the "above market" and time-pressure states that borrow the same
  caution register. Never a general accent.
- **Alert Red** (`#b3261e`): destructive actions, branded titles, form errors, and
  the sold badge.

### Neutral

- **Paper** (`#f6f4ef`): the page. A warm off-white, pinned by the brief.
- **Paper Tint** (`#efebe1`) / **Paper Deep** (`#e7e2d5`): alternating section
  grounds and inert fills, so sections separate without a border everywhere.
- **Surface** (`#fffefb`): cards, plates, inputs — a warm white that sits *above*
  paper rather than a cold white that fights it.
- **Plate Ink** (`#0f1b33`): all body and display type, all drawn line-work, the
  dark sections, the footer.
- **Plate Ink Soft** (`#2c3a55`) and **Muted** (`#5d6b85`): secondary and tertiary
  text. Both clear 4.5:1 on paper.
- **Rule** (`#d9d4c7`) / **Rule Strong** (`#c2bbaa`): hairlines. The strong one
  marks anything interactive or containing.

## Typography

Two faces, both self-hosted as variable woff2 under `/public/fonts` — the CSP
allows no third-party font host, and the closest installed font is not a fallback
for a chosen one.

- **Archivo** (width 112, weights 600–800) is the plate lettering: headlines,
  card titles, prices, every large figure, and the state plate on a closed sale.
  The 112 width cut carries the flat, signage-like quality the world is built on.
  Display sizes never exceed 3.9rem, and tracking never goes below `-0.035em`.
- **Manrope** (weights 400–700) runs the interface: body copy, labels, controls,
  table text, form fields.

Rules that hold everywhere:

- Uppercase labels are Manrope 11px/800 at `0.09em`. They name fields and
  categories; they never sit above a heading as a kicker.
- Any number a reader might compare to another number is tabular and lining:
  prices, mileage, payments, ratings, table cells, range inputs.
- Body measure is capped at 56–70ch depending on context; headings use
  `text-wrap: balance`, paragraphs `text-wrap: pretty`.
- The full step scale in use, in px: `11 · 12 · 12.5 · 13 · 13.5 · 14 · 14.5 ·
  15 · 15.5 · 16 · 17 · 19 · 21 · 23 · 25` and then fluid clamps for headlines.
  The half-steps are deliberate: they let a dense card row (12 / 12.5 / 13.5)
  separate three levels of information inside 300px without a size jump that
  would read as hierarchy where there is none.

Dark surfaces (the footer, the financing readout, the `.sec.ink` band) use their
own four-step ink ramp — `on-dark` `#eef1f8` for headings, `on-dark-2` `#cfd8e8`
for links and secondary copy, `on-dark-3` `#8d9cb8` for labels and legal text,
and `blue-on-dark` `#7d9cff` where the live layer has to survive on navy. Every
one clears 4.5:1 on plate ink.

## Layout

- Containers: `1240px` standard, `1440px` wide (pages with a sidebar or a data
  table). At 1920px these open to `1360px` / `1600px`.
- Gutters: `20px` under 768, `32px` to 1440, `48px` above.
- Spacing is a 4px scale (`4 8 12 16 24 32 48 64 96 128`). Sections run at 64px
  vertical padding under 768 and 96px above. More space above a heading than below.
- Breakpoints: `380` (search plate pairs up), `560` (two-column grids), `768`
  (two-column sections), `900` (main nav appears), `1024` (hero splits, three- and
  four-column grids, sticky listing sidebar), `1180` (header search appears),
  `1440`, `1920`.
- **Mobile is composed, not stacked.** Below 1024 the hero's drawn plate moves
  *above* the copy and crops to 16:9, two of its three callouts are dropped, and
  the financing calculator jumps ahead of its own explanation. Below 560 a vehicle
  card's drawing crops to 16:9 so a list of sixteen cars is not a scroll marathon.

## Elevation & Depth

Depth is structural, not ambient: a shadow says "this plate sits above the paper",
never "this is pretty". Every shadow carries both an offset and a soft blur, and
every one is tinted with the navy ink rather than neutral black.

- `sh-1` `0 1px 2px rgba(15,27,51,.05)` — resting controls and outline buttons.
- `sh-2` `0 2px 4px rgba(15,27,51,.05), 0 10px 22px -14px rgba(15,27,51,.22)` —
  the search plate, the financing plate, callout figures.
- `sh-3` `0 4px 8px rgba(15,27,51,.06), 0 22px 48px -22px rgba(15,27,51,.30)` —
  the hero plate, hovered vehicle cards, modals.
- `sh-blue` `0 2px 4px rgba(11,47,181,.18), 0 12px 26px -14px rgba(11,47,181,.45)` —
  primary buttons and range thumbs only, so the live layer reads as lit.

Most surfaces carry no shadow at all. Separation normally comes from a hairline
rule or a change of paper tone.

## Shapes

- Radii: `2px` (marks, badges, inner cells), `4px` (the default — buttons, inputs,
  cards, plates), `8px` (modals only). A manual plate is cut square; nothing here
  is pill-shaped except a status pill and a meter track.
- Grids of cells draw their rules with a 1px gap over a surface-colored parent plus
  a `box-shadow: 0 0 0 1px var(--rule)` ring per cell. The ring is what makes a
  short last row read as empty surface instead of a colored slab.
- The hero plate carries eight-hairline corner registration marks, drawn as
  background gradients — never a multi-vertex `clip-path`.
- Icons: 24×24 grid, 1.6 stroke, round caps and joins, no fills, `currentColor`.
  Vehicles: the same family at 4.0 stroke with flat metal paint.

## Components

- **Primary button** — Live Blue, white text, 44px tall, 4px radius, `sh-blue`.
  Hovers to Live Blue Deep and deepens its shadow; presses down 1px. Icons sit
  left of the label at 17px.
- **Outline button** — surface fill, `rule-strong` border, ink text, `sh-1`.
  Hovers to an ink border over paper.
- **Search plate** — one ruled row of fields at ≥1024, two columns at ≥380, one
  below. Each field is a stacked uppercase label over a 15px/600 value, divided by
  hairlines, and tints to Live Blue Wash on focus-within.
- **Vehicle card** — drawn or photographed image at 4:3 (16:9 on phones), then
  price, the payment that price implies, year/make/model with trim, a three-cell
  ruled spec strip (mileage, drivetrain, fuel), at most four trust badges, and a
  footer of location plus seller rating or an offer deadline. Hover lifts 3px to
  `sh-3` and scales the image 1.04. The whole card is focusable and opens on
  Enter or Space.
- **Trust badge** — 11.5px/700 with a 13px drawn icon, in one of five registers:
  green (clean), blue (informational), gold (caution), red (problem).
- **Deal badge** — the only place a rating is stated on a card. Green fill for
  Great/Good, surface for Fair, gold wash for Above market.
- **Condition selector** — a ruled segmented control; the active segment is a Live
  Blue plate. Changing it redraws the hero vehicle and refilters the grid.
- **Callout** — a leader line with a terminal dot running from the drawing to a
  small surface plate holding an uppercase label and one figure.
- **Closed-sale record** — a green "Closed" mark, the accepted price as the largest
  figure, the vehicle, then mileage, state plate and date. It is a record, never a
  review: it carries no stars.

## Do's and Don'ts

**Do**

- Reach for blue when something is actionable or computed, and for nothing else.
- Draw any new icon on the 24 grid at 1.6 stroke and add it to `public/js/icons.js`.
- Give any figure a reader might compare `font-variant-numeric: tabular-nums`.
- Label an estimate as an estimate, in the place it is shown.
- Let a listing with no photographs draw itself, and say in words that it is a drawing.
- Theme the browser's own surfaces — selection, caret, scrollbar, focus ring,
  underline offset — from these tokens.

**Don't**

- Don't put a kicker or eyebrow above a heading. The heading carries its own weight.
- Don't use an emoji or a Unicode dingbat as an interface icon.
- Don't paint a car in Live Blue, or use green for anything but a deal rating,
  verification or success.
- Don't nest a card inside a card, or use a grid of same-size icon-heading-text
  cards as a page's structure.
- Don't add a second looping animation. The hero plate drawing itself is the one
  authored moment; everything else moves only in response to a person.
- Don't reintroduce a dark theme. Light only, decided and settled.
- Don't state a rate, a credit decision or a customer testimonial: there is no
  lender and there are no testimonials.
