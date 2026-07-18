'use strict';
// Unit coverage for the short-term-rental turnover logic (str/index.js).
const assert = require('assert');
const str = require('./index');

let n = 0; const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const at = (y, mo, d, h, mi) => new Date(y, mo, d, h, mi || 0).getTime();   // local time
const res = (id, ci, co, extra) => ({ id, checkinAt: ci, checkoutAt: co, status: 'confirmed', ...(extra || {}) });

ok('normalizeSettings clamps + falls back to defaults', () => {
  const s = str.normalizeSettings({ defaultCheckoutTime: '99:99', minimumBufferMinutes: 9999, expectedCleaningDuration: '' });
  assert.strictEqual(s.defaultCheckoutTime, '11:00');           // bad time → default
  assert.strictEqual(s.minimumBufferMinutes, 480);              // clamped to max
  assert.strictEqual(s.expectedCleaningDuration, null);         // empty → auto
});

ok('estimateCleaningDuration scales with size and is quarter-hour rounded', () => {
  const small = str.estimateCleaningDuration({ rooms: 1, baths: 1 });
  const big = str.estimateCleaningDuration({ rooms: 5, baths: 3, area: 120 });
  assert.ok(big > small);
  assert.strictEqual(big % 15, 0);
  assert.ok(small >= 60 && big <= 360);
});

ok('applyDefaultTimes fills check-in/out from settings when only dates given', () => {
  const s = str.normalizeSettings({ defaultCheckoutTime: '10:00', defaultCheckinTime: '16:00' });
  const r = str.applyDefaultTimes({ checkinDate: at(2026, 7, 12, 0), checkoutDate: at(2026, 7, 15, 0) }, s);
  assert.strictEqual(new Date(r.checkinAt).getHours(), 16);
  assert.strictEqual(new Date(r.checkoutAt).getHours(), 10);
});

ok('computeTurnover matches the spec window (11:00→15:00, 150m, buffer 30)', () => {
  const s = str.normalizeSettings({ expectedCleaningDuration: 150, minimumBufferMinutes: 30, startDelayMinutes: 15 });
  const t = str.computeTurnover(res('a', at(2026, 7, 12, 15), at(2026, 7, 13, 11)), res('b', at(2026, 7, 13, 15), at(2026, 7, 16, 11)), s, {});
  assert.strictEqual(new Date(t.suggestedStart).getHours() * 60 + new Date(t.suggestedStart).getMinutes(), 11 * 60 + 15);
  assert.strictEqual(new Date(t.suggestedEnd).getHours() * 60 + new Date(t.suggestedEnd).getMinutes(), 13 * 60 + 45);
  assert.strictEqual(t.kind, 'between_guests');
  assert.strictEqual(t.priority, 'high');
  assert.strictEqual(t.conflict, false);
  assert.strictEqual(t.slackMinutes, 45);
});

ok('computeTurnover flags a conflict when the window is too short', () => {
  const s = str.normalizeSettings({ expectedCleaningDuration: 150, minimumBufferMinutes: 30, startDelayMinutes: 15 });
  const t = str.computeTurnover(res('a', at(2026, 7, 13, 12), at(2026, 7, 13, 14)), res('b', at(2026, 7, 13, 15), at(2026, 7, 16, 11)), s, {});
  assert.strictEqual(t.conflict, true);
  assert.ok(t.slackMinutes < 0);
});

ok('generateTurnovers builds one per checkout with correct kind/priority (spec §7)', () => {
  const s = str.normalizeSettings({ expectedCleaningDuration: 120 });
  const rs = [
    res('r1', at(2026, 7, 10, 15), at(2026, 7, 13, 11)),
    res('r3', at(2026, 7, 19, 15), at(2026, 7, 23, 11)),
    res('r2', at(2026, 7, 13, 15), at(2026, 7, 17, 11)),   // out of order on purpose
  ];
  const ts = str.generateTurnovers(rs, s, {});
  assert.strictEqual(ts.length, 3);
  assert.strictEqual(ts[0].previousReservationId, 'r1');
  assert.strictEqual(ts[0].kind, 'between_guests');       // Aug13 checkout → Aug13 checkin
  assert.strictEqual(ts[0].priority, 'high');
  assert.strictEqual(ts[1].kind, 'after_checkout');       // Aug17 → Aug19
  assert.strictEqual(ts[2].nextReservationId, null);      // last stay, open-ended
  assert.strictEqual(ts[2].kind, 'after_checkout');
});

ok('findDuplicate catches re-imports (external id, same dates, overlap)', () => {
  const existing = [res('e1', at(2026, 7, 12, 15), at(2026, 7, 15, 11), { source: 'airbnb', externalBookingId: 'HMX1' })];
  assert.strictEqual(str.findDuplicate(existing, { checkinAt: at(2026, 7, 12, 14), checkoutAt: at(2026, 7, 15, 12), externalBookingId: 'HMX1' }), existing[0]);
  assert.strictEqual(str.findDuplicate(existing, { checkinAt: at(2026, 7, 12, 15), checkoutAt: at(2026, 7, 15, 11) }), existing[0]);
  assert.strictEqual(str.findDuplicate(existing, { checkinAt: at(2026, 8, 1, 15), checkoutAt: at(2026, 8, 4, 11) }), null);
});

ok('parseCalendarText reads RU / EN / ISO ranges with a confidence score', () => {
  const r = str.parseCalendarText('12–15 августа Airbnb\nAug 18-21 Booking.com\n2026-09-01 to 2026-09-04', { year: 2026 });
  assert.strictEqual(r.reservations.length, 3);
  assert.strictEqual(r.reservations[0].source, 'airbnb');
  assert.strictEqual(r.reservations[0].nights, 3);
  assert.strictEqual(r.reservations[1].source, 'booking');
  assert.ok(r.reservations[2].confidence >= 0.95);        // ISO is high-confidence
  assert.ok(r.confidence > 0 && r.confidence <= 1);
});

ok('parseCalendarText lowers confidence + flags source when undetectable', () => {
  const r = str.parseCalendarText('21–25 августа', { year: 2026 });
  assert.strictEqual(r.reservations.length, 1);
  assert.strictEqual(r.reservations[0].sourceDetected, false);
  assert.ok(r.reservations[0].confidence < 0.8);
});

console.log(`\n${n} STR checks passed.`);
