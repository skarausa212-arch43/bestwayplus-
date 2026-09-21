/**
 * LUMI city price book — the single source of truth for per-city prices
 * (Warsaw, Kraków, Wrocław, Poznań, Gdańsk, Łódź). 2026.07 rate card,
 * positioned ~20% under CleanWhale's regular-cleaning list price.
 *
 * All money is INTEGER MINOR UNITS (grosz) — never floating-point money.
 * Pure + dependency-free; consumed by pricing-engine.js and server.js so the
 * fast estimate and the authoritative quote always agree.
 *
 * Model (spec):
 *  - Apartment base «1/2/3 rooms» includes pokoje + kuchnia + przedpokój + 1
 *    łazienka (3/4/5 h). Each extra room: +extraRoom; each extra bath: +extraBath.
 *  - Дом (house): same tariff +15% on the base package.
 *  - Посуточная аренда (STR/Airbnb): same as apartment.
 *  - Генеральная (deep): no separate list price in the card → documented ×1.5.
 *  - После ремонта (moveout/po remoncie): area-based (cena/m²), floored at the
 *    2-room base; per-window price separate.
 *  - Офис (office): by request (wycena) — not priced here.
 *  - Frequency discounts apply to the BASE package only, never to add-ons.
 */
'use strict';

const zl = (v) => Math.round(v * 100);   // zł → grosz (minor units) for the static card only

const FREQUENCY_DISCOUNTS = { weekly: 0.20, biweekly: 0.15, monthly: 0.10, once: 0 };

// Coefficients the card doesn't give explicitly.
const DEEP_COEF = 1.5;     // Генеральная = Обычная × 1.5 (documented; card lists regular only)
const HOUSE_COEF = 1.15;   // Дом = +15% on the base package

const CITIES = {
  warsaw: {
    apartment: { r1: zl(143.90), r2: zl(175.90), r3: zl(207.90), extraRoom: zl(32), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(52), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(28), oknoSzt: zl(32), prasowanieH: zl(40), kuweta: zl(8), dodatkowaGodzina: zl(36), garderoba: zl(24), zmywarka: zl(40), balustradaSzklana: zl(16) },
    tapicerka: { sofa2os: zl(132), sofa3os: zl(148), naroznik4: zl(159), naroznik56: zl(176), naroznik7plus: zl(192), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(13.60), fotel: zl(44), krzeslo: zl(18), krzesloBiurowe: zl(18), zaglowek: zl(104), wozek: zl(53) },
    poRemoncie: { cenaM2: zl(6.40), oknoSzt: zl(48) },
  },
  krakow: {
    apartment: { r1: zl(151.90), r2: zl(187.90), r3: zl(223.90), extraRoom: zl(36), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(47), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(24), oknoSzt: zl(32), prasowanieH: zl(36), kuweta: zl(8), dodatkowaGodzina: zl(40), garderoba: zl(24) },
    tapicerka: { sofa2os: zl(112), sofa3os: zl(128), naroznik4: zl(136), naroznik56: zl(152), naroznik7plus: zl(160), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(8.00), fotel: zl(40), krzeslo: zl(16), krzesloBiurowe: zl(16), zaglowek: zl(96), wozek: zl(56) },
    poRemoncie: { cenaM2: zl(4.80), oknoSzt: zl(40) },
  },
  wroclaw: {
    apartment: { r1: zl(151.90), r2: zl(187.90), r3: zl(223.90), extraRoom: zl(36), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(47), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(24), oknoSzt: zl(32), prasowanieH: zl(40), kuweta: zl(8), dodatkowaGodzina: zl(40), garderoba: zl(24) },
    tapicerka: { sofa2os: zl(112), sofa3os: zl(128), naroznik4: zl(136), naroznik56: zl(152), naroznik7plus: zl(160), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(9.60), fotel: zl(40), krzeslo: zl(16), krzesloBiurowe: zl(16), zaglowek: zl(96), wozek: zl(56) },
    poRemoncie: { cenaM2: zl(5.60), oknoSzt: zl(40) },
  },
  poznan: {
    apartment: { r1: zl(147.90), r2: zl(183.90), r3: zl(219.90), extraRoom: zl(36), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(47), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(24), oknoSzt: zl(32), prasowanieH: zl(36), kuweta: zl(8), dodatkowaGodzina: zl(40), garderoba: zl(24) },
    tapicerka: { sofa2os: zl(112), sofa3os: zl(128), naroznik4: zl(136), naroznik56: zl(152), naroznik7plus: zl(160), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(9.60), fotel: zl(40), krzeslo: zl(16), krzesloBiurowe: zl(16), zaglowek: zl(96), wozek: zl(56) },
    poRemoncie: { cenaM2: zl(5.60), oknoSzt: zl(40) },
  },
  gdansk: {
    apartment: { r1: zl(151.90), r2: zl(187.90), r3: zl(223.90), extraRoom: zl(36), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(47), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(24), oknoSzt: zl(32), prasowanieH: zl(36), kuweta: zl(8), dodatkowaGodzina: zl(40), garderoba: zl(24) },
    tapicerka: { sofa2os: zl(112), sofa3os: zl(128), naroznik4: zl(136), naroznik56: zl(152), naroznik7plus: zl(160), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(8.00), fotel: zl(40), krzeslo: zl(16), krzesloBiurowe: zl(16), zaglowek: zl(96), wozek: zl(48) },
    poRemoncie: { cenaM2: zl(4.80), oknoSzt: zl(40) },
  },
  lodz: {
    apartment: { r1: zl(147.90), r2: zl(183.90), r3: zl(219.90), extraRoom: zl(36), extraBath: zl(36) },
    addons: { piekarnik: zl(32), okap: zl(32), szafkiKuchenne: zl(47), naczynia: zl(20), lodowka: zl(32), mikrofalowka: zl(14), balkon: zl(24), oknoSzt: zl(32), prasowanieH: zl(36), kuweta: zl(8), dodatkowaGodzina: zl(40), garderoba: zl(24) },
    tapicerka: { sofa2os: zl(112), sofa3os: zl(128), naroznik4: zl(136), naroznik56: zl(152), naroznik7plus: zl(160), materac1os: zl(56), materac1osDwieStrony: zl(112), materac2os: zl(112), materac2osDwieStrony: zl(224), dywanM2: zl(9.60), fotel: zl(40), krzeslo: zl(16), krzesloBiurowe: zl(16), zaglowek: zl(96), wozek: zl(56) },
    poRemoncie: { cenaM2: zl(5.60), oknoSzt: zl(40) },
  },
};

