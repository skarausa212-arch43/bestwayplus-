/**
 * STUFFWEKNOW — store server. ZERO DEPENDENCIES (Node 18+).
 *
 * Serves the storefront + policies + admin, and provides:
 *   - accounts (scrypt passwords, HMAC tokens — no external JWT)
 *   - orders with instant HTML receipts (print-to-PDF ready)
 *   - visit counting (total / unique / daily) for the admin dashboard
 *   - admin API guarded by ADMIN_PASSWORD (set via systemd env)
 *
 * Data lives in DATA_DIR (default ./data) as plain JSON — keep it out of
 * the git tree on the server (the repo dir is hard-reset every minute).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8090;
const ROOT = __dirname;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
fs.mkdirSync(DATA, { recursive: true });

/* ---------- persistence ---------- */
const fileOf = (n) => path.join(DATA, n);
const loadJSON = (n, d) => { try { return JSON.parse(fs.readFileSync(fileOf(n), 'utf8')); } catch { return d; } };
const saveJSON = (n, v) => fs.writeFileSync(fileOf(n), JSON.stringify(v, null, 2));

if (!fs.existsSync(fileOf('secret'))) fs.writeFileSync(fileOf('secret'), crypto.randomBytes(32).toString('hex'));
const SECRET = fs.readFileSync(fileOf('secret'), 'utf8');

const users = loadJSON('users.json', {});          // email -> {email,name,pass,created}
const orders = loadJSON('orders.json', []);        // [{id,email,items,total,ship,status,date,address}]
const stats = loadJSON('stats.json', { total: 0, unique: 0, daily: {} }); // daily[YYYY-MM-DD]={v,u,o}
const saveUsers = () => saveJSON('users.json', users);
const saveOrders = () => saveJSON('orders.json', orders);
let statsDirty = false;
setInterval(() => { if (statsDirty) { statsDirty = false; saveJSON('stats.json', stats); } }, 5000).unref();

