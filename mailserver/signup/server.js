// Страница самостоятельной регистрации почтовых ящиков.
// Добавляет аккаунты в postfix-accounts.cf — docker-mailserver сам подхватывает
// изменения этого файла (встроенный changedetector), перезапуск не нужен.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const nodemailer = require('nodemailer');

const DOMAIN = process.env.MAIL_DOMAIN;
const MAIL_HOSTNAME = process.env.MAIL_HOSTNAME || `mail.${process.env.MAIL_DOMAIN || ''}`;
// Пароль postmaster — для отправки писем восстановления пароля
const POSTMASTER_PASS = (process.env.POSTMASTER_PASS || '').trim();
const QUOTAS_FILE = process.env.QUOTAS_FILE || '/config/dovecot-quotas.cf';
const RESETS_FILE = process.env.RESETS_FILE || '/config/password-resets.json';
const MAILBOX_QUOTA = process.env.MAILBOX_QUOTA || '1G';
const INVITE_CODE = (process.env.INVITE_CODE || '').trim();
const WEBMAIL_URL = process.env.WEBMAIL_URL || '';
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || '/config/postfix-accounts.cf';
// Профили пользователей (имя, фамилия, резервный email) — для восстановления пароля
const PROFILES_FILE = process.env.PROFILES_FILE || '/config/user-profiles.json';
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
const NAME_RE = /^[\p{L}][\p{L}' -]{0,39}$/u; // буквы любого алфавита, пробел, дефис, апостроф
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function readProfiles() {
  try {
    return JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveProfiles(profiles) {
  const tmp = PROFILES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(profiles, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, PROFILES_FILE);
}

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

// Проверка пароля против SHA512-CRYPT-хэша из файла аккаунтов:
// хэшируем с той же солью и сравниваем
function verifyPassword(password, fullHash) {
  return new Promise((resolve) => {
    const m = /^\$6\$([^$]+)\$/.exec(fullHash);
    if (!m) return resolve(false);
    const child = execFile('openssl', ['passwd', '-6', '-salt', m[1], '-stdin'], (err, stdout) => {
      resolve(!err && stdout.trim() === fullHash);
    });
    child.stdin.end(password + '\n');
  });
}

function accountHashFor(email) {
  for (const line of readAccounts().split('\n')) {
    const [addr, hash] = line.split('|');
    if (addr?.trim().toLowerCase() === email) return (hash || '').replace('{SHA512-CRYPT}', '').trim();
  }
  return null;
}

function replaceAccountHash(email, newHash) {
  const lines = readAccounts().split('\n').map((line) => {
    const addr = line.split('|')[0]?.trim().toLowerCase();
    return addr === email ? `${email}|{SHA512-CRYPT}${newHash}` : line;
  });
  const tmp = ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(tmp, lines.join('\n'), { mode: 0o644 });
  fs.renameSync(tmp, ACCOUNTS_FILE);
}

function readResets() {
  try { return JSON.parse(fs.readFileSync(RESETS_FILE, 'utf8')); } catch { return {}; }
}
function saveResets(r) {
  fs.writeFileSync(RESETS_FILE, JSON.stringify(r), { mode: 0o600 });
}

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

// Общая логика регистрации: возвращает { code, data } — используется и JSON-API,
// и фолбэком для нативной отправки формы (когда JS на странице не сработал)
function registerUser(body, ip) {
  const { username, password, invite, firstName, lastName, recovery } = body || {};

  if (rateLimited(ip)) {
    return Promise.resolve({ code: 429, data: { error: 'Too many attempts. Please wait an hour and try again.' } });
  }
  if (INVITE_CODE && (invite || '').trim() !== INVITE_CODE) {
    return Promise.resolve({ code: 403, data: { error: 'Invalid invite code.' } });
  }
  const user = String(username || '').toLowerCase().trim();
  if (!USERNAME_RE.test(user)) {
    return Promise.resolve({ code: 400, data: { error: 'Username: 1–31 chars, letters/digits/dot/dash, must start and end with a letter or digit.' } });
  }
  if (RESERVED.has(user)) {
    return Promise.resolve({ code: 400, data: { error: 'This name is reserved.' } });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return Promise.resolve({ code: 400, data: { error: 'Password must be 8–128 characters long.' } });
  }
  const fName = String(firstName || '').trim();
  const lName = String(lastName || '').trim();
  if (!NAME_RE.test(fName)) {
    return Promise.resolve({ code: 400, data: { error: 'Please enter your first name (letters only).' } });
  }
  if (!NAME_RE.test(lName)) {
    return Promise.resolve({ code: 400, data: { error: 'Please enter your last name (letters only).' } });
  }
  const recoveryEmail = String(recovery || '').trim().toLowerCase();
  if (recoveryEmail && !EMAIL_RE.test(recoveryEmail)) {
    return Promise.resolve({ code: 400, data: { error: 'Recovery email looks invalid.' } });
  }

  const email = `${user}@${DOMAIN}`;
  if (recoveryEmail === email) {
    return Promise.resolve({ code: 400, data: { error: 'Recovery email must be a different address.' } });
  }

  return enqueue(async () => {
    const existing = readAccounts();
    const taken = existing.split('\n').some((line) => {
      const addr = line.split('|')[0].trim().toLowerCase();
      return addr === email;
    });
    if (taken) {
      return { code: 409, data: { error: 'This address is already taken.' } };
    }
    const hash = await hashPassword(password);
    const line = `${email}|{SHA512-CRYPT}${hash}\n`;
    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    fs.appendFileSync(ACCOUNTS_FILE, prefix + line, { mode: 0o644 });
    // квота, чтобы один ящик не съел весь диск
    try { fs.appendFileSync(QUOTAS_FILE, `${email}:${MAILBOX_QUOTA}\n`, { mode: 0o644 }); } catch {}
    const profiles = readProfiles();
    profiles[email] = {
      firstName: fName,
      lastName: lName,
      recoveryEmail: recoveryEmail || null,
      createdAt: new Date().toISOString(),
    };
    saveProfiles(profiles);
    console.log(`registered ${email} (${fName} ${lName}, recovery: ${recoveryEmail ? 'yes' : 'no'}, ip ${ip})`);
    return { code: 200, data: { ok: true, email, webmail: WEBMAIL_URL } };
  });
}

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

app.post('/api/register', (req, res) => {
  registerUser(req.body, clientIp(req)).then(({ code, data }) => {
    res.status(code).json(data);
  }).catch((e) => {
    console.error('registration failed:', e);
    res.status(500).json({ error: 'Internal server error.' });
  });
});

// Нативная отправка формы (страница без работающего JS): регистрируем и
// возвращаем на лендинг с результатом в query — страница его покажет
app.post('/', express.urlencoded({ extended: false }), (req, res) => {
  const body = req.body || {};
  const done = (q) => res.redirect(303, '/?' + q);
  if (body.p2 !== undefined && body.p2 !== body.password) {
    return done('err=' + encodeURIComponent('Passwords do not match.'));
  }
  registerUser(body, clientIp(req)).then(({ code, data }) => {
    done(code === 200
      ? 'registered=' + encodeURIComponent(data.email)
      : 'err=' + encodeURIComponent(data.error || 'Registration failed.'));
  }).catch((e) => {
    console.error('registration failed:', e);
    done('err=' + encodeURIComponent('Internal server error.'));
  });
});

// ===== Пароли: смена и восстановление =====

app.post('/api/password/change', (req, res) => {
  const { email, oldPassword, newPassword } = req.body || {};
  const addr = String(email || '').toLowerCase().trim();
  if (!addr.endsWith('@' + DOMAIN)) return res.status(400).json({ error: 'Unknown address.' });
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'New password must be 8–128 characters.' });
  }
  enqueue(async () => {
    const hash = accountHashFor(addr);
    if (!hash || !(await verifyPassword(String(oldPassword || ''), hash))) {
      res.status(403).json({ error: 'Wrong current password.' });
      return;
    }
    replaceAccountHash(addr, await hashPassword(newPassword));
    console.log(`password changed for ${addr}`);
    res.json({ ok: true });
  }).catch((e) => {
    console.error('password change failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  });
});

// Шаг 1: письмо со ссылкой на резервный адрес (ответ всегда одинаковый — не палим,
// у кого есть ящик и резервная почта)
app.post('/api/password/forgot', (req, res) => {
  const ip = clientIp(req);
  const user = String(req.body?.username || '').toLowerCase().trim().replace(/@.*$/, '');
  const generic = { ok: true, message: 'If this mailbox has a recovery email, a reset link is on its way.' };
  if (rateLimited(ip) || !USERNAME_RE.test(user)) return res.json(generic);
  const email = `${user}@${DOMAIN}`;
  const profile = readProfiles()[email];
  if (!profile?.recoveryEmail || !POSTMASTER_PASS) return res.json(generic);
  const token = require('crypto').randomBytes(24).toString('hex');
  const resets = readResets();
  for (const [t, r] of Object.entries(resets)) if (r.exp < Date.now()) delete resets[t];
  resets[token] = { email, exp: Date.now() + 3600_000 };
  saveResets(resets);
  nodemailer.createTransport({ host: MAIL_HOSTNAME, port: 465, secure: true,
    auth: { user: `postmaster@${DOMAIN}`, pass: POSTMASTER_PASS } })
    .sendMail({
      from: `EmailInc <postmaster@${DOMAIN}>`,
      to: profile.recoveryEmail,
      subject: 'Reset your EmailInc password',
      text: `Someone (hopefully you) requested a password reset for ${email}.\n\nOpen this link to set a new password (valid for 1 hour):\nhttps://${DOMAIN}/?reset=${token}\n\nIf it wasn't you, just ignore this email.`,
    })
    .then(() => console.log(`reset link sent for ${email}`))
    .catch((e) => console.error('reset mail failed:', e.message));
  res.json(generic);
});

// Шаг 2: установка нового пароля по токену из письма
app.post('/api/password/reset', (req, res) => {
  const { token, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'Password must be 8–128 characters.' });
  }
  const resets = readResets();
  const r = resets[String(token || '')];
  if (!r || r.exp < Date.now()) return res.status(400).json({ error: 'This link has expired — request a new one.' });
  enqueue(async () => {
    replaceAccountHash(r.email, await hashPassword(newPassword));
    delete resets[String(token)];
    saveResets(resets);
    console.log(`password reset for ${r.email}`);
    res.json({ ok: true, email: r.email });
  }).catch((e) => {
    console.error('password reset failed:', e);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error.' });
  });
});

app.listen(PORT, () => {
  console.log(`mail-signup for @${DOMAIN} listening on :${PORT} (invite ${INVITE_CODE ? 'required' : 'OFF'})`);
});
