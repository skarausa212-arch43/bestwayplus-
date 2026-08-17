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
const MailComposer = require('nodemailer/lib/mail-composer');

const MAIL_HOST = process.env.MAIL_HOSTNAME;
// Домен адресов: задаётся явно, иначе выводим из hostname (mail.example.com -> example.com)
const MAIL_DOMAIN = process.env.MAIL_DOMAIN || (MAIL_HOST || '').replace(/^mail\./, '');
// Админ сервиса: сессия/чат с этим ящиком получает статистику и мониторинг.
// Админ-права даёт и вход в комбо-аккаунт с именем ADMIN_BUNDLE.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || `romanby@${MAIL_DOMAIN}`).toLowerCase();
const ADMIN_BUNDLE = (process.env.ADMIN_BUNDLE || 'romanby').toLowerCase();

function isAdminSession(s) {
  return s.bundle === ADMIN_BUNDLE || s.accounts.some((a) => a.email === ADMIN_EMAIL);
}

// Чат админа: подключён ящик админа или любой ящик из админской сборки
function chatIsAdmin(chatId) {
  const accs = collectChatAccounts(chatId);
  if (accs.some((a) => a.email === ADMIN_EMAIL)) return true;
  const b = bundles[ADMIN_BUNDLE];
  return !!b && accs.some((a) => b.accounts.some((x) => x.email === a.email));
}
// Конфиг DMS смонтирован read-only — для админ-статистики
const DMS_CONFIG_DIR = process.env.DMS_CONFIG_DIR || '/dmsconfig';
const PORT = process.env.PORT || 8082;
const MAX_ACCOUNTS = parseInt(process.env.MAX_ACCOUNTS, 10) || 20;
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
const resolveSent = (client) => resolveSpecial(client, '\\Sent', 'Sent');

// Отправка письма + копия в папку Sent: SMTP сам копий не сохраняет,
// это делает клиент — то есть мы, через IMAP APPEND
async function sendAndStore(acc, { to, subject, text, attachments }) {
  const raw = await new Promise((resolve, reject) => {
    new MailComposer({ from: acc.email, to, subject, text, attachments })
      .compile().build((e, m) => (e ? reject(e) : resolve(m)));
  });
  const transport = nodemailer.createTransport({
    host: acc.host, port: 465, secure: true,
    auth: { user: acc.email, pass: acc.password },
  });
  await transport.sendMail({
    envelope: { from: acc.email, to: to.split(',').map((s) => s.trim()).filter(Boolean) },
    raw,
  });
  // копия в Sent — если вдруг не получится, отправку это не отменяет
  await withImap(acc, async (client) => {
    const sent = await resolveSent(client);
    await client.mailboxCreate(sent).catch(() => {});
    await client.append(sent, raw, ['\\Seen']);
  }).catch((e) => console.error('sent-copy failed:', e.message));
}