/* ---------- catalog (source of truth for prices) ---------- */
const CATALOG = {
  ad7: { name: 'FIFA World Cup 26™ Trionda Training Ball', price: 32 },
  ad8: { name: 'FIFA World Cup 26™ Trionda Competition Ball', price: 49 },
  ad9: { name: "Samba OG Shoes", price: 65 },
  ad10: { name: "Utility 3.0 Tote Bag", price: 39 },
  ad11: { name: "Stadium 4 Backpack", price: 42 },
  ad12: { name: "MUST HAVES TOTE BAG SEASONAL", price: 39 },
  ad13: { name: "WASHINGTON HUSKIES BARREDA DECODE SHOES (KJ9087)", price: 62 },
  ad14: { name: "GRAMBLING STATE TIGERS BARREDA DECODE SHOES (KJ6845)", price: 62 },
  ad15: { name: "Adizero Impact Turf Trainer Perfect Game Cleats (KH5298)", price: 62 },
  ad16: { name: "Samba Indoor Soccer Shoes (IH6001)", price: 62 },
  ad17: { name: "Samba Indoor Soccer Shoes (IH6000)", price: 62 },
  ad18: { name: "Rod Laver Shoes (LA6393)", price: 59 },
  ad19: { name: "Rod Laver Shoes (LA4181)", price: 59 },
  ad20: { name: "SPIRITAIN 2000 Shoes (LA1812)", price: 59 },
  ad21: { name: "BUSENITZ INDOOR SUPER Shoes (KZ8894)", price: 59 },
  ad22: { name: "ALOHA SUPER Shoes (KJ0280)", price: 59 },
  ad23: { name: "SPIRITAIN 2000 Shoes (KI8141)", price: 59 },
  ad24: { name: "SPIRITAIN 2000 SHOES (KI8104)", price: 59 },
  ad25: { name: "SPIRITAIN 2000 Shoes (KI6823)", price: 59 },
  ad26: { name: "SPIRITAIN 2000 Shoes (KI6822)", price: 59 },
  ad27: { name: "SPIRITAIN 2000 Shoes (KI6821)", price: 59 },
  ad28: { name: "SPIRITAIN 2000 Shoes (KI4445)", price: 59 },
  ad29: { name: "SPIRITAIN 2000 Shoes (KI4441)", price: 59 },
  ad30: { name: "SPIRITAIN 2000 Shoes (KI4440)", price: 59 },
  ad31: { name: "SPIRITAIN 2000 Shoes (KI4383)", price: 59 },
  ad32: { name: "SPIRITAIN 2000 Shoes (KI4382)", price: 59 },
  ad33: { name: "TREFOIL RHINESTONE BAG (KS9294)", price: 59 },
  ad34: { name: "FIFA World Cup 26в„ў Trionda Competition Ball (JD8031)", price: 42 },
  ad35: { name: "OG AIRLINER Bag (KS4139)", price: 46 },
  ad36: { name: "OG AIRLINER Bag (KS4140)", price: 46 },
  ad37: { name: "Collegiate Vista Backpack (KM1706)", price: 55 },
  ad38: { name: "USA 250th Anniversary Competition Ball (KR9647)", price: 49 },
  ad39: { name: "OG Sport Tote (KM3072)", price: 55 },
  ad40: { name: "BOWLING BAG STUDS (KS9292)", price: 40 },
  ad41: { name: "OG Sport Tote (KM3071)", price: 55 },
  ad42: { name: "Y-3 TRUCKER CAP (KT0565)", price: 59 },
  ad43: { name: "Skateboarding Backpack (KS6814)", price: 49 },
  ad44: { name: "Bob Marley Bag (KD8452)", price: 49 },
  ad45: { name: "Y-3 Classic Logo Belt (KA2308)", price: 52 },
  ad46: { name: "MUST HAVES BACKPACK SEASONAL (KH4485)", price: 39 },
  ad47: { name: "Y-3 TRUCKER CAP (KW9701)", price: 59 },
  ad48: { name: "Collegiate Vista Backpack (KL3568)", price: 55 },
  ad49: { name: "Y-3 LOGO CAP (KW9698)", price: 59 },
  ad50: { name: "HOLDALL MONOGRAM Bag (KR9220)", price: 59 },
  ad51: { name: "Backpack MULTIGAME TON BL 2026 (KL2647)", price: 59 },
  ad52: { name: "Predator Match Fingersave Goalkeeper Glove (KE9702)", price: 42 },
  ad53: { name: "SPIRITAIN 2000 Shoes (KI4378)", price: 59 },
  ad54: { name: "SPIRITAIN 2000 SHOES (KI3020)", price: 59 },
  ad55: { name: "SPIRITAIN 2000 SHOES (KI3019)", price: 59 },
  ad56: { name: "DAME X Shoes (KI1625)", price: 59 },
  ad57: { name: "Ultradream DNA Shoes (JS0321)", price: 59 },
  ad58: { name: "Howzat Spikeless Cricket Shoes (JQ8547)", price: 59 },
  ad59: { name: "Terrex Winter Slip-On Cold.Rdy Boots (ID2890)", price: 59 },
  ad60: { name: "Rod Laver Shoes (G99864)", price: 59 },
  ad61: { name: "Rod Laver Shoes (G99863)", price: 59 },
  ad62: { name: "TYSHAWN Shoes (KJ5406)", price: 55 },
  ad63: { name: "Terrex Anylander Rain.Rdy Hiking Shoes (KJ0863)", price: 55 },
  ad64: { name: "Busenitz Shoes (KJ0259)", price: 55 },
  ad65: { name: "TYSHAWN Shoes (KJ0194)", price: 55 },
  ad66: { name: "BUSENITZ VINTAGE Shoes (KI7714)", price: 55 },
  ad67: { name: "Busenitz Shoes (KI7713)", price: 55 },
  ad68: { name: "Glenburn x Argentina x Thrasher Shoes (KH7384)", price: 55 },
  ad69: { name: "Terrex Anylander Rain.Rdy Hiking Shoes (JR9087)", price: 55 },
  ad70: { name: "Adizero DGT Turf Trainer (JP8823)", price: 55 },
  ad71: { name: "Busenitz Pro Shoes (G48060)", price: 55 },
  ad72: { name: "ADIDAS ADIPURE SHIFT RUNNING SHOES (KJ9402)", price: 52 },
  ad73: { name: "Penn State Nitanny Lions Collegiate Vista Backpack (KM1707)", price: 55 },
  ad74: { name: "Collegiate Vista Backpack (KL3567)", price: 55 },
  ad75: { name: "Collegiate Vista Backpack (KL3566)", price: 55 },
  ad76: { name: "Collegiate Vista Backpack (KL3570)", price: 55 },
  ad77: { name: "Collegiate Vista Backpack (KL3165)", price: 55 },
  ad78: { name: "ELONGATED BOWLING BAG (KS4130)", price: 40 },
  ad79: { name: "BACKPACK (KS4133)", price: 52 },
  ad80: { name: "Y-3 LOGO CAP (KT0567)", price: 59 },
  ad81: { name: "ELONGATED BOWLING BAG (KS4131)", price: 40 },
  ad82: { name: "EVERYDAY ICONS CROSSBODY BAG HALF MOON (KR9050)", price: 40 },
  ad83: { name: "Quilted All Me 3 Tote (JL4446)", price: 39 },
  ad84: { name: "Y-3 Dad Cap (KW9674)", price: 59 },
  ad85: { name: "Mercedes - AMG Petronas Formula 1 Team Blue Wonder Tote Bag (KW1994)", price: 39 },
  ad86: { name: "EVERYDAY ICONS CROSSBODY BAG HALF MOON (KR9049)", price: 40 },
  ad87: { name: "Collegiate Vista Backpack (KL3565)", price: 55 },
  ad88: { name: "Y-3 BUCKET HAT (KW9691)", price: 59 },
  ad89: { name: "Backpack MULTIGAME BL/RD 2026 (KL2646)", price: 59 },
  ad90: { name: "Y-3 Bucket Hat (IX7000)", price: 59 },
  ad91: { name: "Collegiate Vista Backpack (KL3164)", price: 55 },
  ad92: { name: "Collegiate Vista Backpack (KL3569)", price: 55 },
};
const FREE_SHIP_AT = 150, SHIP_COST = 9;

