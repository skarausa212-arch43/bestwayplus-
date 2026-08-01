// Мульти-почта: до 10 ящиков на одной странице.
// Браузер не умеет IMAP, поэтому этот сервис — прокси: хранит добавленные
// аккаунты в серверной сессии (по cookie) и по запросу забирает письма по IMAP.

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');

const MAIL_HOST = process.env.MAIL_HOSTNAME;
const PORT = process.env.PORT || 8082;
const MAX_ACCOUNTS = 10;
const SESSION_TTL = 30 * 24 * 3600_000; // 30 дней; продлевается при каждом заходе
const SESSIONS_FILE = process.env.SESSIONS_FILE || '/data/sessions.json';

if (!MAIL_HOST) {
  console.error('MAIL_HOSTNAME is not set');
  process.exit(1);
}

// token -> { accounts: [{id, email, password, host}], touched }
// Сессии переживают перезапуск контейнера: пишем их в файл на диске.
const sessions = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  const now = Date.now();
  for (const [t, s] of Object.entries(raw)) {
    if (now - s.touched < SESSION_TTL) sessions.set(t, s);
  }
  console.log(`restored ${sessions.size} sessions from disk`);
} catch (e) {
  if (e.code !== 'ENOENT') console.error('could not restore sessions:', e.message);
}

let saveTimer = null;
function persistSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
      const tmp = SESSIONS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(sessions)), { mode: 0o600 });
      fs.renameSync(tmp, SESSIONS_FILE);
    } catch (e) {
      console.error('failed to persist sessions:', e.message);
    }
  }, 500);
  saveTimer.unref?.();
}

setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [t, s] of sessions) if (now - s.touched > SESSION_TTL) { sessions.delete(t); removed++; }
  if (removed) persistSessions();
}, 3600_000).unref();

