#!/usr/bin/env node
/* City price-book tests — money stays integer grosz; per-city numbers match the card. */
'use strict';
const assert = require('assert');
const C = require('./city-prices');

// 1 — Warsaw apartment base by size (grosz), incl. extra room/bath steps.
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 1, baths: 1 }), 14390, '1-room = 143.90');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 2, baths: 1 }), 17590, '2-room = 175.90');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 3, baths: 1 }), 20790, '3-room = 207.90');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 4, baths: 1 }), 20790 + 3200, '4-room = 3-room + extraRoom');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 2, baths: 3 }), 17590 + 2 * 3600, '+2 extra baths');

// 2 — every value is integer grosz.
for (const city of ['Warsaw', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Łódź'])
  for (const rooms of [1, 2, 3, 5])
    assert.ok(Number.isInteger(C.basePackageMinor(city, 'standard', { rooms })), `${city} ${rooms} integer grosz`);

// 3 — Kraków > Warsaw base for the same flat (card has Warsaw cheapest).
assert.ok(C.basePackageMinor('Kraków', 'standard', { rooms: 2 }) > C.basePackageMinor('Warsaw', 'standard', { rooms: 2 }), 'Kraków base above Warsaw');

// 4 — deep = standard × 1.5; house = +15%; STR = apartment.
const stdW = C.basePackageMinor('Warsaw', 'standard', { rooms: 2 });
assert.strictEqual(C.basePackageMinor('Warsaw', 'deep', { rooms: 2 }), Math.round(stdW * 1.5), 'deep coefficient');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 2, propertyType: 'house' }), Math.round(stdW * 1.15), 'house +15%');
assert.strictEqual(C.basePackageMinor('Warsaw', 'standard', { rooms: 2, propertyType: 'short_term_rental' }), stdW, 'STR = apartment');

// 5 — move-out is area-based (cena/m²) and floored at the 2-room base.
const big = C.basePackageMinor('Warsaw', 'moveout', { rooms: 3, area: 100 });
assert.strictEqual(big, Math.round(100 * 640), 'moveout = area × cena/m²');
const smallMove = C.basePackageMinor('Warsaw', 'moveout', { rooms: 1, area: 10 });
assert.strictEqual(smallMove, C.cityBook('Warsaw').apartment.r2, 'moveout floored at 2-room base');

// 6 — «od X zł» starting price.
assert.strictEqual(C.serviceFromMinor('Warsaw', 'standard'), 14390, 'standard od = 1-room');
assert.strictEqual(C.serviceFromMinor('Warsaw', 'moveout'), C.cityBook('Warsaw').apartment.r2, 'moveout od = 2-room floor');

// 7 — per-city add-on prices via the EXTRAS_CATALOG key map.
assert.strictEqual(C.addonMinor('Warsaw', 'cabinets'), 5200, 'Warsaw kitchen cabinets 52');
assert.strictEqual(C.addonMinor('Kraków', 'cabinets'), 4700, 'Kraków kitchen cabinets 47');
assert.strictEqual(C.addonMinor('Warsaw', 'oven'), 3200, 'oven 32');
assert.strictEqual(C.addonMinor('Warsaw', 'dc_carpet'), 1360, 'Warsaw carpet 13.60/m²');
assert.strictEqual(C.addonMinor('Kraków', 'dc_carpet'), 800, 'Kraków carpet 8.00/m²');
assert.strictEqual(C.addonMinor('Warsaw', 'nonexistent_key'), null, 'unmapped add-on → null (caller keeps default)');

// 8 — frequency discounts.
assert.strictEqual(C.frequencyDiscountRate('weekly'), 0.20);
assert.strictEqual(C.frequencyDiscountRate('biweekly'), 0.15);
assert.strictEqual(C.frequencyDiscountRate('monthly'), 0.10);
assert.strictEqual(C.frequencyDiscountRate('once'), 0);
assert.strictEqual(C.frequencyDiscountRate(undefined), 0, 'unknown frequency = no discount');

// 9 — unknown city falls back to Warsaw (never throws).
assert.strictEqual(C.basePackageMinor('Atlantis', 'standard', { rooms: 1 }), 14390, 'unknown city → Warsaw');

console.log('city-prices: all checks passed.');