/* ---------- crypto payment config ---------- */
const WALLET = (process.env.STORE_WALLET || '0xf2541E779Ee9aCe8f0B36D42cB1DdBcA8bBDFFAE');
const USDC_CONTRACT = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC on Ethereum mainnet
const USDC_DECIMALS = 6;
const ETHERSCAN_KEY = process.env.ETHERSCAN_API_KEY || '';
const CONFIRMATIONS = Number(process.env.PAY_CONFIRMATIONS || 2);
// transactions already credited (survives restart via order.paidTx)
const usedTx = new Set();

// give each pending order a unique amount (base + random cents) so an
// incoming transfer can be matched to exactly one order.
function assignUniqueAmount(base) {
  const used = new Set(orders.filter(o => o.status === 'pending').map(o => o.payAmount));
  for (let i = 0; i < 200; i++) {
    const cents = Math.floor(Math.random() * 100);
    const amt = Math.round(base * 100 + cents) / 100;
    if (!used.has(amt)) return amt;
  }
  return base + 0.01;
}

/* ---------- crypto helpers ---------- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex');
}
function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return test.length === ref.length && crypto.timingSafeEqual(test, ref);
}
const sign = (s) => crypto.createHmac('sha256', SECRET).update(s).digest('hex');
function makeToken(email) {
  const exp = Date.now() + 30 * 864e5;
  const payload = `${email}|${exp}`;
  return Buffer.from(`${payload}|${sign(payload)}`).toString('base64url');
}
function tokenUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  try {
    const [email, exp, sig] = Buffer.from(m[1], 'base64url').toString().split('|');
    if (sign(`${email}|${exp}`) !== sig || Number(exp) < Date.now()) return null;
    return users[email] || null;
  } catch { return null; }
}

/* ---------- tiny http helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function send(res, code, obj, headers = {}) {
  const body = typeof obj === 'string' ? obj : JSON.stringify(obj);
  const type = typeof obj === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8';
  res.writeHead(code, { 'Content-Type': type, ...headers });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 1e6) { reject(new Error('too big')); req.destroy(); } });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
  });
}
function serveFile(res, file, type) {
  fs.readFile(path.join(ROOT, file), (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache, must-revalidate' });
    res.end(buf);
  });
}

/* ---------- visit counting ---------- */
const today = () => new Date().toISOString().slice(0, 10);
function countVisit(req, res) {
  const day = today();
  stats.daily[day] = stats.daily[day] || { v: 0, u: 0, o: 0 };
  stats.total++; stats.daily[day].v++;
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')));
  if (!cookies.swk_sid) {
    stats.unique++; stats.daily[day].u++;
    res.setHeader('Set-Cookie', `swk_sid=${crypto.randomUUID()}; Path=/; Max-Age=31536000; SameSite=Lax`);
  }
  statsDirty = true;
}

