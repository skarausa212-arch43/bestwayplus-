# LUMI Design System — tokens

Canonical, framework-agnostic design tokens implementing
`docs/09_UI_DESIGN_SYSTEM.md`. These are the single source of truth for colour,
typography, spacing, radii, elevation, motion and iconography — used by the web
app today and mirrored 1:1 by the Flutter `lib/app/theme/*` files
(`app_colors`, `app_typography`, `app_spacing`, `app_radius`, `app_shadows`,
`app_motion`, `app_icons`).

```
design/
  tokens.css    CSS custom properties (light + dark) — drop-in for web
  tokens.json   Machine-readable tokens (build Flutter/Figma from this)
  README.md
```

## Principles (from the spec)

- **Calm, precise, premium.** Primary green covers ≲15% of a screen; large
  neutral surfaces; gradients only in hero / premium / AI moments.
- **Dark mode is adjusted, not inverted** — dark uses a brighter primary
  (`#28D985`) and leans on tonal elevation + borders over shadows.
- **Status is never colour-only** — pair every status colour with an icon or
  label (the app's status chips carry a dot/dots/label).
- **8-pt spacing grid**, a fixed radius scale (8/12/16/20/28/pill), and four
  motion durations (120/220/360/480 ms).
- **FlashClean** uses primary green + the electric accent `#B9FF66` — never
  panic-red.

## Web app

`public/index.html` inlines these exact values in its `:root` /
`:root[data-theme="dark"]` blocks (a self-contained file has no external CSS).
`tokens.css` is the extracted, reusable copy — keep the two in sync. To consume
it directly in another same-origin page:

```html
<link rel="stylesheet" href="/design/tokens.css">
```

## Verify

`design/verify.js` checks that every colour the spec pins appears in both
`tokens.css` and `tokens.json`, and that the running app's inlined `:root`
matches — run `node design/verify.js`.
