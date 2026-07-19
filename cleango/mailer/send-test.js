/**
 * Ops helper: send a test email from the server to check SMTP works.
 *
 *   node mailer/send-test.js you@example.com
 *
 * Loads the server-only secrets (deploy/instance.local.env, then instance.env)
 * the same way the service does, so it works over SSH without exporting anything.
 * Prints whether SMTP is enabled, the (password-free) config, and the send
 * result. Awaits the real send so a failure shows the exact SMTP error.
 */
'use strict';
const fs = require('fs');

function loadEnvFile(f) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch { /* file absent → ignore */ }
}
for (const f of ['/opt/lumi/deploy/instance.local.env', '/opt/lumi/deploy/instance.env']) loadEnvFile(f);

const mailer = require('./index');

const to = (process.argv[2] || '').trim();
if (!to || !to.includes('@')) {
  console.log('usage: node mailer/send-test.js you@example.com');
  process.exit(1);
}

const c = mailer.config();
console.log('smtp host     :', c.host || '(none)');
console.log('smtp port     :', c.port, c.secure ? '(implicit TLS)' : '(STARTTLS)');
console.log('smtp user     :', c.user || '(none)');
console.log('mail from     :', c.fromName ? `${c.fromName} <${c.from}>` : c.from || '(none)');
console.log('isEnabled     :', mailer.isEnabled());
if (!mailer.isEnabled()) {
  console.log('\n✗ SMTP not configured. Set LUMI_SMTP_* + LUMI_MAIL_FROM in /opt/lumi/deploy/instance.local.env.');
  process.exit(1);
}

console.log('\nsending test email to', to, '…');
mailer.send({
  to,
  subject: 'LUMI — тест доставки писем ✅',
  text: 'Это тестовое письмо от LUMI. Если ты его читаешь — отправка писем работает.',
  html: '<p>Это тестовое письмо от <b>LUMI</b>. Если ты его читаешь — отправка писем работает. 🎉</p>',
}).then((r) => {
  if (r && r.skipped) console.log('✗ skipped (SMTP disabled).');
  else console.log('✓ Sent. Check the inbox (and Spam) of', to);
}).catch((e) => {
  console.log('\n✗ SMTP error:', e && e.message);
  console.log('  (535 = auth still blocked; wait for M365 to apply the change, or re-check Authenticated SMTP.)');
});