/* ---------- live presence (in-memory heartbeats) ---------- */
const online = new Map(); // sid -> lastSeen ms
function touchOnline(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')));
  const sid = cookies.swk_sid || ('ip:' + (req.socket.remoteAddress || '') + '|' + (req.headers['user-agent'] || '').slice(0, 24));
  online.set(sid, Date.now());
}
function onlineCount() {
  const now = Date.now(), active = now - 45000, stale = now - 70000;
  let n = 0;
  for (const [k, t] of online) { if (t < stale) online.delete(k); else if (t >= active) n++; }
  return n;
}

/* ---------- receipt ---------- */
function receiptHTML(o) {
  const rows = o.items.map(it =>
    `<tr><td>${esc(it.name)}<span class="m"> · size ${esc(it.size)}</span></td>
     <td class="c">${it.qty}</td><td class="r">$${it.price}</td><td class="r">$${it.price * it.qty}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(o.id)} — STUFFWEKNOW</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Inter,Arial,sans-serif;background:#f4f4f5;color:#111;padding:40px 16px}
  .sheet{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden}
  .head{background:#050505;color:#f4f4f4;padding:26px 30px;display:flex;justify-content:space-between;align-items:center}
  .head .brand{font-weight:800;font-size:18px;letter-spacing:-.02em}
  .head .brand i{font-style:normal;color:#e7ff3a}
  .head .no{font-size:12px;color:#a0a0ab;text-align:right}
  .head .no b{display:block;color:#fff;font-size:14px;letter-spacing:.06em}
  .body{padding:30px}
  .meta{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px;font-size:13px;color:#52525b}
  .meta b{display:block;color:#111;font-weight:600;margin-bottom:3px;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:#71717a;text-align:left;padding:0 0 10px}
  td{padding:11px 0;border-top:1px solid #f0f0f2}
  .m{color:#a1a1aa;font-size:12px}
  .c{text-align:center}.r{text-align:right}
  tfoot td{border-top:1px solid #d4d4d8;font-weight:600}
  tfoot tr.total td{font-size:17px;font-weight:800;border-top:2px solid #111;padding-top:14px}
  .paid{display:inline-block;margin-top:22px;padding:7px 14px;border:2px solid #16a34a;color:#16a34a;
    border-radius:8px;font-weight:800;font-size:12px;letter-spacing:.14em;transform:rotate(-3deg)}
  .foot{padding:20px 30px 26px;border-top:1px dashed #d4d4d8;font-size:12px;color:#71717a;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
  .print{position:fixed;right:22px;bottom:22px;background:#111;color:#fff;border:0;border-radius:12px;
    padding:14px 22px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 12px 30px -10px rgba(0,0,0,.5)}
  @media print{.print{display:none}body{background:#fff;padding:0}.sheet{border:none;border-radius:0}}
</style></head><body>
<div class="sheet">
  <div class="head">
    <div class="brand">STUFFWEKNOW<i>▲</i></div>
    <div class="no">RECEIPT<b>${esc(o.id)}</b></div>
  </div>
  <div class="body">
    <div class="meta">
      <div><b>Billed to</b>${esc(o.name)}<br>${esc(o.email)}</div>
      <div><b>Ship to</b>${esc(o.address)}<br>${esc(o.city)}, ${esc(o.zip)}</div>
      <div><b>Date</b>${new Date(o.date).toUTCString().slice(0, 16)}<br><b style="margin-top:8px">Payment</b>${esc(o.payment)}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th class="c">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3">Subtotal</td><td class="r">$${o.subtotal}</td></tr>
        <tr><td colspan="3">Shipping</td><td class="r">${o.ship ? '$' + o.ship : 'Free'}</td></tr>
        <tr class="total"><td colspan="3">Total</td><td class="r">$${o.total}</td></tr>
      </tfoot>
    </table>
    <span class="paid">CONFIRMED</span>
  </div>
  <div class="foot"><span>stuffweknow.com — wear what you know</span><span>Questions? Reply to your confirmation or see /policies</span></div>
</div>
<button class="print" onclick="print()">Print / Save PDF</button>
</body></html>`;
}

/* ---------- admin guard ---------- */
const isAdmin = (req) => ADMIN_PASSWORD && req.headers['x-admin-key'] === ADMIN_PASSWORD;

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    /* ----- pages ----- */
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) { countVisit(req, res); return serveFile(res, 'index.html', 'text/html; charset=utf-8'); }
    if (req.method === 'GET' && p === '/policies') return serveFile(res, 'policies.html', 'text/html; charset=utf-8');
    if (req.method === 'GET' && p === '/admin') return serveFile(res, 'admin.html', 'text/html; charset=utf-8');
    if (req.method === 'GET' && /^\/receipt\/SWK-[A-Z0-9-]+$/.test(p)) {
      const o = orders.find(x => x.id === p.split('/')[2]);
      return o ? send(res, 200, receiptHTML(o)) : send(res, 404, 'Receipt not found');
    }

    /* ----- auth ----- */
    if (req.method === 'POST' && p === '/api/register') {
      const { email, password, name } = await readBody(req);
      const em = String(email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return send(res, 400, { error: 'Enter a valid email.' });
      if (!password || password.length < 8) return send(res, 400, { error: 'Password must be 8+ characters.' });
      if (users[em]) return send(res, 409, { error: 'This email is already registered — sign in instead.' });
      users[em] = { email: em, name: String(name || '').slice(0, 60), pass: hashPassword(password), created: Date.now() };
      saveUsers();
      return send(res, 201, { token: makeToken(em), email: em, name: users[em].name });
    }
    if (req.method === 'POST' && p === '/api/login') {
      const { email, password } = await readBody(req);
      const em = String(email || '').trim().toLowerCase();
      const u = users[em];
      if (!u || !verifyPassword(String(password || ''), u.pass)) return send(res, 401, { error: 'Wrong email or password.' });
      return send(res, 200, { token: makeToken(em), email: em, name: u.name });
    }
    if (req.method === 'GET' && p === '/api/me') {
      const u = tokenUser(req);
      if (!u) return send(res, 401, { error: 'unauthorized' });
      return send(res, 200, { email: u.email, name: u.name });
    }
    if (req.method === 'GET' && p === '/api/my-orders') {
      const u = tokenUser(req);
      if (!u) return send(res, 401, { error: 'unauthorized' });
      const mine = orders.filter(o => o.email === u.email).map(o => ({
        id: o.id, date: o.date, total: o.total, payAmount: o.payAmount, status: o.status,
        carrier: o.carrier || '', tracking: o.tracking || '', paidTx: o.paidTx || null,
        items: o.items.map(i => ({ name: i.name, qty: i.qty, size: i.size })),
      }));
      return send(res, 200, { orders: mine.reverse() });
    }

    /* ----- live online counter ----- */
    if (req.method === 'GET' && p === '/api/online') {
      touchOnline(req);
      return send(res, 200, { online: Math.max(1, onlineCount()) });
    }

    /* ----- public order status (payment polling) ----- */
    if (req.method === 'GET' && /^\/api\/order-status\/SWK-[A-Z0-9-]+$/.test(p)) {
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o) return send(res, 404, { error: 'not found' });
      return send(res, 200, {
        status: o.status,
        paid: ['paid', 'processing', 'shipped', 'delivered'].includes(o.status),
        tx: o.paidTx || null,
      });
    }

    /* ----- orders ----- */
    if (req.method === 'POST' && p === '/api/order') {
      const b = await readBody(req);
      const u = tokenUser(req);
      const email = (u ? u.email : String(b.email || '').trim().toLowerCase());
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
      if (!Array.isArray(b.items) || !b.items.length) return send(res, 400, { error: 'Cart is empty.' });
      if (b.items.length > 50) return send(res, 400, { error: 'Too many items.' });
      const items = [];
      for (const it of b.items) {
        const c = CATALOG[it.id];
        const qty = Math.min(20, Math.max(1, parseInt(it.qty, 10) || 1));
        if (!c) return send(res, 400, { error: 'Unknown item in cart.' });
        items.push({ id: it.id, name: c.name, price: c.price, size: String(it.size || '-').slice(0, 12), qty });
      }
      const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
      const ship = subtotal >= FREE_SHIP_AT ? 0 : SHIP_COST;
      const id = 'SWK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const total = subtotal + ship;
      const order = {
        id, email, name: String(b.name || '').slice(0, 80), address: String(b.address || '').slice(0, 160),
        city: String(b.city || '').slice(0, 60), zip: String(b.zip || '').slice(0, 20),
        payment: 'USDC (ERC-20)',
        items, subtotal, ship, total,
        payAmount: assignUniqueAmount(total),   // exact USDC to send (unique cents)
        status: 'pending', paidTx: null, paidAt: null,
        carrier: '', tracking: '', date: Date.now(),
      };
      orders.push(order); saveOrders();
      const day = today();
      stats.daily[day] = stats.daily[day] || { v: 0, u: 0, o: 0 };
      stats.daily[day].o++; statsDirty = true;
      return send(res, 201, { orderId: id, receiptUrl: `/receipt/${id}`, total, payAmount: order.payAmount, wallet: WALLET });
    }

    /* ----- admin ----- */
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET' && p === '/api/admin/overview') {
        const days = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
          days.push({ d, ...(stats.daily[d] || { v: 0, u: 0, o: 0 }) });
        }
        return send(res, 200, {
          visits: { total: stats.total, unique: stats.unique, today: (stats.daily[today()] || {}).v || 0 },
          revenue: orders.reduce((s, o) => s + (o.status !== 'cancelled' ? o.total : 0), 0),
          ordersCount: orders.length,
          usersCount: Object.keys(users).length,
          days,
          orders: orders.slice(-100).reverse(),
          users: Object.values(users).map(u => ({ email: u.email, name: u.name, created: u.created,
            orders: orders.filter(o => o.email === u.email).length })).reverse(),
        });
      }
      if (req.method === 'POST' && p === '/api/admin/order-status') {
        const { id, status, carrier, tracking } = await readBody(req);
        const o = orders.find(x => x.id === id);
        if (!o || !['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'].includes(status)) return send(res, 400, { error: 'bad request' });
        o.status = status;
        if (carrier !== undefined) o.carrier = String(carrier).slice(0, 60);
        if (tracking !== undefined) o.tracking = String(tracking).slice(0, 80);
        saveOrders();
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'not found' });
    }

    return send(res, 404, 'Not found');
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server error' });
  }
});

