/**
 * LUMI test runner & release gate (24_TESTING_STRATEGY.md).
 *
 * Runs the whole pyramid we have in this repo — pure-unit module suites plus the
 * API/integration flow suite — and exits non-zero if ANYTHING fails, so CI can
 * block a release on a critical failure or payment regression (§Release Gates).
 *
 *   node test/run.js       →  runs everything, prints a summary
 */
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
// Unit suites (pure domain logic) + the integration/API suite last.
const suites = [
  ['unit', 'ai/test.js'],
  ['unit', 'dispatch/test.js'],
  ['unit', 'pricing/test.js'],
  ['unit', 'pricing/city-prices.test.js'],
  ['unit', 'pricing/ogrod.test.js'],
  ['unit', 'chat/test.js'],
  ['unit', 'smart-home/test.js'],
  ['unit', 'admin/test.js'],
  ['unit', 'analytics/test.js'],
  ['unit', 'flags/test.js'],
  ['unit', 'mailer/test.js'],
  ['unit', 'auth/test.js'],
  ['unit', 'str/test.js'],
  ['unit', 'push/test.js'],
  ['unit', 'pay/test.js'],
  ['unit', 'pay/stripe.test.js'],
  ['integration', 'test/api.test.js'],
  ['integration', 'test/payments-policy.test.js'],
  ['integration', 'test/city-gating.test.js'],
];

let failed = 0;
const results = [];
for (const [kind, rel] of suites) {
  process.stdout.write(`\n▶ [${kind}] ${rel}\n`);
  const r = spawnSync(process.execPath, [path.join(root, rel)], {
    stdio: 'inherit',
    env: { ...process.env, LUMI_QUIET: '1' },
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push({ rel, ok });
}

console.log('\n──────────────────────────────────────────────');
console.log(' Test summary');
console.log('──────────────────────────────────────────────');
for (const { rel, ok } of results) console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${rel}`);
console.log('──────────────────────────────────────────────');
if (failed) {
  console.log(`\n✗ ${failed} suite(s) failed — release BLOCKED.\n`);
  process.exit(1);
}
console.log(`\n✓ All ${results.length} suites passed — release gate OPEN.\n`);