function getSession(req, res) {
  const cookies = Object.fromEntries(
    (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2)
  );
  let token = cookies.mm;
  if (!token || !sessions.has(token)) {
    token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { accounts: [], touched: Date.now() });
  }
  // куку продлеваем на каждом запросе — «заходишь хоть раз в месяц, и вход не слетает»
  res.setHeader('Set-Cookie', `mm=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
  const s = sessions.get(token);
  s.touched = Date.now();
  persistSessions();
  return s;
}

function findAccount(session, id) {
  return session.accounts.find((a) => a.id === id);
}

async function withImap(acc, fn) {
  const client = new ImapFlow({
    host: acc.host,
    port: 993,
    secure: true,
    auth: { user: acc.email, pass: acc.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => {});
  }
}

// Папка спама: ищем по special-use флагу, если нет — стандартное имя Junk
async function resolveJunk(client) {
  try {
    for (const box of await client.list()) {
      if (box.specialUse === '\\Junk') return box.path;
    }
  } catch {}
  return 'Junk';
}

async function fetchMailbox(client, box, limit = 20) {
  const lock = await client.getMailboxLock(box);
  try {
    const status = await client.status(box, { messages: true, unseen: true });
    const messages = [];
    if (status.messages > 0) {
      const from = Math.max(1, status.messages - limit + 1);
      for await (const m of client.fetch(`${from}:*`, { uid: true, envelope: true, flags: true, internalDate: true })) {
        const sender = m.envelope.from?.[0] || {};
        messages.push({
          uid: m.uid,
          subject: m.envelope.subject || '(no subject)',
          from: sender.address || '',
          fromName: sender.name || '',
          date: m.internalDate,
          seen: m.flags.has('\\Seen'),
        });
      }
    }
    messages.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { unseen: status.unseen, total: status.messages, messages };
  } finally {
    lock.release();
  }
}

async function fetchInbox(acc, limit = 20) {
  return withImap(acc, async (client) => {
    const inbox = await fetchMailbox(client, 'INBOX', limit);
    // у свежесозданного ящика папки Junk может ещё не быть — тогда спам просто пуст
    let spam = { unseen: 0, total: 0, messages: [] };
    try {
      spam = await fetchMailbox(client, await resolveJunk(client), limit);
    } catch {}
    return { ...inbox, spam };
  });
}

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  // HTML всегда перепроверяется браузером — иначе телефоны показывают старый кэш
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate'); },
}));

app.get('/api/info', (req, res) => {
  const s = getSession(req, res);
  res.json({
    host: MAIL_HOST,
    maxAccounts: MAX_ACCOUNTS,
    accounts: s.accounts.map((a) => ({ id: a.id, email: a.email })),
  });
});

// Добавить ящик: проверяем логин по IMAP, только потом сохраняем
app.post('/api/accounts', async (req, res) => {
  const s = getSession(req, res);
  const { email, password, host } = req.body || {};
  if (typeof email !== 'string' || !email.includes('@') || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Please provide an address and password.' });
  }
  if (s.accounts.length >= MAX_ACCOUNTS) {
    return res.status(400).json({ error: `No more than ${MAX_ACCOUNTS} mailboxes.` });
  }
  const addr = email.toLowerCase().trim();
  if (s.accounts.some((a) => a.email === addr)) {
    return res.status(409).json({ error: 'This mailbox is already added.' });
  }
  const acc = {
    id: crypto.randomBytes(6).toString('hex'),
    email: addr,
    password,
    host: (typeof host === 'string' && host.trim()) || MAIL_HOST,
  };
  try {
    await withImap(acc, async () => {});
  } catch (e) {
    return res.status(401).json({ error: 'Login failed: check the address and password. (' + (e.responseText || e.message) + ')' });
  }
  s.accounts.push(acc);
  persistSessions();
  res.json({ ok: true, id: acc.id, email: acc.email });
});

app.delete('/api/accounts/:id', (req, res) => {
  const s = getSession(req, res);
  const before = s.accounts.length;
  s.accounts = s.accounts.filter((a) => a.id !== req.params.id);
  persistSessions();
  res.json({ ok: s.accounts.length < before });
});

// Все входящие всех ящиков одним запросом
app.get('/api/inbox', async (req, res) => {
  const s = getSession(req, res);
  const results = await Promise.allSettled(s.accounts.map((a) => fetchInbox(a)));
  res.json({
    accounts: s.accounts.map((a, i) => {
      const r = results[i];
      return r.status === 'fulfilled'
        ? { id: a.id, email: a.email, unseen: r.value.unseen, total: r.value.total, messages: r.value.messages }
        : { id: a.id, email: a.email, error: r.reason?.responseText || r.reason?.message || 'error' };
    }),
  });
});

// Полный текст письма (и пометить прочитанным)
app.get('/api/message', async (req, res) => {
  const s = getSession(req, res);
  const acc = findAccount(s, req.query.account);
  const uid = parseInt(req.query.uid, 10);
  if (!acc || !uid) return res.status(400).json({ error: 'Invalid parameters.' });
  try {
    const result = await withImap(acc, async (client) => {
      const box = req.query.folder === 'spam' ? await resolveJunk(client) : 'INBOX';
      const lock = await client.getMailboxLock(box);
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true }).catch(() => {});
        return simpleParser(msg.source);
      } finally {
        lock.release();
      }
    });
    if (!result) return res.status(404).json({ error: 'Message not found.' });
    res.json({
      subject: result.subject || '(no subject)',
      from: result.from?.text || '',
      to: result.to?.text || '',
      date: result.date,
      html: result.html || null,
      text: result.text || '',
      attachments: (result.attachments || []).map((a) => ({ filename: a.filename, size: a.size })),
    });
  } catch (e) {
    res.status(500).json({ error: e.responseText || e.message });
  }
});

// Переместить письмо между входящими и спамом: to = 'inbox' (не спам) или 'spam'
app.post('/api/move', async (req, res) => {
  const s = getSession(req, res);
  const { account, uid, to } = req.body || {};
  const acc = findAccount(s, account);
  const u = parseInt(uid, 10);
  if (!acc || !u || !['inbox', 'spam'].includes(to)) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }
  try {
    await withImap(acc, async (client) => {
      const junk = await resolveJunk(client);
      const src = to === 'inbox' ? junk : 'INBOX';
      const dst = to === 'inbox' ? 'INBOX' : junk;
      await client.mailboxCreate(dst).catch(() => {});
      const lock = await client.getMailboxLock(src);
      try {
        await client.messageMove(String(u), dst, { uid: true });
      } finally {
        lock.release();
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.responseText || e.message });
  }
});

// Отправка письма от имени любого добавленного ящика
app.post('/api/send', async (req, res) => {
  const s = getSession(req, res);
  const { account, to, subject, text } = req.body || {};
  const acc = findAccount(s, account);
  if (!acc) return res.status(400).json({ error: 'Mailbox not found.' });
  if (typeof to !== 'string' || !to.includes('@')) return res.status(400).json({ error: 'Please provide a recipient.' });
  try {
    const transport = nodemailer.createTransport({
      host: acc.host,
      port: 465,
      secure: true,
      auth: { user: acc.email, pass: acc.password },
    });
    await transport.sendMail({
      from: acc.email,
      to,
      subject: String(subject || ''),
      text: String(text || ''),
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send: ' + (e.response || e.message) });
  }
});

app.listen(PORT, () => {
  console.log(`multimail listening on :${PORT}, IMAP host ${MAIL_HOST}`);
});
