/**
 * Notification templates — localization contract.
 *
 * Every template must exist in all four locales, with placeholders identical to
 * the ru original (a mismatch silently renders an empty {slot} to the user),
 * and delivery must pick the recipient's locale rather than falling back to ru.
 */
'use strict';
const assert = require('assert');
const { TEMPLATES, renderTemplate, getTemplate } = require('./templates');

const ph = (o) => [...new Set((o.title + ' ' + o.body).match(/\{[a-zA-Z]+\}/g) || [])].sort().join(',');
const ids = Object.keys(TEMPLATES);
let n = 0;

for (const id of ids) {
  const t = TEMPLATES[id];
  assert.ok(t.category && t.priority && Array.isArray(t.channels), `${id}: missing metadata`);
  for (const l of ['ru', 'pl', 'en', 'uk']) {
    assert.ok(t[l] && t[l].title && t[l].body, `${id}: missing ${l} text`);
    assert.strictEqual(ph(t[l]), ph(t.ru), `${id}: ${l} placeholders differ from ru`);
  }
}
n++; console.log(`  ok - ${ids.length} templates localized in ru/pl/en/uk with matching placeholders`);

// Delivery picks the recipient's locale.
const acc = renderTemplate('booking.accepted', { provider: 'Piotr' }, 'pl');
assert.ok(/Wykonawca/.test(acc.title), 'pl locale not selected: ' + acc.title);
assert.ok(/Piotr/.test(acc.body), 'placeholder not substituted');
const en = renderTemplate('booking.accepted', { provider: 'Piotr' }, 'en');
assert.ok(/Provider found/.test(en.title), 'en locale not selected');
const uk = renderTemplate('payout.sent', { amount: '381 zł' }, 'uk');
assert.ok(/381 zł/.test(uk.body), 'uk substitution');
n++; console.log('  ok - renderTemplate selects the recipient locale and substitutes params');

// Unknown locale falls back to ru; unknown template returns null.
assert.ok(/Исполнитель найден/.test(renderTemplate('booking.accepted', {}, 'de').title), 'fallback to ru');
assert.strictEqual(renderTemplate('nope.nope', {}, 'ru'), null, 'unknown template → null');
assert.ok(getTemplate('booking.created'), 'getTemplate works');
n++; console.log('  ok - unknown locale falls back to ru; unknown template is null');

console.log(`\n${n} notification checks passed.`);
