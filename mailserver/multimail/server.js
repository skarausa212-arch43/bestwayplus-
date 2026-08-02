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
// Домен адресов: задаётся явно, иначе выводим из hostname (mail.example.com -> example.com)
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || (MAIL_HOST || '').replace(/^mail\./, '');
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

// Спец-папки (спам, корзина): ищем по special-use флагу, иначе стандартное имя
async function resolveSpecial(client, use, fallback) {
  try {
    for (const box of await client.list()) {
      if (box.specialUse === use) return box.path;
    }
  } catch {}
  return fallback;
}
const resolveJunk = (client) => resolveSpecial(client, '\\Junk', 'Junk');
const resolveTrash = (client) => resolveSpecial(client, '\\Trash', 'Trash');

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

// ===== Telegram-уведомления о новых письмах =====
// Привязка: /multi/ выдаёт ссылку t.me/<бот>?start=<токен>, бот связывает chat_id
// с сессией. Дальше фоновый чекер шлёт сообщение на каждое новое письмо в INBOX.
const TG_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
let botUsername = null;
const pendingLinks = new Map(); // linkToken -> { s: session, at }

// Ящики, подключённые прямо через бота (без веб-приложения):
// chatId(строкой) -> { accounts: [{email, password, host, tgUid}] }
const TG_USERS_FILE = process.env.TG_USERS_FILE || '/data/tg-users.json';
const tgUsers = new Map();
try {
  for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(TG_USERS_FILE, 'utf8')))) tgUsers.set(k, v);
  console.log(`restored ${tgUsers.size} telegram users from disk`);
} catch (e) {
  if (e.code !== 'ENOENT') console.error('could not restore telegram users:', e.message);
}
let tgSaveTimer = null;
function persistTgUsers() {
  clearTimeout(tgSaveTimer);
  tgSaveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(TG_USERS_FILE), { recursive: true });
      const tmp = TG_USERS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(tgUsers)), { mode: 0o600 });
      fs.renameSync(tmp, TG_USERS_FILE);
    } catch (e) {
      console.error('failed to persist telegram users:', e.message);
    }
  }, 500);
  tgSaveTimer.unref?.();
}

// Диалог подключения в боте: chatId -> { state: 'email'|'password', email, at }
const tgDialog = new Map();
// Защита от перебора паролей через бота: не больше 5 неудач в час на чат
const tgFails = new Map();
function tgTooManyFails(chatId) {
  const now = Date.now();
  const list = (tgFails.get(chatId) || []).filter((t) => now - t < 3600_000);
  tgFails.set(chatId, list);
  return list.length >= 5;
}

async function tg(method, params) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {}),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`telegram ${method}: ${data.description || r.status}`);
  return data.result;
}

const say = (chatId, text) => tg('sendMessage', { chat_id: chatId, text });

// Все ящики этого чата: подключённые в боте + привязанные через веб (без дублей)
function collectChatAccounts(chatId) {
  const accs = [...(tgUsers.get(String(chatId))?.accounts || [])];
  const seen = new Set(accs.map((a) => a.email));
  for (const [, s] of sessions) {
    if (s.tg?.chatId !== chatId) continue;
    for (const a of s.accounts) {
      if (!seen.has(a.email)) { seen.add(a.email); accs.push(a); }
    }
  }
  return accs;
}

