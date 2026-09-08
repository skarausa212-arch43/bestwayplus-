/**
 * Self-checks for feature flags (26_ROADMAP_V2.md).
 *   node flags/test.js
 */
'use strict';
const assert = require('assert');
const f = require('./flags');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

ok('Phase-1 features ship on, later phases ship dark', () => {
  const map = f.flagsFor(null);
  assert.strictEqual(map.flashclean, true);
  assert.strictEqual(map.smart_home, true);
  assert.strictEqual(map.service_plumbing, false);
  assert.strictEqual(map.ai_voice_assistant, false);
});

ok('admin override can enable a dark flag', () => {
  const overrides = { service_plumbing: { enabled: true } };
  assert.strictEqual(f.isEnabled('service_plumbing', null, overrides), true);
  assert.strictEqual(f.flagsFor(null, overrides).service_plumbing, true);
});

ok('unknown flags are always off', () => {
  assert.strictEqual(f.isEnabled('does_not_exist', null), false);
});

ok('role scoping restricts a flag to matching roles', () => {
  const overrides = { corporate: { enabled: true, roles: ['company'] } };
  assert.strictEqual(f.isEnabled('corporate', { role: 'company' }, overrides), true);
  assert.strictEqual(f.isEnabled('corporate', { role: 'customer' }, overrides), false);
});

ok('percentage rollout is deterministic per user and splits the base', () => {
  const overrides = { service_gardening: { enabled: true, rollout: 50 } };
  // same user → same answer across calls
  const u = { id: 'user-123' };
  const a = f.isEnabled('service_gardening', u, overrides);
  const b = f.isEnabled('service_gardening', u, overrides);
  assert.strictEqual(a, b);
  // across many users the split is roughly the rollout percentage
  let on = 0; const N = 2000;
  for (let i = 0; i < N; i++) if (f.isEnabled('service_gardening', { id: 'u' + i }, overrides)) on++;
  const share = on / N;
  assert.ok(share > 0.4 && share < 0.6, 'rollout share ~50%, got ' + share);
});

ok('rollout 0 and 100 are hard off/on', () => {
  assert.strictEqual(f.isEnabled('service_painting', { id: 'x' }, { service_painting: { enabled: true, rollout: 0 } }), false);
  assert.strictEqual(f.isEnabled('service_painting', { id: 'x' }, { service_painting: { enabled: true, rollout: 100 } }), true);
});

ok('catalogue lists every flag with phase + effective default', () => {
  const cat = f.catalogue();
  assert.ok(cat.length >= 15);
  const fc = cat.find((c) => c.key === 'flashclean');
  assert.strictEqual(fc.phase, 1);
  assert.strictEqual(fc.enabled, true);
});

console.log(`\n${n} feature-flag checks passed.`);
