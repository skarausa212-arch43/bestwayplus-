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

app.listen(PORT, () => {
  console.log(`mail-signup for @${DOMAIN} listening on :${PORT} (invite ${INVITE_CODE ? 'required' : 'OFF'})`);
});