async function handleTgUpdate(u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const key = String(chatId);
  const text = msg.text.trim();
  const [cmd, arg] = text.split(/\s+/);

  // Привязка по ссылке из веб-приложения
  if (cmd === '/start' && arg) {
    const p = pendingLinks.get(arg);
    if (!p || Date.now() - p.at > 600_000) {
      await say(chatId, 'This link has expired — tap the Telegram button in the mail app again.');
      return;
    }
    pendingLinks.delete(arg);
    p.s.tg = { chatId, linkedAt: Date.now() };
    persistSessions();
    const list = p.s.accounts.map((a) => a.email).join('\n');
    await say(chatId, `🔔 Connected! You will get a message here for every new email.\n${list ? '\nWatching:\n' + list + '\n' : ''}\n/inbox — latest mail from all mailboxes\n/stop — disconnect.`);
    return;
  }

  // Самостоятельное подключение прямо в боте
  if (cmd === '/start' || cmd === '/connect' || cmd === '/add') {
    tgDialog.set(key, { state: 'email', at: Date.now() });
    await say(chatId, `📮 Let's connect your ${MAIL_DOMAIN} mailbox.\n\nSend me your address — just the name (e.g. john) or the full address (john@${MAIL_DOMAIN}).`);
    return;
  }
  // Единая лента: последние письма со всех подключённых ящиков
  if (cmd === '/inbox') {
    const accs = collectChatAccounts(chatId);
    if (!accs.length) {
      await say(chatId, 'No mailboxes connected yet. Send /connect to add one.');
      return;
    }
    const results = await Promise.allSettled(accs.map((a) => fetchInbox(a, 5)));
    const items = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') r.value.messages.forEach((m) => items.push({ ...m, email: accs[i].email }));
    });
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    const top = items.slice(0, 10);
    if (!top.length) {
      await say(chatId, `📥 All quiet — no mail in ${accs.length} mailbox(es) yet.`);
      return;
    }
    const lines = top.map((m) => {
      const when = new Date(m.date).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      return `${m.seen ? '▪️' : '🔵'} ${m.email} · ${when}\nFrom: ${m.fromName || m.from || '?'}\n${m.subject}`;
    });
    await say(chatId, `📥 Latest mail across ${accs.length} mailbox(es):\n\n` + lines.join('\n\n'));
    return;
  }
  if (cmd === '/list') {
    const own = tgUsers.get(key)?.accounts.map((a) => a.email) || [];
    for (const [, s] of sessions) if (s.tg?.chatId === chatId) own.push(...s.accounts.map((a) => a.email + ' (via web)'));
    await say(chatId, own.length ? 'Watching:\n' + own.join('\n') : 'No mailboxes connected yet. Send /connect to add one.');
    return;
  }
  if (cmd === '/stop') {
    let n = tgUsers.delete(key) ? 1 : 0;
    for (const [, s] of sessions) if (s.tg?.chatId === chatId) { delete s.tg; n++; }
    tgDialog.delete(key);
    persistSessions(); persistTgUsers();
    await say(chatId, n ? '🔕 Notifications disconnected. Send /connect to start again.' : 'Nothing to disconnect.');
    return;
  }

  // Продолжение диалога подключения
  const d = tgDialog.get(key);
  if (d && Date.now() - d.at > 1800_000) { tgDialog.delete(key); }
  const dialog = tgDialog.get(key);
  if (dialog?.state === 'email') {
    let addr = text.toLowerCase();
    if (!addr.includes('@')) addr = `${addr}@${MAIL_DOMAIN}`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) {
      await say(chatId, 'That does not look like an address. Send just the name (john) or the full address.');
      return;
    }
    dialog.email = addr; dialog.state = 'password'; dialog.at = Date.now();
    await say(chatId, `Now send the password for ${addr}.\n🔒 I will delete your message with the password right away.`);
    return;
  }
  if (dialog?.state === 'password') {
    // пароль не должен остаться в переписке
    await tg('deleteMessage', { chat_id: chatId, message_id: msg.message_id }).catch(() => {});
    if (tgTooManyFails(key)) {
      await say(chatId, 'Too many failed attempts. Please wait an hour and try again.');
      return;
    }
    const acc = { email: dialog.email, password: text, host: MAIL_HOST };
    try {
      await withImap(acc, async () => {});
    } catch {
      tgFails.get(key).push(Date.now());
      await say(chatId, `❌ Could not sign in to ${dialog.email} — check the password and send it again, or /connect to start over.`);
      return;
    }
    tgDialog.delete(key);
    const user = tgUsers.get(key) || { accounts: [] };
    user.accounts = user.accounts.filter((a) => a.email !== acc.email);
    user.accounts.push(acc);
    tgUsers.set(key, user);
    persistTgUsers();
    await say(chatId, `🔔 ${acc.email} connected! You will get a message here for every new email.\n\n/inbox — latest mail from all mailboxes\n/add — connect another mailbox\n/list — show connected\n/stop — disconnect everything`);
    return;
  }

  await say(chatId, `I deliver new-mail alerts for ${MAIL_DOMAIN}.\n\n/connect — link your mailbox\n/inbox — latest mail from all mailboxes\n/list — show connected\n/stop — disconnect`);
}

