/**
 * Ogród — garden-services pricing for the Wrocław launch (PRICING_OGROD).
 *
 * Single source of garden prices; server-authoritative like every money path.
 * All arithmetic is integer grosz. The UI only renders what this returns.
 *
 * Rules implemented (product spec):
 *  • koszenie: progressive tier by lawn area — the WHOLE area is billed at its
 *    bracket's rate; ×1.5 for tall grass; frequency discount applies to the
 *    koszenie line only (it is the subscription-style service).
 *  • wertykulacja / aeracja / pakiet regeneracja: per-m² with a minimum price;
 *    pakiet supersedes wertykulacja+aeracja (they are ignored when it's on).
 *  • żywopłot: per-mb by height bracket; >250 cm → individual quote.
 *  • grabienie liści / pielenie rabat: per-m² with minimum price.
 *  • fixed haul-away add-ons (pokos 40 zł, gałęzie 60 zł, liście 40 zł).
 *  • seasons: general kwiecień–październik; wertykulacja/aeracja/pakiet
 *    marzec–maj + wrzesień; grabienie wrzesień–listopad. Out-of-season
 *    services are excluded from the total and flagged, so the client can
 *    grey them out with "Dostępne od …".
 *  • minimum order 120 zł (dojazd Wrocław: 0 zł).
 */
'use strict';

const G = (zl) => Math.round(zl * 100);   // zł → grosz

const PRICING_OGROD = {
  city: 'wroclaw',
  cities: ['Wrocław'],
  currency: 'PLN',
  minOrderG: G(120),
  dojazd: { wroclaw: 0, note: '0,80 zł/km w obie strony powyżej 10 km od granic miasta' },
  koszenie: {
    label: 'Koszenie trawnika',
    unit: 'm²',
    tiers: [
      { upTo: 300,  rateG: G(1.20) },
      { upTo: 800,  rateG: G(1.00) },
      { upTo: 2000, rateG: G(0.80) },
    ],
    aboveM2: 2000,                       // beyond → wycena indywidualna
    includes: 'koszenie + podkaszanie krawędzi + zgrabienie i uprzątnięcie pokosu',
    highGrassMultiplier: 1.5,            // trawa >15 cm / zarośla (kosa spalinowa)
    addons: { wywozTrawy: { label: 'Wywóz pokosu poza posesję', priceG: G(40) } },
    frequencyDiscounts: { coTydzien: 0.20, co2Tygodnie: 0.15, jednorazowo: 0 },
  },
  wertykulacja: { label: 'Wertykulacja trawnika', unit: 'm²', rateG: G(2.00), minG: G(240), season: 'marzec–maj, wrzesień' },
  aeracja:      { label: 'Aeracja trawnika',      unit: 'm²', rateG: G(2.00), minG: G(240), season: 'marzec–maj, wrzesień' },
  pakietRegeneracja: {
    label: 'Pakiet: Regeneracja trawnika', unit: 'm²', rateG: G(4.40), minG: G(440),
    note: 'wertykulacja + aeracja + nawożenie + podsiew · nasiona i nawóz w cenie',
    season: 'marzec–maj, wrzesień',
  },
  zywoplot: {
    label: 'Przycinanie żywopłotu', unit: 'mb',
    tiersByHeight: [
      { key: 'h100', height: 'do 100 cm',       rateG: G(8.00) },
      { key: 'h150', height: 'do 150 cm',       rateG: G(11.80) },
      { key: 'h200', height: 'do 200 cm',       rateG: G(14.50) },
      { key: 'h250', height: 'do 250 cm',       rateG: G(18.50) },
      { key: 'h250plus', height: 'powyżej 250 cm', individual: true },
    ],
    includes: 'przycięcie + formowanie + uprzątnięcie miejsca',
    addons: { wywozGalezi: { label: 'Wywóz i utylizacja gałęzi', priceG: G(60) } },
  },
  grabienieLisci: {
    label: 'Grabienie liści', unit: 'm²', rateG: G(0.90), minG: G(120), season: 'wrzesień–listopad',
    addons: { wywozLisci: { label: 'Wywóz liści', priceG: G(40) } },
  },
  pielenieRabat: { label: 'Pielenie rabat', unit: 'm²', rateG: G(5.60), minG: G(120), includes: 'pielenie + uprzątnięcie i utylizacja urobku' },
  zakladanieTrawnika: {
    label: 'Zakładanie trawnika',
    options: [
      { type: 'z siewu',  from: 'od 22 zł/m²', note: 'z przygotowaniem podłoża' },
      { type: 'z rolki',  from: 'od 58 zł/m²', note: 'z przygotowaniem podłoża' },
    ],
    flow: 'wycena',                       // quote form, not auto-calculated
  },
};

