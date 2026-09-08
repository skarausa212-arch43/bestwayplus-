/**
 * Master-rules conformance check (29_CLAUDE_CODE_MASTER_RULES.md).
 * Asserts the machine-checkable engineering invariants hold in the codebase, so
 * a regression that violates a core rule fails CI. Dependency-free.
 *
 *   node ops/rules-check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const server = read('server.js');
const spa = read('public/index.html');

const RULES = [
  ['Security', 'Commission never exposed to cleaners', () => /role === 'cleaner'[\s\S]{0,140}delete out\.commission/.test(server)],
  ['Security', 'Commission never exposed to companies', () => /role === 'company'[\s\S]{0,140}delete out\.commission/.test(server)],
  ['Security', 'No committed secrets', () => { try { execFileSync(process.execPath, [path.join(ROOT, 'ops/secret-scan.js')], { stdio: 'ignore' }); return true; } catch { return false; } }],
  ['Security', 'Permissions validated server-side (capability guard)', () => /function requireCap/.test(server) && /rbac\.can/.test(server)],
  ['Security', 'High-risk actions audited (append-only)', () => /appendFileSync\(auditFile/.test(server)],
  ['Backend', 'Immutable ledger module present', () => exists('pricing/ledger.js')],
  ['Backend', 'Idempotent financial writes (keyed ledger)', () => /ledger\.record\([^)]*,\s*`?(capture|payout|revenue|cancelfee)/.test(server)],
  ['Backend', 'Money in minor units (grosz), not floats', () => /amountMinor|Math\.round\([^)]*\* 100\)/.test(server)],
  ['Backend', 'RLS present in production schema', () => fs.readdirSync(path.join(ROOT, 'db/migrations')).some((f) => /rls/i.test(f))],
  ['UI', 'Design tokens exist and are used', () => exists('design/tokens.css') && /var\(--/.test(spa)],
  ['UI', 'Dark mode + localization', () => /prefers-color-scheme/.test(spa) && /svcLabelRu|plural/.test(spa)],
  ['UI', 'Accessibility: reduced motion honoured', () => /prefers-reduced-motion/.test(spa)],
  ['Testing', 'Release-gate runner + API suite exist', () => exists('test/run.js') && exists('test/api.test.js')],
  ['Testing', 'Deterministic financial tests', () => /idempoten|append-only/i.test(read('pricing/test.js'))],
  ['Architecture', 'Server-authoritative pricing (client never prices)', () => /pricing\/pricing-engine/.test(server) && exists('pricing/pricing-engine.js')],
  ['Architecture', 'Modular domain folders with tests', () => ['ai', 'dispatch', 'pricing', 'chat', 'smart-home', 'admin', 'analytics', 'flags'].every((d) => exists(d + '/test.js'))],
];

const results = RULES.map(([area, rule, fn]) => { let pass = false; try { pass = !!fn(); } catch {} return { area, rule, pass }; });
let area = '';
for (const r of results) {
  if (r.area !== area) { area = r.area; console.log(`\n${area}`); }
  console.log(`  ${r.pass ? '✓' : '✗'} ${r.rule}`);
}
const fails = results.filter((r) => !r.pass);
console.log('\n──────────────────────────────────────────────');
console.log(` ${results.length - fails.length}/${results.length} master rules upheld`);
console.log('──────────────────────────────────────────────');
if (fails.length) { console.log('\n✗ Master-rule violations — fix before merge.\n'); process.exit(1); }
console.log('\n✓ All master rules upheld.\n');
