/**
 * Draw the Google Play listing graphics into store/.
 *
 *   node scripts/make-store-assets.js
 *
 *   store/icon-512.png        — 512×512 hi-res icon (Play requirement)
 *   store/feature-graphic.png — 1024×500 feature graphic
 *
 * The palette and the house mark come from make-brand-assets.js — the single
 * vector source of the brand — so a colour tweak there propagates here on the
 * next run. The LUMI wordmark is drawn as stroked paths in the same rounded
 * line style as the house, because the build machine's fonts can't be trusted
 * to render a brand word.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const B = require('./make-brand-assets.js');

const STORE = path.join(__dirname, '..', 'store');
const ASSETS = path.join(__dirname, '..', 'assets');
const W = 1024, H = 500;

/**
 * The LUMI wordmark as stroked letterforms: cap height `h`, round caps/joins,
 * geometry that echoes the house outline. Returns { svg, width }.
 */
const wordmark = (h, stroke, color) => {
  const r = h * 0.36;                       // U bowl radius
  const wL = h * 0.56, wU = r * 2, wM = h * 0.92, gap = h * 0.34;
  let x = 0; const p = [];
  p.push(`M${x} 0 V${h} H${x + wL}`); x += wL + gap;                       // L
  p.push(`M${x} 0 V${h - r} A${r} ${r} 0 0 0 ${x + wU} ${h - r} V0`); x += wU + gap; // U
  p.push(`M${x} ${h} V0 L${x + wM / 2} ${h * 0.62} L${x + wM} 0 V${h}`); x += wM + gap; // M
  p.push(`M${x} 0 V${h}`); x += 0;                                        // I
  return {
    width: x + stroke,
    svg: `<g fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-linejoin="round">
      ${p.map((d) => `<path d="${d}"/>`).join('\n      ')}</g>`,
  };
};

const wm = wordmark(150, 30, B.PAPER);
const wmX = 470, wmY = 118;

const FEATURE = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    ${B.ground('bg', W)}
    ${B.glow('glow', 250, 285, 300)}
    ${B.litWindow('win')}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="250" cy="285" r="300" fill="url(#glow)"/>
  <g transform="translate(250 250) scale(0.42) translate(-512 -512)">
    ${B.DARK_MARK}
  </g>
  <g transform="translate(${wmX} ${wmY})">${wm.svg}</g>
  <text x="${wmX - 8}" y="${wmY + 150 + 88}" font-family="DejaVu Sans" font-size="35"
    font-weight="bold" fill="#8CF3BE">Sprzątanie i usługi domowe</text>
  <text x="${wmX - 8}" y="${wmY + 150 + 138}" font-family="DejaVu Sans" font-size="27"
    fill="#7FA893">Wrocław &#183; lumi24.pl</text>
</svg>`;

fs.mkdirSync(STORE, { recursive: true });
(async () => {
  await sharp(path.join(ASSETS, 'icon.png')).resize(512, 512).png()
    .toFile(path.join(STORE, 'icon-512.png'));
  console.log('✓ store/icon-512.png        512×512');

  await sharp(Buffer.from(FEATURE)).png().toFile(path.join(STORE, 'feature-graphic.png'));
  console.log('✓ store/feature-graphic.png 1024×500');
})().catch((e) => { console.error(e); process.exit(1); });
