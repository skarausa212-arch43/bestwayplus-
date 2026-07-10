/**
 * PayMeSafe — полный сервер платформы. ZERO DEPENDENCIES.
 *
 * Запуск:  node server.js      → http://localhost:3001
 * Никакого npm install: только встроенные модули Node 18+.
 *
 * Что внутри:
 *   - Статика (index.html)
 *   - Auth: пароли через scrypt, токены через HMAC (без сторонних JWT-библиотек)
 *   - Движок эскроу (машина состояний + леджер) — escrow-engine/core
 *   - Чат сделки и арбитраж со сплит-решениями
 *   - DEV-режим: симуляция депозита вместо Tron watcher'а,
 *     чтобы полный цикл можно было пройти без testnet.
 *     В production депозиты подтверждает ТОЛЬКО deposit-watcher из блокчейна.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { EscrowEngine } = require('./escrow-engine/core/escrow-engine');
const { DealChat } = require('./escrow-engine/core/chat');
const { ArbitrationService } = require('./escrow-engine/core/arbitration');
const { fromBaseUnits, toBaseUnits } = require('./escrow-engine/core/fees');

const PORT = process.env.PORT || 3001;
const DEV_MODE = process.env.DEV_MODE !== '0'; // по умолчанию включён

/**
 * Кошелёк платформы для пополнений (Tron, TRC-20 USDT).
 * ⚠️ Единый адрес на все сделки: в production сопоставление депозита со
 * сделкой должно идти по уникальной сумме (amount + случайные центы) или
 * по уникальным адресам на сделку (см. escrow-engine/tron/tron-wallet.js).
 * Приватный ключ этого адреса живёт ТОЛЬКО в env на сервере выплат.
 */
const PLATFORM_DEPOSIT_ADDRESS = process.env.PLATFORM_DEPOSIT_ADDRESS || 'TYyr8571CtVU1PyQ7Lam5uoJh73WCMC7Pr';
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// ─────────────────────────── СЕКРЕТ И ПОЛЬЗОВАТЕЛИ ───────────────────────────

const secretFile = path.join(DATA_DIR, 'secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(secretFile, 'utf8');

const usersFile = path.join(DATA_DIR, 'users.json');
const users = fs.existsSync(usersFile) ? JSON.parse(fs.readFileSync(usersFile, 'utf8')) : {};
const saveUsers = () => fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));

// Приглашения по ссылке (сделка ещё не создана — ждёт вступления второй стороны)
const invitesFile = path.join(DATA_DIR, 'invites.json');
const invites = fs.existsSync(invitesFile) ? JSON.parse(fs.readFileSync(invitesFile, 'utf8')) : {};
const saveInvites = () => fs.writeFileSync(invitesFile, JSON.stringify(invites, null, 2));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, { salt, hash }) {
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(test), Buffer.from(hash));
}
function makeToken(email) {
  const exp = Date.now() + 7 * 86400_000;
  const payload = `${email}|${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}
function verifyToken(token) {
  try {
    const [email, exp, sig] = Buffer.from(token, 'base64url').toString().split('|');
    const expect = crypto.createHmac('sha256', SECRET).update(`${email}|${exp}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    if (Date.now() > Number(exp)) return null;
    return users[email] || null;
  } catch { return null; }
}

// Активация аккаунта по email (подписанный токен + ссылка).
function makeVerifyToken(email) {
  const exp = Date.now() + 3 * 86400_000;
  const payload = `${email}|verify|${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}
function readVerifyToken(token) {
  try {
    const [email, purpose, exp, sig] = Buffer.from(token, 'base64url').toString().split('|');
    if (purpose !== 'verify') return null;
    const expect = crypto.createHmac('sha256', SECRET).update(`${email}|verify|${exp}`).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    if (Date.now() > Number(exp)) return null;
    return email;
  } catch { return null; }
}
function activationLink(req, token) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}/api/auth/verify?token=${token}`;
}
const isActivated = u => u && u.activated !== false; // старые аккаунты (без поля) считаем активными

// DEV: сидируем арбитра платформы, чтобы спор было кому решать
if (DEV_MODE && !users['arbiter@paymesafe.online']) {
  users['arbiter@paymesafe.online'] = {
    email: 'arbiter@paymesafe.online',
    pass: hashPassword('arbiter123'),
    tronAddress: 'TArbiterPlatformAddr',
    isArbiter: true,
    activated: true,
    createdAt: new Date().toISOString(),
  };
  saveUsers();
  console.log('[dev] арбитр: arbiter@paymesafe.online / arbiter123');
}

