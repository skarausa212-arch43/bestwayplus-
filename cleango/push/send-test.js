/**
 * Ops helper: send a test push to a user's registered devices from the server.
 *
 *   node push/send-test.js                     → all registered devices
 *   node push/send-test.js user@example.com    → that user's devices (by email)
 *   node push/send-test.js u_123               → that user's devices (by id)
 *   node push/send-test.js <raw-fcm-token>     → one explicit token
 *
 * Loads the server-only secrets (deploy/instance.local.env, then instance.env)
 * the same way the service does, so it works when run by hand over SSH without
 * exporting anything. Prints whether push is enabled, how many device tokens it
 * found, and the FCM send result. Read-only apart from the push itself.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// Pull KEY=VALUE lines from the deploy env files (real process env wins).
function loadEnvFile(f) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch { /* file absent → ignore */ }
}
for (const f of ['/opt/lumi/deploy/instance.local.env', '/opt/lumi/deploy/instance.env']) loadEnvFile(f);

const push = require('./index');

const DATA_DIR = process.env.LUMI_DATA_DIR || path.join(__dirname, '..', 'data');
function load(name) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); } catch { return {}; }
}

console.log('data dir       :', DATA_DIR);
console.log('push.isEnabled :', push.isEnabled());
if (!push.isEnabled()) {
  console.log('\n✗ Push is NOT configured on this server.');
  console.log('  Set LUMI_FCM_KEY_FILE (or the three LUMI_FCM_* vars) in');
  console.log('  /opt/lumi/deploy/instance.local.env and re-run auto-update.sh, then retry.');
  process.exit(1);
}

const devices = load('devices.json');
const users = load('users.json');
const arg = (process.argv[2] || '').trim();

let tokens = [];
let who = '';
if (!arg) {
  tokens = Object.values(devices).flat().map((d) => d && d.token).filter(Boolean);
  who = 'ALL registered devices';
} else if (arg.includes('@')) {
  const u = Object.values(users).find((x) => String(x.email || '').toLowerCase() === arg.toLowerCase());
  if (!u) { console.log('\n✗ no user with email', arg); process.exit(1); }
  tokens = (devices[u.id] || []).map((d) => d.token).filter(Boolean);
  who = arg + ' → user ' + u.id;
} else if (devices[arg]) {
  tokens = (devices[arg] || []).map((d) => d.token).filter(Boolean);
  who = 'user ' + arg;
} else {
  tokens = [arg];   // treat as a raw FCM token
  who = 'raw token';
}

console.log('target         :', who);
console.log('device tokens  :', tokens.length);
if (!tokens.length) {
  console.log('\n✗ No device tokens for that target.');
  console.log('  Open the LUMI app on the phone, log in, wait ~10s (it registers the token), then retry.');
  process.exit(1);
}

push.send(tokens, {
  title: 'LUMI',
  body: 'Тестовое уведомление 🎉 Push работает!',
  deepLink: 'lumi://notifications',
  priority: 'high',
}).then((r) => {
  console.log('\nsend result    :', JSON.stringify(r));
  if (r.sent > 0) console.log('✓ Delivered to FCM — check your phone now.');
  else console.log('✗ Nothing delivered. If "dead" lists your token, the app must re-register (reopen + log in).');
}).catch((e) => console.log('error:', e && e.message));