/* ---------- on-chain payment watcher (USDC ERC-20) ---------- */
// remember already-credited transactions so a tx is never counted twice
orders.forEach(o => { if (o.paidTx) usedTx.add(o.paidTx.toLowerCase()); });

async function pollPayments() {
  if (!ETHERSCAN_KEY) return;
  const pending = orders.filter(o => o.status === 'pending');
  if (!pending.length) return;
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx`
      + `&contractaddress=${USDC_CONTRACT}&address=${WALLET}`
      + `&page=1&offset=100&sort=desc&apikey=${ETHERSCAN_KEY}`;
    const res = await fetch(url);
    const j = await res.json();
    if (j.status !== '1' || !Array.isArray(j.result)) return;
    let changed = false;
    for (const tx of j.result) {
      if (!tx.to || tx.to.toLowerCase() !== WALLET.toLowerCase()) continue;      // incoming only
      if (Number(tx.confirmations) < CONFIRMATIONS) continue;                     // wait for confirmations
      if (usedTx.has(tx.hash.toLowerCase())) continue;                            // already credited
      const amt = Number(tx.value) / 10 ** USDC_DECIMALS;
      const ts = Number(tx.timeStamp) * 1000;
      const match = pending.find(o =>
        o.status === 'pending' &&
        Math.abs(o.payAmount - amt) < 0.005 &&                                    // exact fingerprint match
        ts >= o.date - 15 * 60 * 1000);                                           // paid after order placed
      if (match) {
        match.status = 'paid'; match.paidTx = tx.hash; match.paidAt = ts;
        usedTx.add(tx.hash.toLowerCase()); changed = true;
        console.log(`[swk-store] order ${match.id} PAID (${amt} USDC) tx ${tx.hash}`);
      }
    }
    if (changed) saveOrders();
  } catch (e) {
    console.error('[swk-store] payment poll error:', e.message);
  }
}
if (ETHERSCAN_KEY) setInterval(pollPayments, 30000).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[swk-store] listening on 127.0.0.1:${PORT}`);
  console.log(`[swk-store] data dir: ${DATA}`);
  console.log(`[swk-store] admin ${ADMIN_PASSWORD ? 'ENABLED' : 'DISABLED (set ADMIN_PASSWORD)'}`);
  console.log(`[swk-store] wallet: ${WALLET}`);
  console.log(`[swk-store] payment auto-check ${ETHERSCAN_KEY ? 'ENABLED (USDC ERC-20)' : 'DISABLED (set ETHERSCAN_API_KEY) — manual confirmation'}`);
});
