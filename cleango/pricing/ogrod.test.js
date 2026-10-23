/** Deterministic tests for pricing/ogrod.js — the Ogród (garden) price engine. */
'use strict';
const assert = require('assert');
const { estimate, availability, inSeason, PRICING_OGROD } = require('./ogrod');

const JUL = 6, SEP = 8, JAN = 0, APR = 3, NOV = 10, DEC = 11;
const line = (r, key) => r.lines.find((l) => l.key === key);
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

ok('koszenie tiers: whole area billed at its bracket rate (boundaries exact)', () => {
  assert.strictEqual(line(estimate({ koszenie: true, lawnM2: 300 }, { month: JUL }), 'koszenie').amountG, 300 * 120);   // 360 zł
  assert.strictEqual(line(estimate({ koszenie: true, lawnM2: 301 }, { month: JUL }), 'koszenie').amountG, 301 * 100);   // next bracket
  assert.strictEqual(line(estimate({ koszenie: true, lawnM2: 800 }, { month: JUL }), 'koszenie').amountG, 800 * 100);
  assert.strictEqual(line(estimate({ koszenie: true, lawnM2: 2000 }, { month: JUL }), 'koszenie').amountG, 2000 * 80);
});

ok('koszenie >2000 m² → wycena indywidualna (excluded, 0 in total)', () => {
  const r = estimate({ koszenie: true, lawnM2: 2500 }, { month: JUL });
  assert.strictEqual(line(r, 'koszenie').excluded, 'individual');
  assert.strictEqual(r.totalG, 0);
  assert.strictEqual(r.chargeable, false);
});

ok('tall grass ×1.5 then frequency discount applies to koszenie only', () => {
  const r = estimate({ koszenie: true, lawnM2: 300, highGrass: true, mowFrequency: 'coTydzien', removeClippings: true }, { month: JUL });
  const base = Math.round(300 * 120 * 1.5);              // 540 zł
  assert.strictEqual(line(r, 'koszenie').amountG, base);
  assert.strictEqual(line(r, 'rabat').amountG, -Math.round(base * 0.20));   // -108 zł
  assert.strictEqual(line(r, 'wywozTrawy').amountG, 4000);                  // addon not discounted
  assert.strictEqual(r.totalG, base - Math.round(base * 0.2) + 4000);       // 472 zł
});

ok('frequency discounts: -15% co 2 tygodnie, 0 jednorazowo', () => {
  const r15 = estimate({ koszenie: true, lawnM2: 300, mowFrequency: 'co2Tygodnie' }, { month: JUL });
  assert.strictEqual(line(r15, 'rabat').amountG, -Math.round(300 * 120 * 0.15));
  const r0 = estimate({ koszenie: true, lawnM2: 300, mowFrequency: 'jednorazowo' }, { month: JUL });
  assert.strictEqual(line(r0, 'rabat'), undefined);
});

ok('minPrice floors: wertykulacja small lawn → 240 zł; pielenie small → 120 zł', () => {
  const w = estimate({ wertykulacja: true, lawnM2: 50 }, { month: SEP });     // 50×2=100 < 240
  assert.strictEqual(line(w, 'wertykulacja').amountG, 24000);
  const p = estimate({ pielenieM2: 10 }, { month: JUL });                     // 10×5.6=56 < 120
  assert.strictEqual(line(p, 'pielenieRabat').amountG, 12000);
});

ok('pakiet supersedes wertykulacja + aeracja', () => {
  const r = estimate({ pakietRegeneracja: true, wertykulacja: true, aeracja: true, lawnM2: 200 }, { month: SEP });
  assert.ok(line(r, 'pakietRegeneracja'));
  assert.strictEqual(line(r, 'wertykulacja'), undefined);
  assert.strictEqual(line(r, 'aeracja'), undefined);
  assert.strictEqual(r.totalG, 200 * 440);                                    // 880 zł ≥ min 440
});

ok('żywopłot height brackets; >250 cm individual; wywóz gałęzi fixed 60 zł', () => {
  const r = estimate({ hedgeMb: 20, hedgeHeight: 'h150', removeBranches: true }, { month: JUL });
  assert.strictEqual(line(r, 'zywoplot').amountG, 20 * 1180);                 // 236 zł
  assert.strictEqual(line(r, 'wywozGalezi').amountG, 6000);
  const ind = estimate({ hedgeMb: 20, hedgeHeight: 'h250plus' }, { month: JUL });
  assert.strictEqual(line(ind, 'zywoplot').excluded, 'individual');
});

ok('seasons: wertykulacja excluded in July, open in September (with availableFrom)', () => {
  const jul = estimate({ wertykulacja: true, lawnM2: 300 }, { month: JUL });
  assert.strictEqual(line(jul, 'wertykulacja').excluded, 'season');
  assert.strictEqual(line(jul, 'wertykulacja').availableFrom, 'wrzesień');
  assert.strictEqual(jul.totalG, 0);
  const sep = estimate({ wertykulacja: true, lawnM2: 300 }, { month: SEP });
  assert.strictEqual(line(sep, 'wertykulacja').amountG, 300 * 200);
});

ok('seasons: koszenie closed in January; grabienie only wrzesień–listopad', () => {
  assert.strictEqual(line(estimate({ koszenie: true, lawnM2: 300 }, { month: JAN }), 'koszenie').excluded, 'season');
  assert.strictEqual(inSeason('koszenie', APR), true);
  assert.strictEqual(line(estimate({ grabienie: true, lawnM2: 300 }, { month: JUL }), 'grabienieLisci').excluded, 'season');
  const nov = estimate({ grabienie: true, lawnM2: 300, grabienieWywoz: true }, { month: NOV });
  assert.strictEqual(line(nov, 'grabienieLisci').amountG, 300 * 90);
  assert.strictEqual(line(nov, 'wywozLisci').amountG, 4000);
});

ok('min order 120 zł flagged (belowMin) but never blocks the estimate itself', () => {
  const r = estimate({ koszenie: true, lawnM2: 80 }, { month: JUL });         // 96 zł
  assert.strictEqual(r.totalG, 9600);
  assert.strictEqual(r.belowMin, true);
  const r2 = estimate({ koszenie: true, lawnM2: 100 }, { month: JUL });       // 120 zł exactly
  assert.strictEqual(r2.belowMin, false);
});

ok('availability map: July greys regen + liście, keeps general open', () => {
  const a = availability(JUL);
  assert.strictEqual(a.koszenie.available, true);
  assert.strictEqual(a.wertykulacja.available, false);
  assert.strictEqual(a.wertykulacja.availableFrom, 'wrzesień');
  assert.strictEqual(a.grabienieLisci.available, false);
  const dec = availability(DEC);
  assert.strictEqual(dec.koszenie.available, false);
  assert.strictEqual(dec.koszenie.availableFrom, 'kwiecień');
});

ok('duration is a sane positive multiple of 30 min when chargeable', () => {
  const r = estimate({ koszenie: true, lawnM2: 300, hedgeMb: 20, hedgeHeight: 'h100' }, { month: JUL });
  assert.ok(r.durationMin >= 60 && r.durationMin % 30 === 0);
});

ok('money is integer grosz everywhere', () => {
  const r = estimate({ koszenie: true, lawnM2: 137, highGrass: true, mowFrequency: 'coTydzien', pielenieM2: 13 }, { month: JUL });
  for (const l of r.lines) assert.ok(Number.isInteger(l.amountG), l.key + ' integer');
  assert.ok(Number.isInteger(r.totalG));
  assert.strictEqual(PRICING_OGROD.minOrderG, 12000);
});

console.log(`\n${n} ogrod pricing checks passed.`);
