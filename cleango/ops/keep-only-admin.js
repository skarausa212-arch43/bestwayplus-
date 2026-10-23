#!/usr/bin/env node
/**
 * One-time pre-launch cleanup: keep ONLY the given admin account, remove every
 * other user and wipe all operational data (bookings, properties, chats, etc.).
 * Settings, feature flags, the server secret and the audit log are preserved.
 *
 * SAFE BY DEFAULT:
 *   • Dry-run unless you pass --yes (shows exactly what it would do, changes nothing).
 *   • Aborts if the keep-email isn't found (so you can't lock yourself out).
 *   • Backs up the WHOLE data dir before touching anything.
 *
 * The running server keeps data in memory and re-persists on writes, so STOP the
 * service first, run this, then START it again.
 *
 *   sudo systemctl stop lumi
 *   sudo -u lumi LUMI_DATA_DIR=/opt/lumi/data node ops/keep-only-admin.js roman3433339@gmail.com          # dry run
 *   sudo -u lumi LUMI_DATA_DIR=/opt/lumi/data node ops/keep-only-admin.js roman3433339@gmail.com --yes    # execute
 *   sudo systemctl start lumi
 *
 * (If LUMI_DATA_DIR isn't set, pass --data /path/to/data.)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const keepEmail = String(args.find((a) => !a.startsWith('--')) || '').trim().toLowerCase();
const doIt = args.includes('--yes');
const dataArg = (() => { const i = args.indexOf('--data'); return i >= 0 ? args[i + 1] : null; })();
const DATA_DIR = dataArg || process.env.LUMI_DATA_DIR || path.join(__dirname, '..', 'data');

// Files emptied on a wipe (everything transactional). NOT touched: settings.json,
// flags.json, secret, audit.log.
const WIPE = {
  'bookings.json': {}, 'properties.json': {}, 'messages.json': {}, 'reviews.json': {},
  'notifications.json': {}, 'appliances.json': {}, 'disputes.json': {}, 'support.json': {},
  'reservations.json': {}, 'devices.json': {}, 'payments.json': {}, 'wallet-tx.json': {},
  'ledger.json': [], 'ledger-v2.json': [],
};

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return fallback; }
}

function main() {
  if (!keepEmail) {
    console.error('Usage: node ops/keep-only-admin.js <keep-email> [--yes] [--data /path]');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(DATA_DIR, 'users.json'))) {
    console.error(`✗ No users.json in ${DATA_DIR}. Set LUMI_DATA_DIR or pass --data.`);
    process.exit(1);
  }
  const users = readJSON('users.json', {});
  const all = Object.values(users);
  const kept = all.filter((u) => String(u.email || '').trim().toLowerCase() === keepEmail && !u.deletedAt);
  const removed = all.filter((u) => !kept.includes(u));

  console.log(`\nData dir: ${DATA_DIR}`);
  console.log(`Total users: ${all.length}`);
  if (!kept.length) {
    console.error(`\n✗ ABORT: no active user with email "${keepEmail}" found — refusing to wipe (would lock you out).`);
    console.error('  Check the email (case-insensitive) and try again.');
    process.exit(2);
  }
  console.log(`Keeping ${kept.length}: ${kept.map((u) => `${u.email} [${u.role}${u.adminRole ? '/' + u.adminRole : ''}]`).join(', ')}`);
  if (kept.every((u) => u.role !== 'admin')) {
    console.log('⚠  Note: the kept account is NOT currently role=admin. It will be re-promoted on next login only if its email is in LUMI_ADMIN_EMAIL.');
  }
  console.log(`Removing ${removed.length} other user(s), and wiping: ${Object.keys(WIPE).join(', ')}`);

  if (!doIt) {
    console.log('\n(dry run — nothing changed). Re-run with --yes to execute.');
    return;
  }

  // Back up the whole data dir first.
  const backup = `${DATA_DIR.replace(/\/+$/, '')}-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.mkdirSync(backup, { recursive: true });
  for (const f of fs.readdirSync(DATA_DIR)) {
    const src = path.join(DATA_DIR, f);
    if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(backup, f));
  }
  console.log(`\n✓ Backup: ${backup}`);

  // Keep only the matched admin(s).
  const nextUsers = {};
  for (const u of kept) nextUsers[u.id] = u;
  fs.writeFileSync(path.join(DATA_DIR, 'users.json'), JSON.stringify(nextUsers, null, 2));

  // Wipe transactional data.
  for (const [name, empty] of Object.entries(WIPE)) {
    if (fs.existsSync(path.join(DATA_DIR, name))) fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(empty, null, 2));
  }
  console.log(`✓ Done. Kept ${kept.length} user(s), removed ${removed.length}, wiped operational data.`);
  console.log('  Now: sudo systemctl start lumi');
}
main();