async function boxFor(client, folder) {
  if (folder === 'spam') return resolveJunk(client);
  if (folder === 'trash') return resolveTrash(client);
  if (folder === 'sent') return resolveSent(client);
  return 'INBOX';
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
        const rcpt = m.envelope.to?.[0] || {};
        messages.push({
          uid: m.uid,
          subject: m.envelope.subject || '(no subject)',
          from: sender.address || '',
          fromName: sender.name || '',
          to: rcpt.address || '',
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
// Контекст уведомлений для ответа реплаем: 'chatId:msgId' -> {email, replyTo, subject}
const tgNotifCtx = new Map();
function rememberCtx(key, ctx) {
  tgNotifCtx.set(key, ctx);
  if (tgNotifCtx.size > 800) tgNotifCtx.delete(tgNotifCtx.keys().next().value);
}
// Настройки чата (дайджест) живут в tgUsers[key].prefs — переживают рестарт
function tgPrefs(key) {
  const u = tgUsers.get(key) || { accounts: [] };
  if (!u.prefs) u.prefs = { digest: false, pending: [] };
  tgUsers.set(key, u);
  return u.prefs;
}
// Чат админа — для мониторинга с хоста (скрипт читает файл)
function noteAdminChat(chatId, accs) {
  const adminBundle = bundles[ADMIN_BUNDLE];
  const viaBundle = !!adminBundle &&
    accs.some((a) => adminBundle.accounts.some((x) => x.email === a.email));
  if (!viaBundle && !accs.some((a) => a.email === ADMIN_EMAIL)) return;
  try {
    fs.mkdirSync(path.dirname(TG_USERS_FILE), { recursive: true });
    fs.writeFileSync(path.join(path.dirname(TG_USERS_FILE), 'admin-chat.json'),
      JSON.stringify({ chatId }), { mode: 0o600 });
  } catch {}
}

function adminStats() {
  let mailboxes = 0;
  const recent = [];
  try {
    mailboxes = fs.readFileSync(path.join(DMS_CONFIG_DIR, 'postfix-accounts.cf'), 'utf8')
      .split('\n').filter((l) => l.includes('|')).length;
  } catch {}
  try {
    const profiles = JSON.parse(fs.readFileSync(path.join(DMS_CONFIG_DIR, 'user-profiles.json'), 'utf8'));
    const entries = Object.entries(profiles).sort((a, b) => (b[1].createdAt || '').localeCompare(a[1].createdAt || ''));
    for (const [email, p] of entries.slice(0, 5)) recent.push(`${email} (${(p.createdAt || '').slice(0, 10)})`);
  } catch {}
  let visitorsToday = 0;
  try {
    const vis = JSON.parse(fs.readFileSync(path.join(DMS_CONFIG_DIR, 'visitors.json'), 'utf8'));
    visitorsToday = Object.keys(vis[new Date().toISOString().slice(0, 10)] || {}).length;
  } catch {}
  return {
    mailboxes,
    sessions: sessions.size,
    bundles: Object.keys(bundles).length,
    telegramChats: tgUsers.size,
    visitorsToday,
    recentSignups: recent,
  };
}
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

  // Ответ реплаем на уведомление -> отправляем письмо отправителю
  if (msg.reply_to_message && !text.startsWith('/')) {
    const ctx = tgNotifCtx.get(key + ':' + msg.reply_to_message.message_id);
    if (ctx) {
      const acc = collectChatAccounts(chatId).find((a) => a.email === ctx.email);
      if (!acc) { await say(chatId, 'That mailbox is no longer connected.'); return; }
      try {
        await sendAndStore(acc, { to: ctx.replyTo, subject: 'Re: ' + ctx.subject, text });
        await say(chatId, `✉️ Sent to ${ctx.replyTo} from ${acc.email}`);
      } catch (e) {
        await say(chatId, '❌ Failed to send: ' + (e.response || e.message));
      }
      return;
    }
  }

  // Отправка нового письма: /send [from@my.box] to@addr Subject words | body text
  if (cmd === '/send') {
    const accs = collectChatAccounts(chatId);
    if (!accs.length) { await say(chatId, 'No mailboxes connected. Send /connect first.'); return; }
    let rest = text.slice(cmd.length).trim();
    let from = accs[0];
    const first = rest.split(/\s+/)[0] || '';
    const own = accs.find((a) => a.email === first.toLowerCase());
    if (own) { from = own; rest = rest.slice(first.length).trim(); }
    const m = rest.match(/^(\S+@\S+)\s+([^|]+)\|([\s\S]+)$/);
    if (!m) {
      await say(chatId, 'Format:\n/send to@addr Subject | message text\n(or /send your@box to@addr Subject | text to pick the sender)');
      return;
    }
    try {
      await sendAndStore(from, { to: m[1], subject: m[2].trim(), text: m[3].trim() });
      await say(chatId, `✉️ Sent to ${m[1]} from ${from.email}`);
    } catch (e) {
      await say(chatId, '❌ Failed to send: ' + (e.response || e.message));
    }
    return;
  }

  // Дайджест: копить письма и присылать сводку раз в час
  if (cmd === '/digest') {
    const p = tgPrefs(key);
    p.digest = !p.digest;
    persistTgUsers();
    await say(chatId, p.digest
      ? '🕐 Digest mode ON: I will send an hourly summary instead of instant alerts. /digest to turn off.'
      : '⚡ Instant alerts ON.');
    return;
  }

  // Статистика сервиса — только для админа
  if (cmd === '/stats') {
    if (!chatIsAdmin(chatId)) {
      await say(chatId, 'This command is for the service admin.');
      return;
    }
    const st = adminStats();
    await say(chatId, `👑 EmailInc stats\n\nVisitors today: ${st.visitorsToday}\nMailboxes: ${st.mailboxes}\nActive sessions: ${st.sessions}\nCombo accounts: ${st.bundles}\nTelegram chats: ${st.telegramChats}\n\nRecent signups:\n${st.recentSignups.join('\n') || '—'}`);
    return;
  }

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
    noteAdminChat(chatId, p.s.accounts);
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
    noteAdminChat(chatId, user.accounts);
    await say(chatId, `🔔 ${acc.email} connected! You will get a message here for every new email.\n\n/inbox — latest mail from all mailboxes\n/add — connect another mailbox\n/list — show connected\n/stop — disconnect everything`);
    return;
  }

  await say(chatId, `I deliver new-mail alerts for ${MAIL_DOMAIN}.\n\n/connect — link your mailbox\n/inbox — latest mail from all mailboxes\n/send to@addr Subject | text — send an email\n/digest — hourly summary instead of instant alerts\n/list — show connected\n/stop — disconnect\n\nTip: reply to any alert to answer that email.`);
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
    const prefs = tgPrefs(String(chatId));
    for (const m of fresh.slice(0, MAXN)) {
      const sender = m.envelope.from?.[0] || {};
      const who = sender.name ? `${sender.name} <${sender.address || ''}>` : (sender.address || 'unknown');
      const subject = m.envelope.subject || '(no subject)';
      if (prefs.digest) {
        prefs.pending.push(`${acc.email} ← ${who}: ${subject}`);
        if (prefs.pending.length > 50) prefs.pending.shift();
        continue;
      }
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
      const sent = await tg('sendMessage', { chat_id: chatId,
        text: `📬 ${acc.email}\nFrom: ${who}\nSubject: ${subject}${preview ? '\n\n' + preview : ''}\n\n↩️ Reply to this message to answer by email` });
      rememberCtx(chatId + ':' + sent.message_id,
        { email: acc.email, replyTo: sender.address || '', subject });
    }
    if (prefs.digest) persistTgUsers();
    if (fresh.length > MAXN && !prefs.digest) {
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

// Часовой дайджест: копившиеся уведомления уходят одной сводкой
async function tgFlushDigests() {
  for (const [key, u] of tgUsers) {
    const p = u.prefs;
    if (!p?.digest || !p.pending?.length) continue;
    const lines = p.pending.slice(0, 20);
    const more = p.pending.length - lines.length;
    p.pending = [];
    await say(Number(key), `🕐 Mail digest — ${lines.length + more} new:\n\n` +
      lines.map((l) => '• ' + l).join('\n') + (more > 0 ? `\n…and ${more} more` : ''))
      .catch(() => {});
  }
  persistTgUsers();
}

if (TG_TOKEN) {
  tg('getMe').then((me) => {
    botUsername = me.username;
    console.log(`telegram bot @${botUsername} connected`);
    tgPollLoop();
    setInterval(() => tgCheckAll().catch(() => {}), 45_000).unref();
    setInterval(() => tgFlushDigests().catch(() => {}), 3600_000).unref();
  }).catch((e) => console.error('telegram disabled:', e.message));
}

const app = express();
// /api/send принимает вложения (base64) — ему свой лимит, остальным маленький
const smallJson = express.json({ limit: '200kb' });
app.use((req, res, next) => (req.path === '/api/send' ? next() : smallJson(req, res, next)));
app.use(express.static(path.join(__dirname, 'public'), {
  // HTML всегда перепроверяется браузером — иначе телефоны показывают старый кэш
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, must-revalidate'); },
}));

app.get('/api/info', (req, res) => {
  const s = getSession(req, res);
  adoptBundle(s);
  res.json({
    host: MAIL_HOST,
    maxAccounts: MAX_ACCOUNTS,
    accounts: s.accounts.map((a) => ({ id: a.id, email: a.email })),
    isAdmin: isAdminSession(s),
    bundle: s.bundle || null,
  });
});

// Статистика сервиса — только для сессии, в которую добавлен ящик админа
app.get('/api/admin/stats', (req, res) => {
  const s = getSession(req, res);
  if (!isAdminSession(s)) {
    return res.status(403).json({ error: 'Admins only.' });
  }
  res.json(adminStats());
});

// Добавить ящик: проверяем логин по IMAP, только потом сохраняем
app.post('/api/accounts', async (req, res) => {
  const s = getSession(req, res);
  adoptBundle(s); // сначала свежий состав сборки — иначе затрём чужие добавления
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
  syncBundle(s); // сессия привязана к сборке — новый ящик попадает в неё сам
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
  delete s.bundle; // сначала отвязка — иначе выход опустошил бы сборку
  s.accounts = [];
  delete s.tg;
  persistSessions();
  res.json({ ok: true });
});

app.delete('/api/accounts/:id', (req, res) => {
  const s = getSession(req, res);
  adoptBundle(s);
  const before = s.accounts.length;
  s.accounts = s.accounts.filter((a) => a.id !== req.params.id);
  persistSessions();
  syncBundle(s); // сборка зеркалит текущий набор ящиков
  res.json({ ok: s.accounts.length < before });
});

// Все входящие всех ящиков одним запросом
app.get('/api/inbox', async (req, res) => {
  const s = getSession(req, res);
  adoptBundle(s);
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 20);
  const results = await Promise.allSettled(s.accounts.map((a) => fetchInbox(a, limit)));
  res.json({
    accounts: s.accounts.map((a, i) => {
      const r = results[i];
      return r.status === 'fulfilled'
        ? { id: a.id, email: a.email, unseen: r.value.unseen, total: r.value.total, messages: r.value.messages, spam: r.value.spam }
        : { id: a.id, email: a.email, error: r.reason?.responseText || r.reason?.message || 'error' };
    }),
  });
});

// Содержимое любой папки (sent/trash подгружаются по требованию)
app.get('/api/folder', async (req, res) => {
  const s = getSession(req, res);
  const folder = String(req.query.folder || '');
  if (!['inbox', 'spam', 'sent', 'trash'].includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder.' });
  }
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 20);
  const results = await Promise.allSettled(s.accounts.map((a) => withImap(a, async (client) => {
    try {
      return await fetchMailbox(client, await boxFor(client, folder), limit);
    } catch {
      return { unseen: 0, total: 0, messages: [] }; // папки может ещё не быть
    }
  })));
  res.json({
    accounts: s.accounts.map((a, i) => {
      const r = results[i];
      return r.status === 'fulfilled'
        ? { id: a.id, email: a.email, ...r.value }
        : { id: a.id, email: a.email, error: r.reason?.responseText || r.reason?.message || 'error' };
    }),
  });
});

// Поиск по всем ящикам (тема / отправитель / получатель, папка входящих)
app.get('/api/search', async (req, res) => {
  const s = getSession(req, res);
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ error: 'Query too short.' });
  const results = await Promise.allSettled(s.accounts.map((a) => withImap(a, async (client) => {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const found = new Set();
      for (const crit of [{ subject: q }, { from: q }, { to: q }]) {
        for (const uid of (await client.search(crit, { uid: true })) || []) found.add(uid);
      }
      const uids = [...found].sort((x, y) => y - x).slice(0, 20);
      const messages = [];
      if (uids.length) {
        for await (const m of client.fetch(uids.join(','), { uid: true, envelope: true, flags: true, internalDate: true }, { uid: true })) {
          const sender = m.envelope.from?.[0] || {};
          messages.push({
            uid: m.uid, subject: m.envelope.subject || '(no subject)',
            from: sender.address || '', fromName: sender.name || '',
            date: m.internalDate, seen: m.flags.has('\\Seen'),
          });
        }
      }
      return messages;
    } finally {
      lock.release();
    }
  })));
  const items = [];
  s.accounts.forEach((a, i) => {
    if (results[i].status === 'fulfilled') {
      for (const m of results[i].value) items.push({ ...m, account: a.id, email: a.email });
    }
  });
  items.sort((x, y) => new Date(y.date) - new Date(x.date));
  res.json({ items });
});