// Display city name → book key. Falls back to Warsaw for anything unknown.
const CITY_KEY = { Warsaw: 'warsaw', 'Kraków': 'krakow', Krakow: 'krakow', 'Wrocław': 'wroclaw', Wroclaw: 'wroclaw', 'Poznań': 'poznan', Poznan: 'poznan', 'Gdańsk': 'gdansk', Gdansk: 'gdansk', 'Łódź': 'lodz', Lodz: 'lodz' };
function bookKey(city) { return CITY_KEY[city] || (CITIES[String(city || '').toLowerCase()] ? String(city).toLowerCase() : 'warsaw'); }
function cityBook(city) { return CITIES[bookKey(city)]; }

const clampRooms = (n) => Math.max(1, Math.min(12, Math.round(Number(n) || 1)));
const clampBaths = (n) => Math.max(0, Math.min(8, Math.round(Number(n) || 0)));
const clampArea = (n) => Math.max(0, Math.min(600, Number(n) || 0));
const estAreaFromRooms = (rooms) => 24 + clampRooms(rooms) * 18;   // rough m² when the customer skips area

// Base package price in grosz for the given city/service/size (before add-ons,
// multipliers and frequency discount). propertyType: apartment|house|short_term_rental|office.
function basePackageMinor(city, service, opts = {}) {
  const b = cityBook(city);
  const rooms = clampRooms(opts.rooms);
  const baths = clampBaths(opts.baths == null ? 1 : opts.baths);
  const area = clampArea(opts.area);
  const propertyType = opts.propertyType || 'apartment';

  if (service === 'moveout') {
    const m2 = area || estAreaFromRooms(rooms);
    const perM2 = Math.round(m2 * b.poRemoncie.cenaM2);
    return Math.max(b.apartment.r2, perM2);           // floor at the 2-room base
  }

  const a = b.apartment;
  let base = rooms <= 1 ? a.r1 : rooms === 2 ? a.r2 : a.r3 + (rooms - 3) * a.extraRoom;
  base += Math.max(0, baths - 1) * a.extraBath;
  if (service === 'deep') base = Math.round(base * DEEP_COEF);
  if (propertyType === 'house') base = Math.round(base * HOUSE_COEF);
  return base;
}

// The «od X zł» starting price for a service tile in a given city (smallest realistic job).
function serviceFromMinor(city, service) {
  if (service === 'moveout') return cityBook(city).apartment.r2;
  return basePackageMinor(city, service, { rooms: 1, baths: 1 });
}

// Per-city price (grosz) for an à-la-carte add-on, keyed by the app's EXTRAS_CATALOG
// key. Returns null when the card has no city-specific price (caller keeps its default).
const ADDON_MAP = {           // EXTRAS_CATALOG key → city book addon/tapicerka path
  oven: ['addons', 'piekarnik'], cabinets: ['addons', 'szafkiKuchenne'], fridge: ['addons', 'lodowka'],
  microwave: ['addons', 'mikrofalowka'], balcony: ['addons', 'balkon'], windows: ['addons', 'oknoSzt'],
  windows_out: ['addons', 'oknoSzt'], ironing: ['addons', 'prasowanieH'], petlitter: ['addons', 'kuweta'],
  wardrobe: ['addons', 'garderoba'],
  dc_sofa: ['tapicerka', 'sofa3os'], dc_chair: ['tapicerka', 'fotel'], dc_mattress: ['tapicerka', 'materac2os'],
  dc_carpet: ['tapicerka', 'dywanM2'],
};
function addonMinor(city, extrasKey) {
  const path = ADDON_MAP[extrasKey];
  if (!path) return null;
  const b = cityBook(city);
  const v = b[path[0]] && b[path[0]][path[1]];
  return typeof v === 'number' ? v : null;
}

function frequencyDiscountRate(freq) {
  return FREQUENCY_DISCOUNTS[freq] || 0;
}

const CITY_KEYS = Object.keys(CITIES);
const toMajor = (minor) => Math.round(minor) / 100;

module.exports = {
  CITIES, CITY_KEY, CITY_KEYS, FREQUENCY_DISCOUNTS, DEEP_COEF, HOUSE_COEF,
  bookKey, cityBook, basePackageMinor, serviceFromMinor, addonMinor,
  frequencyDiscountRate, estAreaFromRooms, toMajor,
};
