/**
 * Draw the LUMI app icon and launch screens, and write them into assets/.
 *
 *   npm run brand      (then `npm run assets` rasterises every density)
 *
 * The mark is kept here as vector source rather than as five opaque PNGs
 * somebody exported once and can no longer edit: a colour tweak is a one-line
 * change plus a re-run, and the diff is readable.
 *
 * The idea: LUMI means light. Not another green house — a dark house with one
 * window lit, which is what a home looks like when someone is looking after it.
 *
 * Three constraints shape the geometry, all of them enforced by Android rather
 * than by taste:
 *
 *  · The adaptive icon is cropped to a circle, a squircle or a rounded square,
 *    depending on the launcher. Only the central ~61% of the canvas is
 *    guaranteed to survive, so the foreground mark is drawn at FG_SCALE and its
 *    furthest corner is asserted against that radius below — a silent overflow
 *    would clip the roof on exactly the phones we don't own.
 *  · Foreground and background layers move independently (parallax), so the
 *    glow belongs with the window in the FOREGROUND. Split across layers it
 *    would visibly drift away from the light it comes from.
 *  · The splash is centre-cropped at every aspect ratio, so the mark sits in the
 *    middle third and the flat ground carries the edges.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');
const S = 1024;                 // icon canvas
const SPLASH = 2732;            // splash canvas (square; cropped per device)

// ── palette ────────────────────────────────────────────────────────────────
const INK_A = '#102A20', INK_B = '#03110B';   // the dark ground, top-left → bottom-right
const OUTLINE = '#4FE09B';                    // house, dark ground
const LIGHT_A = '#EAFFF4', LIGHT_B = '#8CF3BE', LIGHT_C = '#2FD98A';  // the lit window
const MUNTIN_DARK = '#0A2418';                // window bars, dark ground
const GREEN = '#14C871', GREEN_LT = '#43DE90';
const PAPER = '#F4F8F5';

// ── geometry, in the 1024 icon space ───────────────────────────────────────
const HOUSE = 'M512 236 L826 472 v292 a34 34 0 0 1-34 34 H232 a34 34 0 0 1-34-34 V472 Z';
const HOUSE_STROKE = 44;
const WIN = { x: 396, y: 456, w: 232, h: 232, r: 28 };

// Furthest painted point of the mark from centre, at scale 1: the bottom
// corners of the house body, plus half the stroke that overhangs them.
const CORNER_R = Math.hypot(826 - 512, 798 - 512) + HOUSE_STROKE / 2;
const SAFE_R = S * 0.61 / 2;    // Android's guaranteed-visible circle
const FG_SCALE = 0.68;

if (CORNER_R * FG_SCALE > SAFE_R) {
  console.error(`✗ знак вылезает из безопасной зоны адаптивной иконки: ` +
    `${Math.round(CORNER_R * FG_SCALE)}px при допустимых ${Math.round(SAFE_R)}px — уменьшите FG_SCALE.`);
  process.exit(1);
}

const glow = (id, cx, cy, r, a = 0.62) => `
  <radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" gradientUnits="userSpaceOnUse">
    <stop stop-color="#8DFFC4" stop-opacity="${a}"/>
    <stop offset=".45" stop-color="#22D97F" stop-opacity="${a * 0.42}"/>
    <stop offset="1" stop-color="#14C871" stop-opacity="0"/>
  </radialGradient>`;

const ground = (id, w) => `
  <linearGradient id="${id}" x1="0" y1="0" x2="${w}" y2="${w}" gradientUnits="userSpaceOnUse">
    <stop stop-color="${INK_A}"/><stop offset="1" stop-color="${INK_B}"/>
  </linearGradient>`;

const litWindow = (id) => `
  <linearGradient id="${id}" x1="${WIN.x}" y1="${WIN.y}" x2="${WIN.x + WIN.w}" y2="${WIN.y + WIN.h}" gradientUnits="userSpaceOnUse">
    <stop stop-color="${LIGHT_A}"/><stop offset=".45" stop-color="${LIGHT_B}"/><stop offset="1" stop-color="${LIGHT_C}"/>
  </linearGradient>`;

/** The mark itself: house outline, lit window, muntins. Colours swap for paper. */
const mark = ({ outline, winFill, muntin, outlineOpacity = 1 }) => `
  <path d="${HOUSE}" fill="none" stroke="${outline}" stroke-width="${HOUSE_STROKE}"
        stroke-linejoin="round" stroke-linecap="round" opacity="${outlineOpacity}"/>
  <rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="${WIN.r}" fill="${winFill}"/>
  <g stroke="${muntin}" stroke-width="24" stroke-linecap="round">
    <path d="M512 ${WIN.y} V${WIN.y + WIN.h}"/>
    <path d="M${WIN.x} ${WIN.y + WIN.h / 2} H${WIN.x + WIN.w}"/>
  </g>`;