async function tgPollLoop() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await tg('getUpdates', { timeout: 50, offset, allowed_updates: ['message'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleTgUpdate(u).catch((e) => console.error('tg update:', e.message));
      }
    } catch (e) {
      console.error('tg poll:', e.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// Фоновая проверка: по uidNext видим новые письма с прошлого захода.
// Первый заход после привязки только запоминает uidNext — без спама историей.
async function tgCheckAccount(chatId, acc) {
  await withImap(acc, async (client) => {
    const st = await client.status('INBOX', { uidNext: true });
    const last = acc.tgUid;
    acc.tgUid = st.uidNext;
    if (last === undefined || st.uidNext <= last) return;
    const lock = await client.getMailboxLock('INBOX');
    const fresh = [];
    try {
      for await (const m of client.fetch(`${last}:*`, { uid: true, envelope: true }, { uid: true })) {
        if (m.uid >= last) fresh.push(m);
      }
    } finally {
      lock.release();
    }
    const MAXN = 5;
    for (const m of fresh.slice(0, MAXN)) {
      const sender = m.envelope.from?.[0] || {};
      const who = sender.name ? `${sender.name} <${sender.address || ''}>` : (sender.address || 'unknown');
      // превью текста письма — бот работает как сборщик, а не только звонок
      let preview = '';
      try {
        const lock2 = await client.getMailboxLock('INBOX');
        try {
          const full = await client.fetchOne(String(m.uid), { source: true }, { uid: true });
          if (full?.source) {
            const parsed = await simpleParser(full.source);
            preview = (parsed.text || '').replace(/\s+/g, ' ').trim();
            if (preview.length > 400) preview = preview.slice(0, 400) + '…';
          }
        } finally {
          lock2.release();
        }
      } catch {}
      await say(chatId, `📬 ${acc.email}\nFrom: ${who}\nSubject: ${m.envelope.subject || '(no subject)'}${preview ? '\n\n' + preview : ''}`);
    }
    if (fresh.length > MAXN) {
      await say(chatId, `…and ${fresh.length - MAXN} more new emails in ${acc.email}`);
    }
  });
}

let tgChecking = false;
async function tgCheckAll() {
  if (tgChecking) return; // не наслаиваем проверки, если предыдущая ещё идёт
  tgChecking = true;
  try {
    for (const [t, p] of pendingLinks) if (Date.now() - p.at > 600_000) pendingLinks.delete(t);
    // ящики, подключённые через бота
    for (const [key, u] of tgUsers) {
      for (const acc of u.accounts) {
        await tgCheckAccount(Number(key), acc).catch(() => {});
      }
    }
    // ящики, привязанные через веб; тот же адрес, уже подключённый через бота
    // в тот же чат, пропускаем — иначе будет двойное уведомление
    for (const [, s] of sessions) {
      if (!s.tg?.chatId) continue;
      const viaBot = new Set((tgUsers.get(String(s.tg.chatId))?.accounts || []).map((a) => a.email));
      for (const acc of s.accounts) {
        if (viaBot.has(acc.email)) continue;
        await tgCheckAccount(s.tg.chatId, acc).catch(() => {});
      }
    }
    persistSessions();
    persistTgUsers();
  } finally {
    tgChecking = false;
  }
}

if (TG_TOKEN) {
  tg('getMe').then((me) => {
    botUsername = me.username;
    console.log(`telegram bot @${botUsername} connected`);
    tgPollLoop();
    setInterval(() => tgCheckAll().catch(() => {}), 45_000).unref();
  }).catch((e) => console.error('telegram disabled:', e.message));
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
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Please provide an address and password.' });
  }
  if (s.accounts.length >= MAX_ACCOUNTS) {
    return res.status(400).json({ error: `No more than ${MAX_ACCOUNTS} mailboxes.` });
  }
  // можно вводить просто имя — домен допишем сами
  let addr = email.toLowerCase().trim();
  if (!addr.includes('@')) addr = `${addr}@${MAIL_DOMAIN}`;
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

// --- Telegram-уведомления: статус / привязка / отвязка ---
app.get('/api/telegram/status', (req, res) => {
  const s = getSession(req, res);
  res.json({ enabled: !!(TG_TOKEN && botUsername), linked: !!s.tg?.chatId, bot: botUsername });
});

app.post('/api/telegram/link', (req, res) => {
  if (!TG_TOKEN || !botUsername) return res.status(503).json({ error: 'Telegram is not configured on this server.' });
  const s = getSession(req, res);
  const token = crypto.randomBytes(12).toString('hex');
  pendingLinks.set(token, { s, at: Date.now() });
  res.json({ url: `https://t.me/${botUsername}?start=${token}` });
});

app.post('/api/telegram/unlink', (req, res) => {
  const s = getSession(req, res);
  delete s.tg;
  persistSessions();
  res.json({ ok: true });
});

// Полный выход: сессия забывает все ящики
app.post('/api/logout', (req, res) => {
  const s = getSession(req, res);
  s.accounts = [];
  delete s.tg;
  persistSessions();
  res.json({ ok: true });
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

// Пакетное удаление: письма уезжают в корзину.
// items: [{account, uids: [..]}], folder: 'inbox' | 'spam'
app.post('/api/delete', async (req, res) => {
  const s = getSession(req, res);
  const { items, folder } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Invalid parameters.' });
  try {
    for (const it of items) {
      const acc = findAccount(s, it.account);
      const uids = (Array.isArray(it.uids) ? it.uids : []).map((u) => parseInt(u, 10)).filter(Boolean);
      if (!acc || !uids.length) continue;
      await withImap(acc, async (client) => {
        const src = folder === 'spam' ? await resolveJunk(client) : 'INBOX';
        const trash = await resolveTrash(client);
        await client.mailboxCreate(trash).catch(() => {});
        const lock = await client.getMailboxLock(src);
        try {
          await client.messageMove(uids.join(','), trash, { uid: true });
        } finally {
          lock.release();
        }
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.responseText || e.message });
  }
});

// ===== Сборка: все ящики пользователя под одним именем и паролем =====
// Создал сборку -> на любом устройстве ввёл имя+пароль -> все почты подгрузились.
const BUNDLES_FILE = process.env.BUNDLES_FILE || '/data/bundles.json';
let bundles = {};
try {
  bundles = JSON.parse(fs.readFileSync(BUNDLES_FILE, 'utf8'));
  console.log(`restored ${Object.keys(bundles).length} bundles from disk`);
} catch (e) {
  if (e.code !== 'ENOENT') console.error('could not restore bundles:', e.message);
}
let bundleTimer = null;
function persistBundles() {
  clearTimeout(bundleTimer);
  bundleTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(BUNDLES_FILE), { recursive: true });
      const tmp = BUNDLES_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(bundles), { mode: 0o600 });
      fs.renameSync(tmp, BUNDLES_FILE);
    } catch (e) {
      console.error('failed to persist bundles:', e.message);
    }
  }, 500);
  bundleTimer.unref?.();
}
const bundleHash = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString('hex');

// Создать (или обновить со своим паролем) сборку из ящиков текущей сессии
app.post('/api/bundle', (req, res) => {
  const s = getSession(req, res);
  const name = String(req.body?.name || '').trim().toLowerCase();
  const pass = req.body?.password;
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(name)) {
    return res.status(400).json({ error: 'Combo name: 2–32 chars, letters/digits/dot/dash.' });
  }
  if (typeof pass !== 'string' || pass.length < 6) {
    return res.status(400).json({ error: 'Combo password must be 6+ characters.' });
  }
  if (!s.accounts.length) return res.status(400).json({ error: 'Add at least one mailbox first.' });
  const ex = bundles[name];
  if (ex && bundleHash(pass, ex.salt) !== ex.hash) {
    return res.status(403).json({ error: 'This combo name is already taken.' });
  }
  const salt = ex?.salt || crypto.randomBytes(8).toString('hex');
  bundles[name] = {
    salt,
    hash: bundleHash(pass, salt),
    accounts: s.accounts.map(({ email, password, host }) => ({ email, password, host })),
    updatedAt: new Date().toISOString(),
  };
  persistBundles();
  res.json({ ok: true, name, count: bundles[name].accounts.length });
});

// Войти сборкой: все её ящики добавляются в текущую сессию
app.post('/api/bundle/login', (req, res) => {
  const s = getSession(req, res);
  const name = String(req.body?.name || '').trim().toLowerCase();
  const pass = req.body?.password;
  const b = bundles[name];
  if (!b || typeof pass !== 'string' || bundleHash(pass, b.salt) !== b.hash) {
    return res.status(401).json({ error: 'Wrong combo name or password.' });
  }
  let added = 0;
  for (const a of b.accounts) {
    if (s.accounts.some((x) => x.email === a.email)) continue;
    if (s.accounts.length >= MAX_ACCOUNTS) break;
    s.accounts.push({ id: crypto.randomBytes(6).toString('hex'), ...a });
    added++;
  }
  persistSessions();
  res.json({ ok: true, added, total: s.accounts.length });
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
