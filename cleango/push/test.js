'use strict';
/** Push module unit tests — the pure message builder + enabled gate. The FCM
 *  network path is never exercised (no service account in tests). */
const assert = require('assert');
const push = require('./index');

// Disabled by default (no service account) → send() is a safe no-op.
assert.strictEqual(push.isEnabled(), false, 'push off without a service account');
(async () => {
  const r = await push.send(['tok1', 'tok2'], { title: 'Hi', body: 'x' });
  assert.strictEqual(r.skipped, true, 'send skips when disabled');
  assert.strictEqual(r.sent, 0);
})();

// buildMessage shapes a valid FCM HTTP v1 body.
const m = push.buildMessage('DEVICE_TOKEN', {
  title: 'Проблема после гостя', body: 'Проверьте квартиру', deepLink: 'lumi://booking/b1', bookingId: 'b1', priority: 'urgent',
});
assert.strictEqual(m.message.token, 'DEVICE_TOKEN');
assert.strictEqual(m.message.notification.title, 'Проблема после гостя');
assert.strictEqual(m.message.notification.body, 'Проверьте квартиру');
assert.strictEqual(m.message.data.deepLink, 'lumi://booking/b1');
assert.strictEqual(m.message.data.bookingId, 'b1');
assert.strictEqual(m.message.android.priority, 'high', 'urgent maps to high priority');
assert.strictEqual(m.message.apns.payload.aps.sound, 'default');

// Defaults + extra data are stringified.
const m2 = push.buildMessage('T', { data: { count: 3, kind: 'x' } });
assert.strictEqual(m2.message.notification.title, 'LUMI');
assert.strictEqual(m2.message.data.count, '3');
assert.strictEqual(m2.message.android.priority, 'normal');

console.log('✓ push: enabled gate, no-op send, and FCM message builder all pass');
