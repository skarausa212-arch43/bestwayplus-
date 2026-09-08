/**
 * Self-checks for the chat/realtime core (16_CHAT_REALTIME.md §21).
 *   node chat/test.js
 */
'use strict';
const assert = require('assert');
const rt = require('./realtime');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const cust = { id: 'u_c', role: 'customer', name: 'Anna' };
const prov = { id: 'u_p', role: 'cleaner', name: 'Marek' };

ok('normalizeMessage builds the §5 schema and clamps type', () => {
  const m = rt.normalizeMessage({ type: 'weird', text: 'привет' }, { id: 'm1', conversationId: 'b1', sender: cust, at: 100 });
  assert.strictEqual(m.type, 'text');            // unknown type falls back
  assert.strictEqual(m.conversationId, 'b1');
  assert.strictEqual(m.senderId, 'u_c');
  assert.strictEqual(m.status, 'sent');
  assert.strictEqual(m.translatedBody, null);
  assert.ok('createdAt' in m && 'editedAt' in m && 'deletedAt' in m && 'replyTo' in m);
});

ok('image messages keep attachments (capped at 6)', () => {
  const atts = Array.from({ length: 9 }, (_, i) => 'data:image/png;base64,' + i);
  const m = rt.normalizeMessage({ type: 'image', attachments: atts }, { id: 'm2', conversationId: 'b1', sender: prov, at: 100 });
  assert.strictEqual(m.type, 'image');
  assert.strictEqual(m.attachments.length, 6);
});

ok('delivery status: only the sender sees receipts; progresses sent→read', () => {
  const msg = rt.normalizeMessage({ text: 'hi' }, { id: 'm3', conversationId: 'b1', sender: cust, at: 200 });
  // No reads yet from the provider.
  assert.strictEqual(rt.deliveryStatus(msg, {}, cust.id), 'sent');
  // The other participant only ever sees null (no receipt exposed to them).
  assert.strictEqual(rt.deliveryStatus(msg, {}, prov.id), null);
  // Provider read something older than this message.
  assert.strictEqual(rt.deliveryStatus(msg, { [prov.id]: { at: 150 } }, cust.id), 'delivered');
  // Provider read up to/after this message.
  assert.strictEqual(rt.deliveryStatus(msg, { [prov.id]: { at: 200 } }, cust.id), 'read');
});

ok('unreadCount ignores own + system messages and respects lastReadAt', () => {
  const msgs = [
    rt.normalizeMessage({ text: 'a' }, { id: 'a', conversationId: 'b', sender: prov, at: 10 }),
    rt.normalizeMessage({ text: 'b' }, { id: 'b', conversationId: 'b', sender: cust, at: 20 }),
    rt.normalizeMessage({ text: 'c' }, { id: 'c', conversationId: 'b', sender: prov, at: 30 }),
    { id: 's', conversationId: 'b', senderId: 'system', createdAt: 40 },
  ];
  // Customer read up to t=10 → messages from provider after 10 that aren't system: only 'c'.
  assert.strictEqual(rt.unreadCount(msgs, { [cust.id]: { at: 10 } }, cust.id), 1);
  // Fresh viewer (no read record) sees both provider messages, not their own, not system.
  assert.strictEqual(rt.unreadCount(msgs, {}, cust.id), 2);
});

ok('typing indicator expires after TTL and hides the viewer', () => {
  const nowMs = 1000000;
  const typing = {
    [prov.id]: { name: 'Marek', at: nowMs - 1000 },          // fresh
    [cust.id]: { name: 'Anna', at: nowMs - 1000 },           // viewer — hidden
    u_x: { name: 'Old', at: nowMs - rt.TYPING_TTL_MS - 1 },  // expired
  };
  const typers = rt.activeTypers(typing, cust.id, nowMs);
  assert.strictEqual(typers.length, 1);
  assert.strictEqual(typers[0].userId, prov.id);
});

ok('translation never overwrites the original (§11)', () => {
  const r = rt.translate('Привет, спасибо', 'en');
  assert.strictEqual(r.original, 'Привет, спасибо');   // source preserved verbatim
  assert.strictEqual(r.language, 'ru');
  assert.strictEqual(r.target, 'en');
  assert.ok(/Hi/i.test(r.translated) && /thank you/i.test(r.translated));
  // Unknown words pass through untouched (no fabrication).
  assert.ok(rt.translate('foobar', 'en').translated.includes('foobar'));
});

ok('provider ETA grows with distance and never hits zero', () => {
  assert.strictEqual(rt.etaMinutes(0), 1);
  assert.ok(rt.etaMinutes(8) > rt.etaMinutes(2));
});

ok('detectContact blocks contact-sharing (anti-disintermediation)', () => {
  // blocked cases
  assert.ok(rt.detectContact('пишите на anna@mail.ru').blocked);
  assert.ok(rt.detectContact('мой номер +48 600 700 800').blocked);
  assert.ok(rt.detectContact('телефон 600700800').blocked);
  assert.ok(rt.detectContact('мой ник @anna_clean').blocked);
  assert.ok(rt.detectContact('давай в телеграм').blocked);
  assert.ok(rt.detectContact('я в инстаграм anna').blocked);
  assert.ok(rt.detectContact('напиши в whatsapp').blocked);
  assert.strictEqual(rt.detectContact('звони +48600700800').reason, 'phone');
  // allowed: normal chat, small numbers, no handles
  assert.ok(!rt.detectContact('код от двери 1234, приезжайте к 8').blocked);
  assert.ok(!rt.detectContact('спасибо, всё чисто!').blocked);
  assert.ok(!rt.detectContact('в квартире 2 санузла и 48 м2').blocked);
  assert.ok(!rt.detectContact('следуйте инструкции на кухне').blocked);   // «инстр…» is not «инста»
});

console.log(`\n${n} chat/realtime checks passed.`);