// Администратор платформы. Пароль берётся из env ADMIN_PASSWORD (в проде),
// в DEV — дефолтный admin123. Админ одновременно является арбитром,
// чтобы мог входить в спор и выносить решение.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@paymesafe.online';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (DEV_MODE ? 'admin123' : null);
if (ADMIN_PASSWORD && !users[ADMIN_EMAIL]) {
  users[ADMIN_EMAIL] = {
    email: ADMIN_EMAIL,
    pass: hashPassword(ADMIN_PASSWORD),
    tronAddress: 'TAdminPlatformAddr',
    isArbiter: true,
    isAdmin: true,
    activated: true,
    createdAt: new Date().toISOString(),
  };
  saveUsers();
  console.log(`[admin] администратор: ${ADMIN_EMAIL}` + (DEV_MODE ? ' / admin123' : ' (пароль из ADMIN_PASSWORD)'));
} else if (users[ADMIN_EMAIL] && !users[ADMIN_EMAIL].isAdmin) {
  users[ADMIN_EMAIL].isAdmin = true;
  users[ADMIN_EMAIL].isArbiter = true;
  saveUsers();
}

// ─────────────────────────── ДВИЖОК, ЧАТ, АРБИТРАЖ ───────────────────────────

const engine = new EscrowEngine({
  storePath: path.join(DATA_DIR, 'ledger.json'),
  walletService: { createDepositAddress: async () => PLATFORM_DEPOSIT_ADDRESS },
});
const chat = new DealChat(engine.ledger, path.join(DATA_DIR, 'chat.json'));
const arbiters = Object.values(users).filter(u => u.isArbiter).map(u => u.email);
const arbitration = new ArbitrationService(engine, chat, { arbiters });

// ─────────────────────────── СЕРИАЛИЗАЦИЯ ───────────────────────────

function dealView(d, viewerEmail) {
  const myRole = viewerEmail === d.buyer.email ? 'buyer'
    : viewerEmail === d.seller.email ? 'seller'
    : d.dispute?.arbiter === viewerEmail ? 'arbiter' : null;
  return {
    id: d.id, title: d.title, template: d.template, state: d.state,
    amount: fromBaseUnits(BigInt(d.amount)),
    requiredDeposit: fromBaseUnits(BigInt(d.requiredDeposit)),
    deposited: fromBaseUnits(engine.ledger.depositedFor(d.id)),
    feeBps: d.feeBps, feePayer: d.feePayer || 'split',
    buyerFeeBps: d.buyerFeeBps ?? 100, sellerFeeBps: d.sellerFeeBps ?? 100,
    depositAddress: d.depositAddress, deadline: d.deadline,
    buyer: { email: d.buyer.email, approved: d.buyer.approved },
    seller: { email: d.seller.email, approved: d.seller.approved },
    myRole,
    completion: d.completion || { buyer: false, seller: false },
    dispute: d.dispute || null,
    resolution: d.resolution || null,
    createdAt: d.createdAt,
  };
}

function journalView(dealId) {
  return engine.ledger.journal(dealId).map(e => ({
    ts: e.ts, type: e.type, amount: fromBaseUnits(BigInt(e.amount)), txid: e.txid,
  }));
}

const isParticipant = (d, email) =>
  d.buyer.email === email || d.seller.email === email || d.dispute?.arbiter === email;

// ─────────────────────────── HTTP-КАРКАС ───────────────────────────

function send(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Bad JSON')); } });
  });
}

function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return token ? verifyToken(token) : null;
}

// ─────────────────────────── РОУТЫ ───────────────────────────

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

// ---- AUTH ----

route('POST', /^\/api\/auth\/register$/, async (req, res) => {
  const { email, password, tronAddress } = await readBody(req);
  if (!email || !password) return send(res, 400, { error: 'Email и пароль обязательны' });
  if (!tronAddress) return send(res, 400, { error: 'Нужен TRON-адрес для выплат/возвратов' });
  if (users[email]) return send(res, 409, { error: 'Такой пользователь уже есть' });
  users[email] = { email, pass: hashPassword(password), tronAddress, isArbiter: false, activated: false,
    wallets: [{ address: tronAddress, label: 'Основной', primary: true }], createdAt: new Date().toISOString() };
  saveUsers();
  const link = activationLink(req, makeVerifyToken(email));
  // TODO: когда настроен SMTP — отправлять письмо со ссылкой вместо возврата в ответе
  send(res, 201, { needsActivation: true, email, activationUrl: DEV_MODE ? link : undefined });
});

