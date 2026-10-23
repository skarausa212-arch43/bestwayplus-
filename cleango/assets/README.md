# LUMI Asset Library

Implements `docs/28_ASSET_LIBRARY.md`. Central home for brand + product assets.
**Reuse existing assets; follow the naming conventions** (§Rules).

## Folder structure

```
assets/
  logos/          logo_primary.svg · logo_mono.svg · app_icon.svg
  icons/          icon_<name>.svg   (24px grid, rounded outline, stroke=currentColor)
  illustrations/  illus_<name>.svg
  ui/             shared-component inventory (canonical set lives in design/components.html)
  marketing/      landing / brand / investor surfaces
  animations/     motion (CSS in the SPA; export Lottie here when needed)
```

## Naming conventions (§Naming)

| Kind | Pattern | Example |
|------|---------|---------|
| Logo | `logo_<variant>.svg` | `logo_primary.svg`, `logo_mono.svg` |
| App icon | `app_icon.svg` | `app_icon.svg` |
| Icon | `icon_<name>.svg` | `icon_home.svg`, `icon_ai.svg` |
| Illustration | `illus_<name>.{svg,webp}` | `illus_flashclean.svg` |

Rules: lowercase `snake_case`, category prefix, no spaces/camelCase. `ops/asset-check.js`
enforces this in CI.

## Icon categories (§Icon Categories)

Cleaning · Home · AI · Payments · Chat · Calendar · Smart Home · Analytics —
one `icon_*.svg` each, drawn on a 24px grid with a consistent 2px stroke so they
compose cleanly with the inline SVG set in the SPA.

## Single source of truth

Icons and components used at runtime live inline in `public/index.html` and
`design/tokens.css` / `design/components.html`. These exports mirror that system
for design tooling and the native apps — they never fork the values (29
§"Never duplicate business logic", §"Shared components only").
