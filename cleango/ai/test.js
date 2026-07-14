#!/usr/bin/env node
/* Smoke test for the AI provider (10_AI_ARCHITECTURE.md guarantees). */
'use strict';
const assert = require('assert');
const { createAIProvider } = require('./ai-provider');
const ai = createAIProvider();

function hasEnvelope(r, mod) {
  assert.ok(r.data, 'data present');
  assert.strictEqual(r.meta.module, mod, 'module tag');
  assert.ok(r.meta.model && r.meta.promptVersion, 'model + prompt version stored');
  assert.ok(r.meta.confidence >= 0 && r.meta.confidence <= 1, 'confidence 0..1');
  assert.strictEqual(typeof r.meta.fallback, 'boolean', 'fallback flag');
  assert.ok(r.meta.at > 0, 'timestamp');
}

// estimate
const est = ai.estimateBooking({ service: 'deep', rooms: 3, baths: 2, extras: ['oven'] });
hasEnvelope(est, 'estimate');
assert.ok(est.data.estimatedDurationMinutes > 0 && est.data.estimatedWorkers >= 1);

// low-confidence estimate flags fallback
const big = ai.estimateBooking({ service: 'deep', rooms: 12, baths: 8, extras: ['a','b','c','d'] });
assert.strictEqual(big.meta.fallback, true, 'large job -> fallback');

// recommendations
const rec = ai.recommendServices([
  { key: 'windows', label: 'Window cleaning', book: 'windows', status: 'overdue', daysLeft: -30 },
  { key: 'sofa', label: 'Sofa', book: 'deep', status: 'ok', daysLeft: 60 },
]);
hasEnvelope(rec, 'recommend');
assert.strictEqual(rec.data.items.length, 1, 'only due items recommended');
assert.ok(rec.data.items[0].explanation, 'recommendation has explanation');

// home Q&A never fabricates
const tl = [
  { service: 'windows', serviceLabel: 'Window Cleaning', at: Date.now(), price: 109 },
  { service: 'standard', serviceLabel: 'Standard Cleaning', at: Date.now() - 8.64e7, price: 174 },
];
const q1 = ai.answerHomeQuestion('когда мыли окна?', tl);
hasEnvelope(q1, 'home_qa');
assert.ok(/Window Cleaning|окн/i.test(q1.data.answer), 'answers window question');
const q2 = ai.answerHomeQuestion('когда убирали офис?', tl); // office recognized but no record
assert.match(q2.data.answer, /нет записей|Ничего/i, 'does not fabricate missing history');
assert.strictEqual(q2.data.matches.length, 0, 'no matches for absent service');
const q3 = ai.answerHomeQuestion('сколько потратили?', tl);
assert.ok(/283/.test(q3.data.answer), 'sums spend from history');

// photo analysis is advisory + low confidence for the heuristic placeholder
const pa = ai.analyzeImages(['data:image/png;base64,AAAA']);
hasEnvelope(pa, 'photo_analysis');
assert.strictEqual(pa.meta.fallback, true, 'photo heuristic flags fallback');

console.log('✓ AI provider: envelopes, confidence/fallback, recommendations, and no-fabrication history all pass');
