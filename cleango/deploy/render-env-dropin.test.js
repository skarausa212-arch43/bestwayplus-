/**
 * Tests for the systemd env drop-in renderer.
 *
 * Every case here is a way a real SMTP password silently stopped reaching the
 * service: a space in the value, a quote, a CRLF file, a stray line. The
 * failure mode is always the same from the outside — "почта настроена, но не
 * уходит" — so each one gets a test.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { render, loadInstanceEnv } = require('./render-env-dropin');

const results = [];
const ok = (name, fn) => { try { fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };

// Write a throwaway pair of env files and render them.
function withFiles(tracked, local) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-env-'));
  if (tracked != null) fs.writeFileSync(path.join(dir, 'instance.env'), tracked);
  if (local != null) fs.writeFileSync(path.join(dir, 'instance.local.env'), local);
  return render(dir);
}
// What systemd will actually put in the environment, mirroring its own parsing
// of a fully double-quoted assignment.
function systemdValue(dropin, key) {
  for (const line of dropin.split('\n')) {
    const m = line.match(/^Environment="(.*)"$/);
    if (!m) continue;
    const unescaped = m[1].replace(/\\(.)/g, '$1');
    const eq = unescaped.indexOf('=');
    if (unescaped.slice(0, eq) === key) return unescaped.slice(eq + 1);
  }
  return undefined;
}

ok('a password with spaces survives intact', () => {
  const d = withFiles(null, 'LUMI_SMTP_PASS=my p@ss word\n');
  // The bug this replaces emitted `Environment=LUMI_SMTP_PASS=my p@ss word`,
  // which systemd reads as three assignments and mostly throws away.
  assert.strictEqual(d.split('\n').filter((l) => l.startsWith('Environment=')).length, 1);
  assert.strictEqual(systemdValue(d, 'LUMI_SMTP_PASS'), 'my p@ss word');
});

ok('a password with quotes and backslashes survives intact', () => {
  const d = withFiles(null, 'LUMI_SMTP_PASS=a"b\\c\'d\n');
  assert.strictEqual(systemdValue(d, 'LUMI_SMTP_PASS'), 'a"b\\c\'d');
});

ok('a CRLF file does not leave a carriage return in the value', () => {
  const d = withFiles(null, 'LUMI_SMTP_PASS=secret\r\nLUMI_MAIL_FROM=support@lumi24.pl\r\n');
  assert.strictEqual(systemdValue(d, 'LUMI_SMTP_PASS'), 'secret');
  assert.ok(!d.includes('\r'), 'no CR anywhere in the drop-in');
});

ok('the author quoting the value themselves is not double-quoted', () => {
  const d = withFiles(null, 'LUMI_SMTP_PASS="my p@ss word"\n');
  assert.strictEqual(systemdValue(d, 'LUMI_SMTP_PASS'), 'my p@ss word');
});

ok('secrets file wins over the tracked one', () => {
  const d = withFiles('LUMI_MAIL_FROM=old@lumi24.pl\nLUMI_APP_URL=https://lumi24.pl\n',
    'LUMI_MAIL_FROM=support@lumi24.pl\n');
  assert.strictEqual(systemdValue(d, 'LUMI_MAIL_FROM'), 'support@lumi24.pl');
  assert.strictEqual(systemdValue(d, 'LUMI_APP_URL'), 'https://lumi24.pl');
  assert.strictEqual(d.match(/LUMI_MAIL_FROM/g).length, 1, 'no duplicate assignment');
});

ok('comments, blank lines and junk never reach the unit', () => {
  const d = withFiles(null, '# a comment\n\n   # indented comment\nnot an assignment\nLUMI_SMTP_HOST=smtp.office365.com\n');
  assert.strictEqual(d.split('\n').filter((l) => l.startsWith('Environment=')).length, 1);
  assert.strictEqual(systemdValue(d, 'LUMI_SMTP_HOST'), 'smtp.office365.com');
});

ok('an empty value is preserved rather than dropped', () => {
  const d = withFiles(null, 'LUMI_MAIL_FROM_NAME=\n');
  assert.strictEqual(systemdValue(d, 'LUMI_MAIL_FROM_NAME'), '');
});

ok('a key assigned twice resolves the same for the service and for the checks', () => {
  // The exact trap: an old test key left above a new live one. systemd keeps the
  // LAST assignment, so the service runs live. A loader that stopped at the first
  // occurrence reported the test key and insisted "песочница" about a live service.
  const file = 'LUMI_STRIPE_SECRET_KEY=sk_test_old\nLUMI_STRIPE_SECRET_KEY=sk_live_new\n';
  const d = withFiles(null, file);
  assert.strictEqual(systemdValue(d, 'LUMI_STRIPE_SECRET_KEY'), 'sk_live_new', 'systemd sees the last one');
  assert.strictEqual(d.match(/LUMI_STRIPE_SECRET_KEY/g).length, 1, 'emitted once, not twice');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-env-'));
  fs.writeFileSync(path.join(dir, 'instance.local.env'), file);
  const env = {};
  loadInstanceEnv([dir], env);
  assert.strictEqual(env.LUMI_STRIPE_SECRET_KEY, 'sk_live_new', 'ops checks see the same value');
});

ok('a real process env still beats the files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-env-'));
  fs.writeFileSync(path.join(dir, 'instance.env'), 'LUMI_APP_URL=https://from-file\n');
  const env = { LUMI_APP_URL: 'https://from-process' };
  loadInstanceEnv([dir], env);
  assert.strictEqual(env.LUMI_APP_URL, 'https://from-process');
});

ok('missing files render a valid, empty unit section', () => {
  assert.strictEqual(withFiles(null, null), '[Service]\n');
});

const failed = results.filter((r) => !r[0]);
for (const [pass, name, err] of results) console.log(`  ${pass ? 'ok' : 'FAIL'} - ${name}${err ? ' → ' + err : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} env drop-in checks passed.`);
process.exit(failed.length ? 1 : 0);