// Month sets, 0-based (Jan = 0).
const SEASON = {
  general:  { months: [3, 4, 5, 6, 7, 8, 9],  label: 'kwiecień–październik', fromMonth: 3 },   // Apr–Oct
  regen:    { months: [2, 3, 4, 8],           label: 'marzec–maj, wrzesień', fromMonth: 2 },   // Mar–May, Sep
  liscie:   { months: [8, 9, 10],             label: 'wrzesień–listopad',    fromMonth: 8 },   // Sep–Nov
};
const SERVICE_SEASON = {
  koszenie: 'general', zywoplot: 'general', pielenieRabat: 'general',
  wertykulacja: 'regen', aeracja: 'regen', pakietRegeneracja: 'regen',
  grabienieLisci: 'liscie',
};
const MONTHS_PL = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];

function inSeason(service, month) {
  const s = SEASON[SERVICE_SEASON[service] || 'general'];
  return s.months.includes(month);
}
// Next month (from `month` exclusive) when the service opens — for "Dostępne od …".
function nextOpenMonth(service, month) {
  const s = SEASON[SERVICE_SEASON[service] || 'general'];
  for (let i = 1; i <= 12; i++) { const m = (month + i) % 12; if (s.months.includes(m)) return m; }
  return s.fromMonth;
}
function availability(month) {
  const out = {};
  for (const k of Object.keys(SERVICE_SEASON)) {
    const ok = inSeason(k, month);
    const nm = ok ? null : nextOpenMonth(k, month);
    out[k] = { available: ok, season: SEASON[SERVICE_SEASON[k]].label, availableFrom: ok ? null : MONTHS_PL[nm], availableFromMonth: nm };
  }
  return out;
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

/**
 * estimate(input, { month }) → { lines, totalG, belowMin, minOrderG, durationMin, currency }
 * input: { lawnM2, mowFrequency, highGrass, removeClippings, hedgeMb, hedgeHeight,
 *          removeBranches, wertykulacja, aeracja, pakietRegeneracja,
 *          grabienie, grabienieWywoz, pielenieM2, koszenie }
 * Lines carry: key, label, qty, unit, rateG?, amountG (0 when excluded),
 * excluded: 'season' | 'individual' | undefined, availableFrom (season only).
 */
function estimate(input = {}, opts = {}) {
  const month = Number.isInteger(opts.month) ? opts.month : new Date().getMonth();
  const P = PRICING_OGROD;
  const lines = [];
  let totalG = 0;
  let durationMin = 0;
  const push = (l) => { lines.push(l); totalG += l.amountG; };
  const excludeIf = (key) => { if (inSeason(key, month)) return null;
    const nm = nextOpenMonth(key, month); return { excluded: 'season', availableFrom: MONTHS_PL[nm], availableFromMonth: nm }; };

  const lawn = clampInt(input.lawnM2, 0, 100000);
  const wantMow = !!input.koszenie && lawn > 0;

  // ── koszenie: progressive bracket, ×1.5 tall grass, frequency discount ──
  if (wantMow) {
    const off = excludeIf('koszenie');
    if (off) {
      push({ key: 'koszenie', label: P.koszenie.label, qty: lawn, unit: 'm²', amountG: 0, ...off });
    } else if (lawn > P.koszenie.aboveM2) {
      push({ key: 'koszenie', label: P.koszenie.label, qty: lawn, unit: 'm²', amountG: 0, excluded: 'individual' });
    } else {
      const tier = P.koszenie.tiers.find((t) => lawn <= t.upTo);
      let amt = lawn * tier.rateG;
      const mult = input.highGrass ? P.koszenie.highGrassMultiplier : 1;
      amt = Math.round(amt * mult);
      const freq = ['coTydzien', 'co2Tygodnie', 'jednorazowo'].includes(input.mowFrequency) ? input.mowFrequency : 'jednorazowo';
      const disc = P.koszenie.frequencyDiscounts[freq] || 0;
      const discG = Math.round(amt * disc);
      push({ key: 'koszenie', label: P.koszenie.label + (input.highGrass ? ' · wysoka trawa ×1,5' : ''), qty: lawn, unit: 'm²', rateG: tier.rateG, amountG: amt });
      if (discG > 0) push({ key: 'rabat', label: `Rabat ${freq === 'coTydzien' ? '-20% (co tydzień)' : '-15% (co 2 tygodnie)'}`, qty: 1, unit: '', amountG: -discG });
      if (input.removeClippings) push({ key: 'wywozTrawy', label: P.koszenie.addons.wywozTrawy.label, qty: 1, unit: '', amountG: P.koszenie.addons.wywozTrawy.priceG });
      durationMin += 30 + Math.ceil(lawn / 300) * 60 * (input.highGrass ? 1.5 : 1);
    }
  }

  // ── seasonal lawn treatments (pakiet supersedes wertykulacja + aeracja) ──
  const wantPakiet = !!input.pakietRegeneracja && lawn > 0;
  const perM2 = (key, on, areaM2) => {
    if (!on || !areaM2) return;
    const cfg = P[key];
    const off = excludeIf(key);
    if (off) { push({ key, label: cfg.label, qty: areaM2, unit: 'm²', amountG: 0, ...off }); return; }
    const amt = Math.max(areaM2 * cfg.rateG, cfg.minG);
    push({ key, label: cfg.label, qty: areaM2, unit: 'm²', rateG: cfg.rateG, amountG: amt, min: amt === cfg.minG && areaM2 * cfg.rateG < cfg.minG });
    durationMin += key === 'pakietRegeneracja' ? Math.ceil(areaM2 / 150) * 60 : Math.ceil(areaM2 / 300) * 60;
  };
  perM2('pakietRegeneracja', wantPakiet, lawn);
  perM2('wertykulacja', !wantPakiet && !!input.wertykulacja, lawn);
  perM2('aeracja', !wantPakiet && !!input.aeracja, lawn);

  // ── żywopłot by height bracket ──
  const mb = clampInt(input.hedgeMb, 0, 10000);
  if (mb > 0) {
    const off = excludeIf('zywoplot');
    const tier = P.zywoplot.tiersByHeight.find((t) => t.key === input.hedgeHeight) || P.zywoplot.tiersByHeight[0];
    if (off) {
      push({ key: 'zywoplot', label: P.zywoplot.label, qty: mb, unit: 'mb', amountG: 0, ...off });
    } else if (tier.individual) {
      push({ key: 'zywoplot', label: `${P.zywoplot.label} · ${tier.height}`, qty: mb, unit: 'mb', amountG: 0, excluded: 'individual' });
    } else {
      push({ key: 'zywoplot', label: `${P.zywoplot.label} · ${tier.height}`, qty: mb, unit: 'mb', rateG: tier.rateG, amountG: mb * tier.rateG });
      if (input.removeBranches) push({ key: 'wywozGalezi', label: P.zywoplot.addons.wywozGalezi.label, qty: 1, unit: '', amountG: P.zywoplot.addons.wywozGalezi.priceG });
      durationMin += Math.ceil(mb / 10) * 60;
    }
  }

  // ── grabienie liści (lawn area) + pielenie rabat (own m²) ──
  if (input.grabienie && lawn > 0) {
    const off = excludeIf('grabienieLisci');
    if (off) {
      push({ key: 'grabienieLisci', label: P.grabienieLisci.label, qty: lawn, unit: 'm²', amountG: 0, ...off });
    } else {
      const amt = Math.max(lawn * P.grabienieLisci.rateG, P.grabienieLisci.minG);
      push({ key: 'grabienieLisci', label: P.grabienieLisci.label, qty: lawn, unit: 'm²', rateG: P.grabienieLisci.rateG, amountG: amt });
      if (input.grabienieWywoz) push({ key: 'wywozLisci', label: P.grabienieLisci.addons.wywozLisci.label, qty: 1, unit: '', amountG: P.grabienieLisci.addons.wywozLisci.priceG });
      durationMin += Math.ceil(lawn / 400) * 60;
    }
  }
  const rabaty = clampInt(input.pielenieM2, 0, 10000);
  if (rabaty > 0) {
    const off = excludeIf('pielenieRabat');
    if (off) {
      push({ key: 'pielenieRabat', label: P.pielenieRabat.label, qty: rabaty, unit: 'm²', amountG: 0, ...off });
    } else {
      const amt = Math.max(rabaty * P.pielenieRabat.rateG, P.pielenieRabat.minG);
      push({ key: 'pielenieRabat', label: P.pielenieRabat.label, qty: rabaty, unit: 'm²', rateG: P.pielenieRabat.rateG, amountG: amt });
      durationMin += Math.ceil(rabaty / 20) * 60;
    }
  }

  const chargeable = lines.some((l) => l.amountG > 0);
  const belowMin = chargeable && totalG < P.minOrderG;
  return {
    currency: P.currency,
    lines,
    totalG,
    minOrderG: P.minOrderG,
    belowMin,
    chargeable,
    durationMin: chargeable ? Math.max(60, Math.round(durationMin / 30) * 30) : 0,
    month,
  };
}

module.exports = { PRICING_OGROD, estimate, availability, inSeason, MONTHS_PL, SEASON, SERVICE_SEASON };