route('POST', /^\/api\/auth\/login$/, async (req, res) => {
  const { email, password } = await readBody(req);
  const u = users[email];
  if (!u || !verifyPassword(password, u.pass)) return send(res, 401, { error: 'Неверный email или пароль' });
  if (!isActivated(u)) {
    const link = activationLink(req, makeVerifyToken(email));
    return send(res, 403, { error: 'Подтвердите email, чтобы войти', needsActivation: true, email, activationUrl: DEV_MODE ? link : undefined });
  }
  send(res, 200, { token: makeToken(email), me: { email, tronAddress: u.tronAddress, isArbiter: !!u.isArbiter, isAdmin: !!u.isAdmin } });
});

route('GET', /^\/api\/auth\/verify$/, async (req, res) => {
  const token = (req.url.split('token=')[1] || '').split('&')[0];
  const email = readVerifyToken(decodeURIComponent(token));
  const ok = !!(email && users[email]);
  if (ok && users[email].activated !== true) { users[email].activated = true; saveUsers(); }
  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PayMeSafe</title>
<div style="font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:grid;place-items:center;background:#0e0f1a;color:#fff;margin:0">
  <div style="text-align:center;max-width:440px;padding:32px">
    <div style="font-size:54px">${ok ? '✅' : '⚠️'}</div>
    <h1 style="font-size:22px;margin:.4em 0">${ok ? 'Аккаунт активирован' : 'Ссылка недействительна'}</h1>
    <p style="opacity:.7;line-height:1.5">${ok ? 'Готово! Теперь вы можете войти в PayMeSafe.' : 'Ссылка устарела или неверна — запросите новую на странице входа.'}</p>
    <a href="/" style="display:inline-block;margin-top:16px;padding:12px 24px;border-radius:11px;background:#7c5ce8;color:#fff;text-decoration:none;font-weight:700">Перейти ко входу →</a>
  </div></div></html>`;
  res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

route('POST', /^\/api\/auth\/resend$/, async (req, res) => {
  const { email } = await readBody(req);
  const u = users[email];
  if (!u) return send(res, 404, { error: 'Пользователь не найден' });
  if (isActivated(u)) return send(res, 200, { alreadyActivated: true });
  const link = activationLink(req, makeVerifyToken(email));
  // TODO: когда настроен SMTP — отправлять письмо
  send(res, 200, { sent: true, activationUrl: DEV_MODE ? link : undefined });
});

// ---- ПРОФИЛЬ / КОШЕЛЬКИ ----

function userWallets(u) {
  if (Array.isArray(u.wallets) && u.wallets.length) return u.wallets;
  return u.tronAddress ? [{ address: u.tronAddress, label: 'Основной', primary: true }] : [];
}
const meView = u => ({ email: u.email, isArbiter: !!u.isArbiter, isAdmin: !!u.isAdmin, tronAddress: u.tronAddress, wallets: userWallets(u) });

route('GET', /^\/api\/me$/, async (req, res, user) => {
  send(res, 200, { me: meView(user) });
});

route('POST', /^\/api\/me\/wallet$/, async (req, res, user) => {
  let { address, label } = await readBody(req);
  address = (address || '').trim();
  if (!/^[A-Za-z0-9]{20,64}$/.test(address)) return send(res, 400, { error: 'Некорректный адрес кошелька' });
  user.wallets = userWallets(user);
  if (user.wallets.some(w => w.address === address)) return send(res, 409, { error: 'Такой кошелёк уже добавлен' });
  const primary = user.wallets.length === 0;
  user.wallets.push({ address, label: (label || '').trim() || 'Кошелёк', primary });
  if (primary) user.tronAddress = address;
  saveUsers();
  send(res, 201, { me: meView(user) });
});

route('POST', /^\/api\/me\/wallet\/remove$/, async (req, res, user) => {
  const { address } = await readBody(req);
  user.wallets = userWallets(user);
  const w = user.wallets.find(x => x.address === address);
  if (!w) return send(res, 404, { error: 'Кошелёк не найден' });
  if (user.wallets.length <= 1) return send(res, 400, { error: 'Нельзя удалить единственный кошелёк' });
  if (w.primary) return send(res, 400, { error: 'Сначала назначьте основным другой кошелёк' });
  user.wallets = user.wallets.filter(x => x.address !== address);
  saveUsers();
  send(res, 200, { me: meView(user) });
});

route('POST', /^\/api\/me\/wallet\/primary$/, async (req, res, user) => {
  const { address } = await readBody(req);
  user.wallets = userWallets(user);
  if (!user.wallets.some(x => x.address === address)) return send(res, 404, { error: 'Кошелёк не найден' });
  user.wallets.forEach(x => { x.primary = x.address === address; });
  user.tronAddress = address; // адрес выплат/возвратов
  saveUsers();
  send(res, 200, { me: meView(user) });
});

// ---- DEALS ----

route('GET', /^\/api\/deals$/, async (req, res, user) => {
  const mine = engine.ledger.allDeals()
    .filter(d => isParticipant(d, user.email))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(d => dealView(d, user.email));
  send(res, 200, { deals: mine });
});

route('POST', /^\/api\/deals$/, async (req, res, user) => {
  const { title, amount, template = 'custom', role, counterpartyEmail,
          deadlineDays = 30, deadlineHours = 0, feePayer = 'split' } = await readBody(req);
  if (!['buyer', 'seller'].includes(role)) return send(res, 400, { error: 'role: buyer или seller' });
  const other = users[counterpartyEmail];
  if (!other) return send(res, 400, { error: 'Контрагент должен сначала зарегистрироваться на платформе' });

  const meP = { email: user.email, tronAddress: user.tronAddress };
  const otherP = { email: other.email, tronAddress: other.tronAddress };
  const deal = await engine.createDeal({
    title, amount, template, deadlineDays, deadlineHours, feePayer,
    buyer: role === 'buyer' ? meP : otherP,
    seller: role === 'seller' ? meP : otherP,
  });
  const feeText = feePayer === 'buyer' ? 'комиссию 2% платит покупатель'
    : feePayer === 'seller' ? 'комиссию 2% платит продавец'
    : 'комиссия 2% — пополам (по 1% со стороны)';
  announceDeal(deal, feePayer);
  send(res, 201, { deal: dealView(deal, user.email) });
});

function announceDeal(deal, feePayer) {
  const feeText = feePayer === 'buyer' ? 'комиссию 2% платит покупатель'
    : feePayer === 'seller' ? 'комиссию 2% платит продавец'
    : 'комиссия 2% — пополам (по 1% со стороны)';
  chat.system(deal.id, `Сделка создана: «${deal.title}» · $${fromBaseUnits(BigInt(deal.amount))} USDT · ${feeText}. Срок: до ${new Date(deal.deadline).toLocaleString('ru-RU')}. Ожидается подтверждение условий.`);
}
function inviteLink(req, token) {
  const proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}/?join=${token}`;
}

// Создать приглашение по ссылке (контрагент может быть ещё не зарегистрирован)
route('POST', /^\/api\/deals\/invite$/, async (req, res, user) => {
  const { title, amount, template = 'custom', role,
          deadlineDays = 30, deadlineHours = 0, feePayer = 'split' } = await readBody(req);
  if (!title || !amount) return send(res, 400, { error: 'Нужны название и сумма' });
  if (!['buyer', 'seller'].includes(role)) return send(res, 400, { error: 'role: buyer или seller' });
  if (!['split', 'buyer', 'seller'].includes(feePayer)) return send(res, 400, { error: 'feePayer неверный' });
  const token = crypto.randomUUID().replace(/-/g, '');
  invites[token] = { creatorEmail: user.email, creatorRole: role, title, amount, template,
    feePayer, deadlineDays, deadlineHours, createdAt: new Date().toISOString() };
  saveInvites();
  send(res, 201, { token, url: inviteLink(req, token) });
});

// Публичный просмотр приглашения (до входа)
route('GET', /^\/api\/invite\/([A-Za-z0-9]+)$/, async (req, res, user, m) => {
  const inv = invites[m[1]];
  if (!inv) return send(res, 404, { error: 'Приглашение не найдено или уже принято' });
  send(res, 200, { invite: {
    title: inv.title, amount: inv.amount, feePayer: inv.feePayer,
    creatorEmail: inv.creatorEmail, creatorRole: inv.creatorRole,
    youAre: inv.creatorRole === 'buyer' ? 'seller' : 'buyer',
  }});
});

// Принять приглашение → создаём сделку между создателем и вступившим
route('POST', /^\/api\/invite\/([A-Za-z0-9]+)\/accept$/, async (req, res, user, m) => {
  const inv = invites[m[1]];
  if (!inv) return send(res, 404, { error: 'Приглашение не найдено или уже принято' });
  if (inv.creatorEmail === user.email) return send(res, 400, { error: 'Нельзя принять собственное приглашение' });
  const creator = users[inv.creatorEmail];
  if (!creator) return send(res, 410, { error: 'Создатель приглашения недоступен' });

  const creatorP = { email: creator.email, tronAddress: creator.tronAddress };
  const joinerP = { email: user.email, tronAddress: user.tronAddress };
  const deal = await engine.createDeal({
    title: inv.title, amount: inv.amount, template: inv.template,
    deadlineDays: inv.deadlineDays, deadlineHours: inv.deadlineHours, feePayer: inv.feePayer,
    buyer: inv.creatorRole === 'buyer' ? creatorP : joinerP,
    seller: inv.creatorRole === 'seller' ? creatorP : joinerP,
  });
  announceDeal(deal, inv.feePayer);
  chat.system(deal.id, `${user.email} присоединился к сделке по приглашению.`);
  delete invites[m[1]];
  saveInvites();
  send(res, 201, { deal: dealView(deal, user.email) });
});

route('GET', /^\/api\/deals\/([\w-]+)$/, async (req, res, user, m) => {
  const d = engine.ledger.getDeal(m[1]);
  if (!d || !isParticipant(d, user.email)) return send(res, 404, { error: 'Сделка не найдена' });
  send(res, 200, { deal: dealView(d, user.email), journal: journalView(d.id) });
});

route('POST', /^\/api\/deals\/([\w-]+)\/approve$/, async (req, res, user, m) => {
  const d = engine.ledger.getDeal(m[1]);
  if (!d || !isParticipant(d, user.email)) return send(res, 404, { error: 'Сделка не найдена' });
  const role = d.buyer.email === user.email ? 'buyer' : 'seller';
  const updated = await engine.approve(d.id, role);
  chat.system(d.id, role === 'buyer' ? 'Покупатель подтвердил условия сделки' : 'Продавец подтвердил условия сделки');
  if (updated.state === 'AWAITING_DEPOSIT') {
    chat.system(d.id, `Обе стороны согласились. Адрес пополнения: ${updated.depositAddress}. К переводу: $${fromBaseUnits(BigInt(updated.requiredDeposit))} USDT (сумма + 1% комиссии покупателя).`);
  }
  send(res, 200, { deal: dealView(updated, user.email) });
});

// Подтверждение выполнения сделки. Обе стороны должны подтвердить — только тогда
// средства уходят продавцу. (Оставлен путь /release как алиас /confirm.)
async function handleConfirm(req, res, user, m) {
  const d = engine.ledger.getDeal(m[1]);
  if (!d || !isParticipant(d, user.email)) return send(res, 404, { error: 'Сделка не найдена' });
  const party = d.buyer.email === user.email ? 'buyer' : 'seller';
  const r = await engine.confirmCompletion(d.id, party);
  if (r.already) return send(res, 200, { deal: dealView(r.deal, user.email), released: false, already: true });
  const who = party === 'buyer' ? 'Покупатель' : 'Продавец';
  chat.system(d.id, `${who} подтвердил, что сделка выполнена.`);
  const released = r.released !== false;
  if (released) {
    chat.system(d.id, `Обе стороны подтвердили выполнение. Продавцу выплачено $${r.payout} USDT (комиссия $${r.fee}). Сделка завершена.`);
  } else {
    const waitingFor = d.buyer.email === user.email ? 'продавца' : 'покупателя';
    chat.system(d.id, `Ожидается подтверждение от ${waitingFor}. Если вторая сторона не подтвердит до окончания срока — можно открыть спор (арбитраж).`);
  }
  send(res, 200, { deal: dealView(r.deal, user.email), released, payout: r.payout, fee: r.fee });
}
route('POST', /^\/api\/deals\/([\w-]+)\/confirm$/, handleConfirm);
route('POST', /^\/api\/deals\/([\w-]+)\/release$/, handleConfirm); // алиас для совместимости

route('POST', /^\/api\/deals\/([\w-]+)\/dispute$/, async (req, res, user, m) => {
  const { reason } = await readBody(req);
  const r = await arbitration.openCase(m[1], { by: user.email, reason });
  send(res, 200, { deal: dealView(r.deal, user.email), arbiter: r.arbiter });
});

route('POST', /^\/api\/deals\/([\w-]+)\/evidence$/, async (req, res, user, m) => {
  const { text, attachments = [] } = await readBody(req);
  const msg = arbitration.submitEvidence(m[1], { email: user.email, text, attachments });
  send(res, 200, { message: msg });
});

route('POST', /^\/api\/deals\/([\w-]+)\/decide$/, async (req, res, user, m) => {
  if (!user.isArbiter) return send(res, 403, { error: 'Только арбитр платформы может выносить решение' });
  const { sellerBps, rationale } = await readBody(req);
  const r = await arbitration.decide(m[1], { arbiter: user.email, sellerBps: Number(sellerBps), rationale });
  send(res, 200, { deal: dealView(r.deal, user.email), payout: r.payout, fee: r.fee, refunded: r.refunded });
});

// ---- CHAT ----

route('GET', /^\/api\/deals\/([\w-]+)\/chat$/, async (req, res, user, m) => {
  send(res, 200, { messages: chat.history(m[1], user.email) });
});

route('POST', /^\/api\/deals\/([\w-]+)\/chat$/, async (req, res, user, m) => {
  const { text } = await readBody(req);
  const d = engine.ledger.getDeal(m[1]);
  // Сообщение арбитра идёт через его сервис (проверка назначения на дело)
  const msg = user.isArbiter && d?.dispute
    ? arbitration.arbiterMessage(m[1], { arbiter: user.email, text })
    : chat.post(m[1], { email: user.email, text });
  send(res, 200, { message: msg });
});

// ---- DEV: симуляция депозита (в проде это делает deposit-watcher из Tron) ----

route('POST', /^\/api\/dev\/deposit$/, async (req, res, user) => {
  if (!DEV_MODE) return send(res, 403, { error: 'Отключено вне DEV-режима' });
  const { dealId, amount } = await readBody(req);
  const d = engine.ledger.getDeal(dealId);
  if (!d || d.buyer.email !== user.email) return send(res, 403, { error: 'Депозит вносит покупатель' });
  const r = await engine.onDepositConfirmed(dealId, {
    amount: toBaseUnits(String(amount)),
    txid: 'devtx_' + crypto.randomBytes(6).toString('hex'),
    from: 'DEV_SIMULATOR',
  });
  chat.system(dealId, `Депозит подтверждён: +$${amount} USDT (симуляция testnet). Внесено $${fromBaseUnits(r.deposited)} из $${fromBaseUnits(r.required)}.` + (r.funded ? ' Средства заблокированы — сделка FUNDED.' : ''));
  send(res, 200, { deal: dealView(engine.ledger.getDeal(dealId), user.email), funded: r.funded });
});

// ---- STATS ----

route('GET', /^\/api\/stats$/, async (req, res) => {
  const rec = engine.reconcile();
  // GMV = всё, что когда-либо проходило через эскроу (сумма депозитов)
  const gmv = engine.ledger.journal()
    .filter(e => e.type === 'DEPOSIT')
    .reduce((sum, e) => sum + BigInt(e.amount), 0n);
  send(res, 200, {
    totalUsers: Object.keys(users).length,
    totalDeals: rec.deals.length,
    locked: rec.totalLocked,
    fees: rec.totalFees,
    gmv: fromBaseUnits(gmv),
  });
});

// ---- ИИ-ПРОВЕРКА ДОГОВОРА ----
// Ассистент, ищущий слабые места в условиях сделки. Пока это детерминированный
// эвристический анализатор (без внешних зависимостей). Когда появится доступ к
// LLM (Ollama на более мощном сервере или облачный ключ) — сюда подставляется
// реальная генерация, интерфейс ответа менять не нужно.
function analyzeContract({ title = '', amount = '', terms = '', deadlineDays = 0, deadlineHours = 0, feePayer = 'split' }) {
  const risks = [];
  const t = String(terms || '').trim();
  const words = t ? t.split(/\s+/).length : 0;
  const low = t.toLowerCase();
  const amountNum = Number(String(amount).replace(',', '.')) || 0;
  const totalHours = Number(deadlineDays) * 24 + Number(deadlineHours);

  const add = (level, text, fix) => risks.push({ level, text, fix });

  if (!t || words < 8) {
    add('high', 'Условия сделки почти не описаны — при споре арбитру будет не на что опереться.',
      'Опишите, что именно и к какому сроку обязана сделать каждая сторона.');
  }
  if (!/(что счита|критери|прием|принят|подтвержд|выполнен|результат)/.test(low)) {
    add('high', 'Не задан критерий приёмки: непонятно, что считается «сделка выполнена».',
      'Добавьте пункт: «Сделка считается выполненной, когда …».');
  }
  if (!/(срок|до |в течени|дней|часов|числ|дата)/.test(low) && totalHours > 0) {
    add('med', 'В тексте нет явных сроков этапов, хотя общий срок сделки задан.',
      'Пропишите промежуточные сроки (передача, проверка, подтверждение).');
  }
  if (totalHours > 0 && totalHours < 6) {
    add('med', `Очень короткий срок исполнения (${totalHours} ч). Вторая сторона может не успеть подтвердить выполнение.`,
      'Убедитесь, что срока хватит на выполнение и подтверждение обеими сторонами.');
  }
  if (totalHours > 24 * 120) {
    add('low', 'Срок сделки больше 4 месяцев — средства будут долго заблокированы в эскроу.',
      'Рассмотрите разбивку на этапы с частичными выплатами.');
  }
  if (!/(возврат|refund|отмена|штраф|неустой|компенсац)/.test(low)) {
    add('med', 'Не описан сценарий отмены/возврата и штрафов при неисполнении.',
      'Добавьте условия возврата средств и ответственность сторон.');
  }
  if (amountNum >= 10000) {
    add('low', 'Крупная сумма сделки — рекомендуется дополнительная верификация контрагента.',
      'Проверьте репутацию/документы второй стороны до блокировки средств.');
  }
  if (/(предоплат|аванс|заранее|переведите деньги|вне платформ|напрямую)/.test(low)) {
    add('high', 'В условиях есть признаки оплаты вне эскроу — это лишает вас защиты платформы.',
      'Все расчёты должны идти только через блокировку средств на PayMeSafe.');
  }
  if (title.trim().length < 4) {
    add('low', 'Слишком короткое/общее название сделки.',
      'Дайте конкретное название — так проще идентифицировать сделку в спорах.');
  }

  const score = Math.max(5, 100 - risks.reduce((s, r) => s + (r.level === 'high' ? 30 : r.level === 'med' ? 15 : 6), 0));
  const verdict = score >= 80 ? 'Договор в целом защищён, есть мелкие улучшения.'
    : score >= 55 ? 'Есть заметные слабые места — стоит доработать до создания сделки.'
    : 'Высокий риск: договор оставляет вас без защиты по нескольким пунктам.';
  const feeNote = feePayer === 'buyer' ? 'Комиссию 2% полностью платит покупатель — учтите это в цене.'
    : feePayer === 'seller' ? 'Комиссию 2% полностью платит продавец — заложите её в сумму.'
    : 'Комиссия 2% делится пополам (по 1%).';

  return { engine: 'heuristic-v1', score, verdict, feeNote, risks };
}

route('POST', /^\/api\/ai\/review$/, async (req, res, user) => {
  const body = await readBody(req);
  send(res, 200, { review: analyzeContract(body) });
});

// ---- АДМИН-ПАНЕЛЬ ----

const requireAdmin = (res, user) => {
  if (!user || !user.isAdmin) { send(res, 403, { error: 'Доступ только для администратора' }); return false; }
  return true;
};

// Сводка для дашборда админа
route('GET', /^\/api\/admin\/overview$/, async (req, res, user) => {
  if (!requireAdmin(res, user)) return;
  const rec = engine.reconcile();
  const all = engine.ledger.allDeals();
  const disputes = all.filter(d => d.dispute && !d.resolution).length;
  send(res, 200, {
    totalUsers: Object.keys(users).length,
    activatedUsers: Object.values(users).filter(u => isActivated(u)).length,
    totalDeals: all.length,
    openDisputes: disputes,
    pendingInvites: Object.keys(invites).length,
    locked: rec.totalLocked,
    fees: rec.totalFees,
  });
});

// Все пользователи
route('GET', /^\/api\/admin\/users$/, async (req, res, user) => {
  if (!requireAdmin(res, user)) return;
  const list = Object.values(users).map(u => ({
    email: u.email,
    activated: isActivated(u),
    isArbiter: !!u.isArbiter,
    isAdmin: !!u.isAdmin,
    wallets: userWallets(u).length,
    tronAddress: u.tronAddress,
    createdAt: u.createdAt,
  })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  send(res, 200, { users: list });
});

// Все сделки платформы (не только свои)
route('GET', /^\/api\/admin\/deals$/, async (req, res, user) => {
  if (!requireAdmin(res, user)) return;
  const list = engine.ledger.allDeals()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(d => ({
      ...dealView(d, user.email),
      hasDispute: !!d.dispute,
      resolved: !!d.resolution,
    }));
  send(res, 200, { deals: list });
});

// Только споры (арбитраж)
route('GET', /^\/api\/admin\/disputes$/, async (req, res, user) => {
  if (!requireAdmin(res, user)) return;
  const list = engine.ledger.allDeals()
    .filter(d => d.dispute)
    .sort((a, b) => (b.dispute.openedAt || '').localeCompare(a.dispute.openedAt || ''))
    .map(d => ({
      ...dealView(d, user.email),
      resolved: !!d.resolution,
    }));
  send(res, 200, { disputes: list });
});

// Полный просмотр любой сделки (админ входит в арбитраж)
route('GET', /^\/api\/admin\/deals\/([\w-]+)$/, async (req, res, user, m) => {
  if (!requireAdmin(res, user)) return;
  const d = engine.ledger.getDeal(m[1]);
  if (!d) return send(res, 404, { error: 'Сделка не найдена' });
  const messages = chat.messages.get(d.id) || []; // админ читает без проверки участия
  send(res, 200, { deal: dealView(d, user.email), journal: journalView(d.id), chat: messages });
});

// Админ берёт спор на себя → назначается арбитром этого дела и может решать/писать
route('POST', /^\/api\/admin\/deals\/([\w-]+)\/takeover$/, async (req, res, user, m) => {
  if (!requireAdmin(res, user)) return;
  const d = engine.ledger.getDeal(m[1]);
  if (!d) return send(res, 404, { error: 'Сделка не найдена' });
  if (!d.dispute) return send(res, 400, { error: 'По этой сделке нет открытого спора' });
  if (d.resolution) return send(res, 400, { error: 'Спор уже разрешён' });
  const prev = d.dispute.arbiter;
  d.dispute.arbiter = user.email;
  engine.ledger.putDeal(d);
  if (!arbitration.arbiters.includes(user.email)) arbitration.arbiters.push(user.email);
  chat.system(d.id, `Администратор ${user.email} взял спор в работу` + (prev && prev !== user.email ? ` (ранее: ${prev})` : '') + '.', { event: 'admin_takeover', arbiter: user.email });
  send(res, 200, { deal: dealView(d, user.email) });
});

// ─────────────────────────── СЕРВЕР ───────────────────────────

const PUBLIC_ROUTES = [/^\/api\/auth\//, /^\/api\/stats$/, /^\/api\/invite\/[A-Za-z0-9]+$/];

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = req.url.split('?')[0];

  // Статика
  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    const file = path.join(__dirname, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(file));
  }

  for (const r of routes) {
    const m = req.method === r.method && url.match(r.pattern);
    if (!m) continue;
    try {
      let user = null;
      if (!PUBLIC_ROUTES.some(p => p.test(url))) {
        user = auth(req);
        if (!user) return send(res, 401, { error: 'Требуется вход' });
      }
      return await r.handler(req, res, user, m);
    } catch (e) {
      return send(res, 400, { error: e.message });
    }
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║  PayMeSafe — платформа запущена                   ║
║  http://localhost:${PORT}                            ║
║  DEV_MODE: ${DEV_MODE ? 'ON (депозиты симулируются)' : 'OFF'}         ║
║  Арбитр: arbiter@paymesafe.online / arbiter123    ║
╚══════════════════════════════════════════════════╝`);
});

module.exports = server;