const DARK_MARK = mark({ outline: OUTLINE, winFill: 'url(#win)', muntin: MUNTIN_DARK, outlineOpacity: 0.55 });

// ── the five source files ──────────────────────────────────────────────────
const files = {
  // Legacy square icon: full bleed, mark at full size.
  'icon.png': `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${ground('bg', S)}${glow('glow', 512, 596, 400)}${litWindow('win')}</defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <circle cx="512" cy="596" r="400" fill="url(#glow)"/>
  ${DARK_MARK}
</svg>`,

  // Adaptive foreground: mark + its glow, transparent, inside the safe circle.
  'icon-foreground.png': `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${glow('glow', 512, 596, 400, 0.5)}${litWindow('win')}</defs>
  <g transform="translate(512 512) scale(${FG_SCALE}) translate(-512 -512)">
    <circle cx="512" cy="596" r="400" fill="url(#glow)"/>
    ${DARK_MARK}
  </g>
</svg>`,

  // Adaptive background: the ground alone — it is what parallax slides under.
  'icon-background.png': `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>${ground('bg', S)}</defs><rect width="${S}" height="${S}" fill="url(#bg)"/>
</svg>`,

  // Light launch screen: the same mark, redrawn to hold on paper.
  'splash.png': `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}" viewBox="0 0 ${SPLASH} ${SPLASH}">
  <defs>
    <linearGradient id="win" x1="${WIN.x}" y1="${WIN.y}" x2="${WIN.x + WIN.w}" y2="${WIN.y + WIN.h}" gradientUnits="userSpaceOnUse">
      <stop stop-color="${GREEN_LT}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient>
    <radialGradient id="halo" cx="512" cy="596" r="430" gradientUnits="userSpaceOnUse">
      <stop stop-color="${GREEN}" stop-opacity=".16"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${SPLASH}" height="${SPLASH}" fill="${PAPER}"/>
  <g transform="translate(${SPLASH / 2} ${SPLASH / 2}) scale(1.15) translate(-512 -512)">
    <circle cx="512" cy="596" r="430" fill="url(#halo)"/>
    ${mark({ outline: GREEN, winFill: 'url(#win)', muntin: PAPER })}
  </g>
</svg>`,

  // Dark launch screen: the icon's own world, on the app's background colour.
  'splash-dark.png': `<svg xmlns="http://www.w3.org/2000/svg" width="${SPLASH}" height="${SPLASH}" viewBox="0 0 ${SPLASH} ${SPLASH}">
  <defs>${glow('glow', 512, 596, 420)}${litWindow('win')}</defs>
  <rect width="${SPLASH}" height="${SPLASH}" fill="#0C100E"/>
  <g transform="translate(${SPLASH / 2} ${SPLASH / 2}) scale(1.15) translate(-512 -512)">
    <circle cx="512" cy="596" r="420" fill="url(#glow)"/>
    ${DARK_MARK}
  </g>
</svg>`,
};

fs.mkdirSync(ASSETS, { recursive: true });
(async () => {
  for (const [name, svg] of Object.entries(files)) {
    const out = path.join(ASSETS, name);
    await sharp(Buffer.from(svg)).png().toFile(out);
    const { width, height } = await sharp(out).metadata();
    console.log(`✓ ${name.padEnd(22)} ${width}×${height}`);
  }
  console.log(`\nЗнак в безопасной зоне: ${Math.round(CORNER_R * FG_SCALE)}px из ${Math.round(SAFE_R)}px допустимых.`);
  console.log('Дальше:  npm run assets   — разложит по всем плотностям Android.');
})().catch((e) => { console.error(e); process.exit(1); });
