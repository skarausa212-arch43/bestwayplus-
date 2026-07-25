// Страница самостоятельной регистрации почтовых ящиков.
// Добавляет аккаунты в postfix-accounts.cf — docker-mailserver сам подхватывает
// изменения этого файла (встроенный changedetector), перезапуск не нужен.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const DOMAIN = process.env.MAIL_DOMAIN;
const INVITE_CODE = (process.env.INVITE_CODE || '').trim();
const WEBMAIL_URL = process.env.WEBMAIL_URL || '';
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || '/config/postfix-accounts.cf';
const PORT = process.env.PORT || 8081;

if (!DOMAIN) {
  console.error('MAIL_DOMAIN is not set');
  process.exit(1);
}

// Имена, которые нельзя занимать обычным пользователям (RFC 2142 + здравый смысл)
const RESERVED = new Set([
  'postmaster', 'abuse', 'admin', 'administrator', 'hostmaster', 'webmaster',
  'root', 'noreply', 'no-reply', 'mail', 'support', 'security', 'info',
]);

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,29}[a-z0-9])?$/;

// Простое ограничение частоты: не больше 5 регистраций с одного IP в час
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= 5) return true;
  list.push(now);
  attempts.set(ip, list);
  return false;
}
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [ip, list] of attempts) {
    const fresh = list.filter((t) => t > cutoff);
    if (fresh.length) attempts.set(ip, fresh); else attempts.delete(ip);
  }
}, 600_000).unref();

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const child = execFile('openssl', ['passwd', '-6', '-stdin'], (err, stdout) => {
      if (err) return reject(err);
      const hash = stdout.trim();
      if (!hash.startsWith('$6$')) return reject(new Error('unexpected hash output'));
      resolve(hash);
    });
    child.stdin.end(password + '\n');
  });
}

function readAccounts() {
  try {
    return fs.readFileSync(ACCOUNTS_FILE, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}

// Записи идут строго по очереди, чтобы две одновременные регистрации не переплелись
let writeQueue = Promise.resolve();
function enqueue(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.catch(() => {});
  return run;
}

const app = express();
app.use(express.json({ limit: '4kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  // HTML всегда перепроверяется браузером — иначе телефоны показывают старый кэш
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate'); },
}));

app.get('/api/info', (_req, res) => {
  res.json({ domain: DOMAIN, inviteRequired: INVITE_CODE !== '', webmail: WEBMAIL_URL });
});

app.post('/api/register', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const { username, password, invite } = req.body || {};

  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait an hour and try again.' });
  }
  if (INVITE_CODE && (invite || '').trim() !== INVITE_CODE) {
    return res.status(403).json({ error: 'Invalid invite code.' });
  }
  const user = String(username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(user)) {
    return res.status(400).json({ error: 'Username: 1–31 chars, letters/digits/dot/dash, must start and end with a letter or digit.' });
  }
  if (RESERVED.has(user)) {
    return res.status(400).json({ error: 'This name is reserved.' });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8–128 characters long.' });
  }

  const email = `${user}@${DOMAIN}`;

  enqueue(async () => {
    const existing = readAccounts();
    const taken = existing.split('\n').some((line) => {
      const addr = line.split('|')[0].trim().toLowerCase();
      return addr === email;
    });
    if (taken) {
      res.status(409).json({ error: 'This address is already taken.' });
      return;
    }
    const hash = await hashPassword(password);
    const line = `${email}|{SHA512-CRYPT}${hash}\n`;
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(ACCOUNTS_FILE, prefix + line, { mode: 0o644 });
    console.log(`registered ${email} (ip ${ip})`);
    res.json({ ok: true, email, webmail: WEBMAIL_URL });
  }).catch((e) => {
    console.error('registration failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  });
});

app.listen(PORT, () => {
  console.log(`mail-signup for @${DOMAIN} listening on :${PORT} (invite ${INVITE_CODE ? 'required' : 'OFF'})`);
});
