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
const { loadInstanceEnv } = require('../deploy/render-env-dropin');
const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
// One merge shared with the systemd drop-in renderer, so a duplicated key
// resolves here exactly as it does for the running service.
loadInstanceEnv([path.join(APP_DIR, 'deploy'), path.join(ROOT, 'deploy')]);

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

// Follow the SPF include: chain the way a receiving server does. An include:
// is not a value — it is another DNS lookup, so "include:secureserver.net"
// answers nothing until you expand it. RFC 7208 caps the chain at 10 lookups
// and a receiver stops there too, so anything deeper would not count anyway.
async function expandSpf(record, seen = new Set(), budget = { left: 10 }) {
  const parts = [];
  for (const token of String(record).split(/\s+/)) {
    const m = token.match(/^include:(.+)$/i) || token.match(/^redirect=(.+)$/i);
    if (!m) { parts.push(token); continue; }
    const host = m[1].toLowerCase();
    parts.push(token);
    if (seen.has(host) || budget.left <= 0) continue;
    seen.add(host); budget.left--;
    let txt;
    try { txt = await dns.resolveTxt(host); } catch { parts.push(`(${host}: не резолвится)`); continue; }
    const inner = txt.map((r) => r.join('')).find((r) => /^v=spf1/i.test(r));
    if (!inner) { parts.push(`(${host}: нет SPF)`); continue; }
    parts.push(...(await expandSpf(inner, seen, budget)));
  }
  return parts;
}

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
  if (!Array.isArray(txt) && txt.__err !== 'ENODATA' && txt.__err !== 'ENOTFOUND') {
    // A lookup that never answered is not the same as a record that is not
    // there. Reporting "SPF отсутствует" on a timeout sends someone editing DNS
    // that was fine — say what actually happened instead.
    say('warn', 'TXT-записи не прочитались', `${txt.__err} — DNS не ответил, повторите проверку (SPF не проверен)`);
  } else if (!spf) {
    say('fail', 'SPF отсутствует', 'без него почта уходит в спам — добавьте TXT-запись v=spf1 …');
  } else {
    const strict = /[-~]all\s*$/.test(spf);
    say('ok', 'SPF', spf);
    if (!strict) say('warn', 'SPF без -all/~all', 'запись ничего не запрещает — подделать отправителя может кто угодно');
    // The check that actually matters: does the SPF mention the platform the
    // MX points at? If not, our own mail fails SPF on every hop.
    if (platform) {
      const expanded = await expandSpf(spf);
      const flat = expanded.join(' ').toLowerCase();
      const unresolved = expanded.filter((p) => /не резолвится|нет SPF/.test(p));
      if (flat.includes(platform.spf)) {
        say('ok', `SPF разворачивается в ${platform.spf}`,
          spf.toLowerCase().includes(platform.spf) ? 'напрямую' : `через include: — ${expanded.filter((p) => /^include:/i.test(p)).join(' → ')}`);
      } else if (unresolved.length) {
        say('warn', `SPF не удалось раскрыть до конца`, `не прочитались: ${unresolved.join(', ')} — повторите проверку`);
      } else {
        say('fail', `SPF не покрывает ${platform.label}`,
          `ни одна include-цепочка не приводит к ${platform.spf} — письма провалят SPF; добавьте include:${platform.spf} в TXT-запись домена`);
      }
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
