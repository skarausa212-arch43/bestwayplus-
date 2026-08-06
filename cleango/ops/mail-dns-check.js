/**
 * Ops helper: will our mail actually be delivered, or land in spam?
 *
 *   node ops/mail-dns-check.js            # domain from LUMI_MAIL_FROM / LUMI_APP_URL
 *   node ops/mail-dns-check.js lumi24.pl  # or an explicit domain
 *
 * Working SMTP credentials are only half of "email works". The other half is
 * DNS: a receiving server checks SPF, DKIM and DMARC before it decides whether
 * to show the message, hide it in spam, or refuse it. Those checks fail
 * silently from our side — the send returns 250 OK and the user never sees the
 * mail. This reads the live records and says which of them line up with the
 * mail host the MX points at.
 *
 * Exit code 1 if something would break delivery, 0 otherwise.
 */
'use strict';
const dns = require('dns').promises;
const fs = require('fs');
const path = require('path');

// Same env loading as the service (see ops/integrations-check.js).
const ROOT = path.join(__dirname, '..');
function loadEnvFile(f) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    }
  } catch { /* absent → ignore */ }
}
const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
for (const dir of [path.join(APP_DIR, 'deploy'), path.join(ROOT, 'deploy')]) {
  loadEnvFile(path.join(dir, 'instance.local.env'));
  loadEnvFile(path.join(dir, 'instance.env'));
}

const domain = (process.argv[2]
  || (process.env.LUMI_MAIL_FROM || '').split('@')[1]
  || (process.env.LUMI_APP_URL || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  || 'lumi24.pl').trim().toLowerCase();

// Which mail platform a hostname belongs to — used to tell whether the SPF
// record talks about the same place the MX points at.
const PLATFORMS = [
  { id: 'microsoft', match: /protection\.outlook\.com$|\.outlook\.com$/, spf: 'spf.protection.outlook.com', label: 'Microsoft 365 / Exchange Online' },
  { id: 'google', match: /google\.com$|googlemail\.com$/, spf: '_spf.google.com', label: 'Google Workspace' },
  { id: 'godaddy', match: /secureserver\.net$/, spf: 'secureserver.net', label: 'GoDaddy Workspace' },
  { id: 'zoho', match: /zoho\.(com|eu)$/, spf: 'zoho.com', label: 'Zoho Mail' },
];

const out = [];
let fails = 0, warns = 0;
const say = (mark, text, detail) => { out.push([mark, text, detail]); if (mark === 'fail') fails++; if (mark === 'warn') warns++; };
const q = async (fn, name, type) => { try { return await fn.call(dns, name); } catch (e) { return { __err: e.code || String(e), __type: type }; } };

(async () => {
  // ── MX: who accepts mail for the domain ──
  const mx = await q(dns.resolveMx, domain, 'MX');
  let platform = null;
  if (mx.__err || !mx.length) {
    say('fail', 'MX не найден', `домен ${domain} не принимает почту — проверьте DNS у регистратора`);
  } else {
    const primary = mx.slice().sort((a, b) => a.priority - b.priority)[0].exchange.toLowerCase();
    platform = PLATFORMS.find((p) => p.match.test(primary)) || null;
    say('ok', 'MX', `${primary}${platform ? ` → ${platform.label}` : ''}`);
  }

  // ── SPF: which servers may send as this domain ──
  const txt = await q(dns.resolveTxt, domain, 'TXT');
  const spf = Array.isArray(txt) ? txt.map((r) => r.join('')).find((r) => /^v=spf1/i.test(r)) : null;
  if (!spf) {
    say('fail', 'SPF отсутствует', 'без него почта уходит в спам — добавьте TXT-запись v=spf1 …');
  } else {
    const strict = /[-~]all\s*$/.test(spf);
    say('ok', 'SPF', spf);
    if (!strict) say('warn', 'SPF без -all/~all', 'запись ничего не запрещает — подделать отправителя может кто угодно');
    // The check that actually matters: does the SPF mention the platform the
    // MX points at? If not, our own mail fails SPF on every hop.
    if (platform && !spf.toLowerCase().includes(platform.spf)) {
      const chained = /include:/.test(spf);
      say(chained ? 'warn' : 'fail',
        `SPF не упоминает ${platform.spf}`,
        chained
          ? `есть include: — проверьте вручную, раскрывается ли он в ${platform.spf} (dig +short TXT ${(spf.match(/include:([^\s]+)/) || [])[1]})`
          : `почта от ${platform.label} провалит SPF — добавьте include:${platform.spf}`);
    }
  }

  // ── DKIM: is the mail signed? ──
  // Selector names are platform-specific; these cover the two we support.
  const selectors = platform && platform.id === 'microsoft' ? ['selector1', 'selector2']
    : platform && platform.id === 'google' ? ['google']
      : ['selector1', 'selector2', 'google', 'default', 'mail'];
  const found = [];
  for (const s of selectors) {
    const host = `${s}._domainkey.${domain}`;
    const c = await q(dns.resolveCname, host, 'CNAME');
    if (!c.__err && c.length) { found.push(`${s} → ${c[0]}`); continue; }
    const t = await q(dns.resolveTxt, host, 'TXT');
    if (!t.__err && t.length) found.push(`${s} (TXT)`);
  }
  if (found.length) say('ok', 'DKIM', found.join(' · '));
  else say('warn', 'DKIM не найден', `нет записей ${selectors.map((s) => s + '._domainkey').join(' / ')} — письма без подписи чаще попадают в спам`);

  // ── DMARC: what a receiver should do when SPF/DKIM fail ──
  const dm = await q(dns.resolveTxt, `_dmarc.${domain}`, 'TXT');
  const dmarc = Array.isArray(dm) ? dm.map((r) => r.join('')).find((r) => /^v=DMARC1/i.test(r)) : null;
  if (!dmarc) {
    say('warn', 'DMARC отсутствует', 'рекомендуется хотя бы v=DMARC1; p=none; rua=mailto:…');
  } else {
    const policy = (dmarc.match(/p=(\w+)/) || [])[1] || 'none';
    say('ok', 'DMARC', dmarc);
    if (policy !== 'none' && fails > 0) {
      say('warn', `DMARC p=${policy} при проблемах с SPF`,
        'получатели будут прятать письма в спам или отклонять их, пока SPF/DKIM не сойдутся');
    }
  }

  // ── report ──
  console.log(`\n\x1b[1mПочтовый DNS — ${domain}\x1b[0m`);
  console.log('─'.repeat(66));
  for (const [mark, text, detail] of out) {
    const m = mark === 'ok' ? '\x1b[32m✓\x1b[0m' : mark === 'warn' ? '\x1b[33m!\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${m} ${text}`);
    if (detail) console.log(`      ${detail}`);
  }
  console.log('─'.repeat(66));
  if (fails) console.log(`\x1b[31m🔴 ${fails} проблем(ы), которые ломают доставку${warns ? ` + ${warns} предупреждени(я/й)` : ''}\x1b[0m\n`);
  else if (warns) console.log(`\x1b[33m🟡 доставка возможна, но ${warns} предупреждени(я/й) — см. выше\x1b[0m\n`);
  else console.log('\x1b[32m🟢 SPF, DKIM и DMARC согласованы с MX\x1b[0m\n');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('mail-dns-check упал:', e); process.exit(1); });
