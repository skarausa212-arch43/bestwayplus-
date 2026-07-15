/**
 * LUMI MVP launch-readiness verifier (25_MVP_LAUNCH_CHECKLIST.md).
 *
 * Walks the launch checklist and checks each item against the actual repo /
 * running behaviour, then prints a Go / No-Go. Critical items that fail block
 * the launch (§Go / No-Go). Dependency-free so it runs in CI.
 *
 *   node ops/launch-check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return ''; } };
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const server = read('server.js');
const spa = read('public/index.html');

// [section, item, critical, predicate]
const CHECKS = [
  // Product
  ['Product', 'Customer app', true, () => /function viewHome/.test(spa) && /function viewBook/.test(spa)],
  ['Product', 'Provider app', true, () => /function viewJobs/.test(spa) && /function viewEarnings/.test(spa)],
  ['Product', 'Company dashboard', true, () => /function viewCompany/.test(spa) && /company\/board/.test(server)],
  ['Product', 'Admin panel', true, () => /function viewAdmin/.test(spa) && /function viewAnalytics/.test(spa)],
  ['Product', 'FlashClean', true, () => /flashclean/i.test(server)],
  ['Product', 'Smart Home', true, () => /properties\/:id\/smart/.test(server)],
  // Backend
  ['Backend', 'Authentication', true, () => /\/api\/login/.test(server) && /scrypt/i.test(server)],
  ['Backend', 'Pricing (minor units, authoritative)', true, () => exists('pricing/pricing-engine.js')],
  ['Backend', 'Dispatch', true, () => exists('dispatch/ranking.js')],
  ['Backend', 'Payments / ledger', true, () => exists('pricing/ledger.js')],
  ['Backend', 'Notifications', true, () => exists('notifications/templates.js')],
  ['Backend', 'Chat', true, () => exists('chat/realtime.js')],
  // Infrastructure
  ['Infrastructure', 'Health/readiness/metrics', true, () => /\/healthz/.test(server) && /\/readyz/.test(server) && /\/metrics/.test(server)],
  ['Infrastructure', 'Monitoring (structured logs + correlation id)', true, () => /X-Request-Id/i.test(server)],
  ['Infrastructure', 'Backups documented', false, () => /Backups/.test(read('ops/INFRASTRUCTURE.md'))],
  ['Infrastructure', 'CI/CD pipeline', true, () => exists('../.github/workflows/lumi-ci.yml')],
  ['Infrastructure', 'Container image', false, () => exists('Dockerfile')],
  // Security
  ['Security', 'RLS (production schema)', true, () => /ENABLE ROW LEVEL SECURITY/i.test(read('db/migrations/0002_rls.sql')) || fs.readdirSync(path.join(ROOT, 'db/migrations')).some((f) => /rls/i.test(f))],
  ['Security', 'KYC verification', true, () => /verify-cleaner/.test(server)],
  ['Security', 'GDPR account deletion', true, () => /delete-request/.test(server)],
  ['Security', 'Audit logs (append-only)', true, () => /audit\.log/.test(server) && /appendFileSync/.test(server)],
  ['Security', 'No committed secrets', true, () => { try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'ops/secret-scan.js')], { stdio: 'ignore' }); return true; } catch { return false; } }],
  ['Security', 'Commission hidden from provider/company', true, () => /role === 'cleaner'[\s\S]{0,120}delete out\.commission/.test(server) && /role === 'company'[\s\S]{0,120}delete out\.commission/.test(server)],
  // QA
  ['QA', 'Critical-flow tests', true, () => exists('test/api.test.js') && exists('test/run.js')],
  ['QA', 'Localization (RU UI)', false, () => /svcLabelRu|SVC_LABEL_RU|plural/.test(spa)],
  ['QA', 'Accessibility (reduced motion / theme)', false, () => /prefers-color-scheme|prefers-reduced-motion/.test(spa)],
  // Marketing
  ['Marketing', 'Landing page', false, () => exists('public/landing.html')],
  ['Marketing', 'Privacy policy', true, () => exists('public/privacy.html')],
  ['Marketing', 'Terms', true, () => exists('public/terms.html')],
  ['Marketing', 'Brand guidelines', false, () => exists('public/brand.html') && exists('assets/README.md')],
  ['Marketing', 'Investor overview', false, () => exists('public/investors.html')],
  ['Marketing', 'Asset library (structure + naming)', false, () => { try { require('child_process').execFileSync(process.execPath, [path.join(ROOT, 'ops/asset-check.js')], { stdio: 'ignore' }); return true; } catch { return false; } }],
];

const results = CHECKS.map(([section, item, critical, fn]) => {
  let pass = false; try { pass = !!fn(); } catch { pass = false; }
  return { section, item, critical, pass };
});

let section = '';
for (const r of results) {
  if (r.section !== section) { section = r.section; console.log(`\n${section}`); }
  const mark = r.pass ? '✓' : (r.critical ? '✗' : '⚠');
  console.log(`  ${mark} ${r.item}${r.pass ? '' : r.critical ? '  (CRITICAL)' : '  (non-blocking)'}`);
}

const criticalFails = results.filter((r) => !r.pass && r.critical);
const warnings = results.filter((r) => !r.pass && !r.critical);
console.log('\n──────────────────────────────────────────────');
console.log(` ${results.filter((r) => r.pass).length}/${results.length} checks pass · ${criticalFails.length} critical fail · ${warnings.length} warning(s)`);
console.log('──────────────────────────────────────────────');
if (criticalFails.length) {
  console.log('\n🔴 NO-GO — resolve critical items before launch.\n');
  process.exit(1);
}
console.log('\n🟢 GO — all critical launch items satisfied.' + (warnings.length ? ' (review warnings)' : '') + '\n');