// Пометить всё прочитанным в папке (во всех ящиках или в одном)
app.post('/api/read-all', async (req, res) => {
  const s = getSession(req, res);
  const { folder, account } = req.body || {};
  const accs = account ? s.accounts.filter((a) => a.id === account) : s.accounts;
  await Promise.allSettled(accs.map((a) => withImap(a, async (client) => {
    const lock = await client.getMailboxLock(await boxFor(client, folder));
    try {
      await client.messageFlagsAdd('1:*', ['\\Seen']);
    } finally {
      lock.release();
    }
  })));
  res.json({ ok: true });
});

// Полный текст письма (и пометить прочитанным)
app.get('/api/message', async (req, res) => {
  const s = getSession(req, res);
  const acc = findAccount(s, req.query.account);
  const uid = parseInt(req.query.uid, 10);
  if (!acc || !uid) return res.status(400).json({ error: 'Invalid parameters.' });
  try {
    const result = await withImap(acc, async (client) => {
      const box = await boxFor(client, req.query.folder);
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
    const addrList = (x) => (x?.value || []).map((v) => v.address).filter(Boolean);
    res.json({
      subject: result.subject || '(no subject)',
      from: result.from?.text || '',
      fromAddr: result.from?.value?.[0]?.address || '',
      to: result.to?.text || '',
      toAddrs: addrList(result.to),
      ccAddrs: addrList(result.cc),
      date: result.date,
      html: result.html || null,
      text: result.text || '',
      attachments: (result.attachments || []).map((a) => ({ filename: a.filename, size: a.size })),
    });
  } catch (e) {
    res.status(500).json({ error: e.responseText || e.message });
  }
});

// Переместить письмо: to = 'inbox' | 'spam'; from — папка-источник
// (по умолчанию для совместимости: spam->inbox либо inbox->spam)
app.post('/api/move', async (req, res) => {
  const s = getSession(req, res);
  const { account, uid, to, from } = req.body || {};
  const acc = findAccount(s, account);
  const u = parseInt(uid, 10);
  if (!acc || !u || !['inbox', 'spam'].includes(to) ||
      (from && !['inbox', 'spam', 'trash', 'sent'].includes(from))) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }
  try {
    await withImap(acc, async (client) => {
      const src = from ? await boxFor(client, from)
        : (to === 'inbox' ? await resolveJunk(client) : 'INBOX');
      const dst = await boxFor(client, to);
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

// Скачивание вложения: ?account=&uid=&folder=&i=<номер>
app.get('/api/attachment', async (req, res) => {
  const s = getSession(req, res);
  const acc = findAccount(s, req.query.account);
  const uid = parseInt(req.query.uid, 10);
  const idx = parseInt(req.query.i, 10) || 0;
  if (!acc || !uid) return res.status(400).json({ error: 'Invalid parameters.' });
  try {
    const att = await withImap(acc, async (client) => {
      const lock = await client.getMailboxLock(await boxFor(client, req.query.folder));
      try {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) return null;
        const parsed = await simpleParser(msg.source);
        return (parsed.attachments || [])[idx] || null;
      } finally {
        lock.release();
      }
    });
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
    res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(att.filename || 'file')}`);
    res.end(att.content);
  } catch (e) {
    res.status(500).json({ error: e.responseText || e.message });
  }
});

// Пакетное удаление: письма уезжают в корзину; из корзины — удаляются навсегда.
// items: [{account, uids: [..]}], folder: 'inbox' | 'spam' | 'sent' | 'trash'
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
        const src = await boxFor(client, folder);
        const lock = await client.getMailboxLock(src);
        try {
          if (folder === 'trash') {
            await client.messageDelete(uids.join(','), { uid: true });
          } else {
            const trash = await resolveTrash(client);
            await client.mailboxCreate(trash).catch(() => {});
            await client.messageMove(uids.join(','), trash, { uid: true });
          }
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

// Сессия, создавшая сборку или вошедшая ею, привязана к ней (s.bundle = имя):
// каждый добавленный/удалённый ящик сразу отражается в сборке
function syncBundle(s) {
  const b = s.bundle && bundles[s.bundle];
  if (!b) return;
  b.accounts = s.accounts.map(({ email, password, host }) => ({ email, password, host }));
  b.updatedAt = new Date().toISOString();
  persistBundles();
}

// Обратное направление: привязанная сессия подтягивает актуальный состав сборки.
// Добавил ящик на одном устройстве — он появляется на всех остальных.
function adoptBundle(s) {
  const b = s.bundle && bundles[s.bundle];
  if (!b) return;
  const byEmail = new Map(s.accounts.map((a) => [a.email, a]));
  const fresh = b.accounts.slice(0, MAX_ACCOUNTS).map((a) => {
    const old = byEmail.get(a.email);
    // id сохраняем, чтобы открытое письмо/фильтр не слетали; tgUid — чтобы
    // телеграм-уведомления не пересчитывали историю
    return { ...a, id: old?.id || crypto.randomBytes(6).toString('hex'), tgUid: old?.tgUid };
  });
  const changed = fresh.length !== s.accounts.length ||
    fresh.some((a, i) => a.email !== s.accounts[i]?.email);
  s.accounts = fresh;
  if (changed) persistSessions();
}

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
  s.bundle = name;
  persistSessions();
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
  s.bundle = name;
  persistSessions();
  res.json({ ok: true, added, total: s.accounts.length });
});

// Отправка письма от имени любого добавленного ящика (с вложениями base64)
app.post('/api/send', express.json({ limit: '25mb' }), async (req, res) => {
  const s = getSession(req, res);
  const { account, to, subject, text, attachments } = req.body || {};
  const acc = findAccount(s, account);
  if (!acc) return res.status(400).json({ error: 'Mailbox not found.' });
  if (typeof to !== 'string' || !to.includes('@')) return res.status(400).json({ error: 'Please provide a recipient.' });
  const files = (Array.isArray(attachments) ? attachments : []).slice(0, 10).map((a) => ({
    filename: String(a.filename || 'file').slice(0, 120),
    content: Buffer.from(String(a.content || ''), 'base64'),
  }));
  const totalSize = files.reduce((n, f) => n + f.content.length, 0);
  if (totalSize > 18 * 1024 * 1024) return res.status(400).json({ error: 'Attachments are too large (18 MB max).' });
  try {
    await sendAndStore(acc, {
      to,
      subject: String(subject || ''),
      text: String(text || ''),
      attachments: files,
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to send: ' + (e.response || e.message) });
  }
});

app.listen(PORT, () => {
  console.log(`multimail listening on :${PORT}, IMAP host ${MAIL_HOST}`);
});
