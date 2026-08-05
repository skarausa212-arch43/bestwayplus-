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

const users = loadJSON('users.json', {});          // email -> {email,name,pass,created,payout}
const orders = loadJSON('orders.json', []);        // [{id,email,items,total,ship,status,date,address}]
const listings = loadJSON('listings.json', []);    // [{id,seller,title,brand,category,price,size,condition,cover,photos,desc,status,createdAt}]
const offers = loadJSON('offers.json', []);        // [{id,listingId,buyer,amount,status,createdAt}]
const reviews = loadJSON('reviews.json', []);      // [{id,orderId,from,to,role,rating,text,createdAt}]
const messages = loadJSON('messages.json', []);    // [{id,orderId,from,text,at}]
const reports = loadJSON('reports.json', []);      // [{id,listingId,from,reason,at,status}]
const stats = loadJSON('stats.json', { total: 0, unique: 0, daily: {} }); // daily[YYYY-MM-DD]={v,u,o}
const saveUsers = () => saveJSON('users.json', users);
const saveOrders = () => saveJSON('orders.json', orders);
const saveListings = () => saveJSON('listings.json', listings);
const saveOffers = () => saveJSON('offers.json', offers);
const saveReviews = () => saveJSON('reviews.json', reviews);
const saveMessages = () => saveJSON('messages.json', messages);
const saveReports = () => saveJSON('reports.json', reports);
/* one-time recovery: publish any listings left in 'pending' from the moderation window */
(() => { let changed = false; for (const l of listings) if (l.status === 'pending') { l.status = 'active'; changed = true; } if (changed) saveJSON('listings.json', listings); })();
const AUTO_RELEASE_DAYS = Number(process.env.AUTO_RELEASE_DAYS || 7); // buyer-protection window after shipping
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
  ad93: { name: "ADIDAS ADIPURE SHIFT RUNNING SHOES (KJ9400)", price: 52 },
  ad94: { name: "NORA Shoes (KJ0200)", price: 52 },
  ad95: { name: "NORA Shoes (KI7701)", price: 52 },
  ad96: { name: "NORA Shoes (KI7700)", price: 52 },
  ad97: { name: "NORA Shoes (KI7699)", price: 52 },
  ad98: { name: "TECHNOCHAOS 2000 SHOES (KI7030)", price: 52 },
  ad99: { name: "TECHNOCHAOS 2000 SHOES (KI7029)", price: 52 },
  ad100: { name: "VL Court 3.0 Shoes (IH4039)", price: 52 },
  ad101: { name: "NORA Shoes (HQ7537)", price: 52 },
  ad102: { name: "VL Court 3.0 Shoes (HQ0175)", price: 52 },
  ad103: { name: "GLENBURN Shoes (KJ5049)", price: 49 },
  ad104: { name: "GLENBURN Shoes (KJ5046)", price: 49 },
  ad105: { name: "GLENBURN Shoes (KJ5045)", price: 49 },
  ad106: { name: "GLENBURN Shoes (KJ5042)", price: 49 },
  ad107: { name: "GLENBURN Shoes (KJ5041)", price: 49 },
  ad108: { name: "STREETTALK SHOES (KJ4834)", price: 49 },
  ad109: { name: "Terrex Anylander Hiking Shoes (KJ0865)", price: 49 },
  ad110: { name: "Terrex Anylander Hiking Shoes (KJ0864)", price: 49 },
  ad111: { name: "BUSENITZ VULC II Shoes (KJ0252)", price: 49 },
  ad112: { name: "BUSENITZ VULC II Shoes (KJ0249)", price: 49 },
  ad113: { name: "Collegiate Vista Backpack (KL3167)", price: 55 },
  ad114: { name: "Y-3 X-Body Pouch (JZ8062)", price: 59 },
  ad115: { name: "Y-3 LOGO CAP (KW9699)", price: 59 },
  ad116: { name: "Y-3 DAD CAP (KW9675)", price: 59 },
  ad117: { name: "MATCH  Black/Orange 2026 (KL2632)", price: 56 },
  ad118: { name: "Y-3 Dad Cap (IN2391)", price: 59 },
  ad119: { name: "DRIVE Blue 2026 (KL2629)", price: 59 },
  ad120: { name: "MATCH Black/Green 2026 (KL2633)", price: 56 },
  ad121: { name: "Y-3 GRAPHIC DAD CAP (KD0179)", price: 59 },
  ad122: { name: "Y-3 Bucket Hat (KR2791)", price: 59 },
  ad123: { name: "Y-3 RUN CAP (KR7553)", price: 59 },
  ad124: { name: "Y-3 RACE CAP (KE0075)", price: 59 },
  ad125: { name: "MLS 24 Competition NFHS Ball (IP1629)", price: 39 },
  ad126: { name: "Y-3 Classic Logo Cap (JP1142)", price: 59 },
  ad127: { name: "Y-3 Classic Knitted Beanie (KC0446)", price: 59 },
  ad128: { name: "Y-3 GRAPHIC BEANIE (KT3209)", price: 59 },
  ad129: { name: "Y-3 MERCEDES-AMG PETRONAS FORMULA 1 TEAM BUCKET HAT (KR4911)", price: 59 },
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
    req.on('data', (c) => { b += c; if (b.length > 9e6) { reject(new Error('too big')); req.destroy(); } });
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

/* ---------- marketplace helpers ---------- */
const CAT_GROUPS = {
  shoes: ['sneakers','boots','sandals','formal-shoes','heels','flats','loafers','slippers'],
  clothing: ['tshirts','hoodies','shirts','jackets','coats','knitwear','pants','jeans','shorts','tracksuits','dresses','skirts','activewear','suits','underwear','swimwear','socks'],
  bags: ['backpacks','handbags','totes','duffels','crossbody','wallets','luggage','purses'],
  accessories: ['caps','hats','watches','jewelry','sunglasses','belts','scarves','gloves','ties'],
  electronics: ['phones','laptops','tablets','audio','headphones','gaming','cameras','wearables','tech-accessories','tv','smart-home'],
  home: ['furniture','home-decor','kitchen','bedding','lighting','tools','garden','storage'],
  beauty: ['makeup','skincare','fragrance','haircare','nails','grooming'],
  kids: ['kids-clothing','kids-shoes','toys','baby-gear','baby-clothing'],
  hobbies: ['books','music','movies','collectibles','art','sports-gear','musical-instruments','crafts'],
  sport: ['balls','equipment','fitness','cycling','outdoor'],
  other: ['electronics-other','vintage','pet','other'],
};
const CATEGORIES = Object.values(CAT_GROUPS).flat();
const CAT_OF_GROUP = {}; for (const g in CAT_GROUPS) for (const c of CAT_GROUPS[g]) CAT_OF_GROUP[c] = g;
const CONDITIONS = ['New', 'Like new', 'Very good', 'Good', 'Fair'];
const REGIONS = ['North America', 'South America', 'Europe', 'Asia', 'Africa', 'Oceania'];
const RETURNS = ['No returns', '14-day returns', '30-day returns'];
const MAX_ADDRESSES = 3;
function profileView(u) {
  return {
    email: u.email, name: u.name || '', telegram: u.telegram || '', avatar: u.avatar || '',
    addresses: Array.isArray(u.addresses) ? u.addresses : [], payout: u.payout || '', verified: !!u.verified,
  };
}
function catGroup(c) { return CAT_OF_GROUP[c] || 'other'; }
function sellerStats(email) {
  const rs = reviews.filter(r => r.to === email && r.role === 'seller');
  const rating = rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : 0;
  const sold = orders.filter(o => o.seller === email && ['released', 'delivered'].includes(o.status)).length;
  return { rating, reviews: rs.length, sold, verified: !!(users[email] && users[email].verified) };
}
function sellerHandle(email) { const u = users[email]; return (u && u.name) || (email ? email.split('@')[0] : 'seller'); }
function listingCard(l) { // light — no full photos
  const st = sellerStats(l.seller);
  return {
    id: l.id, title: l.title, brand: l.brand, category: l.category, group: catGroup(l.category), price: l.price, old: l.old || 0,
    size: l.size || '', condition: l.condition || '', cover: l.cover || (l.photos && l.photos[0]) || '',
    ships: l.ships || [], returns: l.returns || 'No returns', boosted: (l.boostedUntil || 0) > Date.now(),
    status: l.status, createdAt: l.createdAt,
    seller: { handle: sellerHandle(l.seller), email: l.seller, rating: st.rating, reviews: st.reviews, sold: st.sold, verified: st.verified },
  };
}
function listingFull(l) {
  const c = listingCard(l);
  const su = users[l.seller] || {};
  return { ...c, seller: { ...c.seller, avatar: su.avatar || '', telegram: su.telegram || '' }, photos: l.photos || (l.cover ? [l.cover] : []), desc: l.desc || '' };
}
// funds owed to a seller that have been released but not yet paid out by the operator
function payoutBalance(email) {
  return Math.round(orders.filter(o => o.seller === email && o.status === 'released' && !o.paidOut)
    .reduce((s, o) => s + (o.total - (o.fee || 0)), 0) * 100) / 100;
}
const MARKET_FEE_PCT = Number(process.env.MARKET_FEE_PCT || 10); // buyer-side platform fee % (added on top; kept by the operator)
const MAX_OFFERS_PER_DAY = Number(process.env.MAX_OFFERS_PER_DAY || 30);
const BOOST_PRICE_PER_DAY = Number(process.env.BOOST_PRICE_PER_DAY || 2); // USDC/day to feature a listing
function releaseOrder(o) {
  if (o.status !== 'shipped' && o.status !== 'delivered' && o.status !== 'disputed') return false;
  o.status = 'released'; o.releasedAt = Date.now();
  const l = listings.find(x => x.id === o.listingId);
  if (l && l.status !== 'sold') { l.status = 'sold'; saveListings(); }
  return true;
}
function orderView(o) {
  return {
    id: o.id, date: o.date, total: o.total, fee: o.fee || 0, payAmount: o.payAmount, status: o.status, escrow: !!o.escrow,
    carrier: o.carrier || '', tracking: o.tracking || '', paidTx: o.paidTx || null, paidOut: !!o.paidOut,
    listingId: o.listingId || null, cover: (listings.find(x => x.id === o.listingId) || {}).cover || (o.items && o.items[0] && '') || '',
    buyerHandle: sellerHandle(o.email), sellerEmail: o.seller || null, sellerHandle: o.seller ? sellerHandle(o.seller) : 'STUFFWEKNOW',
    disputeReason: o.disputeReason || '', shippedAt: o.shippedAt || 0,
    name: o.name || '', address: o.address || '', city: o.city || '', zip: o.zip || '',
    items: (o.items || []).map(i => ({ name: i.name, qty: i.qty, size: i.size, price: i.price })),
  };
}
function offerView(o) {
  const l = listings.find(x => x.id === o.listingId);
  return {
    id: o.id, listingId: o.listingId, amount: o.amount, counter: o.counter || 0, status: o.status, createdAt: o.createdAt,
    title: l ? l.title : '(removed)', cover: l ? (l.cover || '') : '', price: l ? l.price : 0,
    buyerHandle: sellerHandle(o.buyer), buyer: o.buyer,
  };
}

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
      return send(res, 200, profileView(u));
    }
    /* ----- update profile (name / telegram / avatar) ----- */
    if (req.method === 'POST' && p === '/api/profile') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const me = users[u.email];
      if (b.name !== undefined) me.name = String(b.name).slice(0, 60);
      if (b.telegram !== undefined) {
        const tg = String(b.telegram).trim().replace(/^@/, '').slice(0, 32);
        if (tg && !/^[a-zA-Z0-9_]{3,32}$/.test(tg)) return send(res, 400, { error: 'Telegram username must be 3–32 letters, digits or underscores.' });
        me.telegram = tg;
      }
      if (b.avatar !== undefined) {
        const a = String(b.avatar || '');
        if (a === '') me.avatar = '';
        else {
          if (!a.startsWith('data:image/')) return send(res, 400, { error: 'Avatar must be an image.' });
          if (a.length > 900000) return send(res, 400, { error: 'Avatar is too large — keep it under ~600KB.' });
          me.avatar = a;
        }
      }
      saveUsers();
      return send(res, 200, { ok: true, profile: profileView(me) });
    }
    /* ----- save home addresses (up to 3) ----- */
    if (req.method === 'POST' && p === '/api/addresses') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const arr = Array.isArray(b.addresses) ? b.addresses.slice(0, MAX_ADDRESSES) : [];
      const clean = arr.map(a => ({
        label: String(a.label || '').slice(0, 30),
        name: String(a.name || '').slice(0, 60),
        region: REGIONS.includes(a.region) ? a.region : REGIONS[0],
        line: String(a.line || a.address || '').slice(0, 140),
        city: String(a.city || '').slice(0, 60),
        zip: String(a.zip || '').slice(0, 20),
      })).filter(a => a.line.trim());
      users[u.email].addresses = clean; saveUsers();
      return send(res, 200, { ok: true, addresses: clean });
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

    /* ----- recently completed trades (public, escrow-settled) ----- */
    if (req.method === 'GET' && p === '/api/recent-trades') {
      const done = orders.filter(o => o.escrow && ['released', 'delivered'].includes(o.status))
        .sort((a, b) => (b.date || 0) - (a.date || 0)).slice(0, 8)
        .map(o => { const it = (o.items && o.items[0]) || {}; return { title: it.name || 'Item', price: o.total || 0, seller: sellerHandle(o.seller), buyer: sellerHandle(o.email), at: o.date || 0 }; });
      return send(res, 200, { trades: done });
    }

    /* ----- public order status (payment polling) ----- */
    if (req.method === 'GET' && /^\/api\/order-status\/SWK-[A-Z0-9-]+$/.test(p)) {
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o) return send(res, 404, { error: 'not found' });
      return send(res, 200, {
        status: o.status,
        paid: ['paid', 'held', 'processing', 'shipped', 'delivered', 'released'].includes(o.status),
        escrow: !!o.escrow,
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

    /* ================= MARKETPLACE ================= */
    /* --- browse listings (public, light) --- */
    if (req.method === 'GET' && p === '/api/listings') {
      let out = listings.filter(l => l.status === 'active');
      const cat = url.searchParams.get('category');
      const q = (url.searchParams.get('q') || '').toLowerCase().trim();
      const seller = url.searchParams.get('seller');
      if (cat && cat !== 'all') out = out.filter(l => l.category === cat || catGroup(l.category) === cat);
      if (seller) out = out.filter(l => l.seller === seller);
      if (q) out = out.filter(l => (l.title + ' ' + l.brand).toLowerCase().includes(q));
      out = out.sort((a, b) => ((b.boostedUntil || 0) > Date.now() ? 1 : 0) - ((a.boostedUntil || 0) > Date.now() ? 1 : 0) || b.createdAt - a.createdAt).slice(0, 200).map(listingCard);
      return send(res, 200, { listings: out });
    }
    /* --- listing detail (public) --- */
    if (req.method === 'GET' && /^\/api\/listings\/[A-Za-z0-9-]+$/.test(p)) {
      const l = listings.find(x => x.id === p.split('/')[3]);
      if (!l || l.status === 'removed') return send(res, 404, { error: 'not found' });
      const u = tokenUser(req);
      let acceptedOfferPrice = null;
      if (u) { const of = offers.find(o => o.listingId === l.id && o.buyer === u.email && o.status === 'accepted'); if (of) acceptedOfferPrice = of.amount; }
      return send(res, 200, { listing: listingFull(l), acceptedOfferPrice });
    }
    /* --- create listing --- */
    if (req.method === 'POST' && p === '/api/listings') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'Sign in to sell.' });
      const b = await readBody(req);
      const title = String(b.title || '').trim().slice(0, 90);
      const price = Math.round(Number(b.price) * 100) / 100;
      const photos = Array.isArray(b.photos) ? b.photos.filter(x => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 6) : [];
      if (title.length < 3) return send(res, 400, { error: 'Title too short.' });
      if (!(price > 0) || price > 100000) return send(res, 400, { error: 'Enter a valid price.' });
      if (!photos.length) return send(res, 400, { error: 'Add at least one photo.' });
      for (const ph of photos) if (ph.length > 2200000) return send(res, 400, { error: 'A photo is too large — keep under ~1.5MB.' });
      const cat = CATEGORIES.includes(b.category) ? b.category : 'other';
      const ships = Array.isArray(b.ships) ? b.ships.filter(r => REGIONS.includes(r)) : [];
      const l = {
        id: 'L-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
        seller: u.email, title, brand: String(b.brand || '').slice(0, 40),
        category: cat, price, old: Math.max(0, Math.round(Number(b.old) * 100) / 100) || 0,
        size: String(b.size || '').slice(0, 24), condition: CONDITIONS.includes(b.condition) ? b.condition : 'Good',
        ships, returns: RETURNS.includes(b.returns) ? b.returns : 'No returns',
        desc: String(b.desc || '').slice(0, 1500), photos, cover: photos[0], status: 'active', createdAt: Date.now(),
      };
      listings.push(l); saveListings();
      return send(res, 201, { listing: listingFull(l) });
    }
    /* --- edit / remove listing (owner) --- */
    if ((req.method === 'PUT' || req.method === 'DELETE') && /^\/api\/listings\/[A-Za-z0-9-]+$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const l = listings.find(x => x.id === p.split('/')[3]);
      if (!l) return send(res, 404, { error: 'not found' });
      if (l.seller !== u.email) return send(res, 403, { error: 'Not your listing.' });
      if (req.method === 'DELETE') { l.status = 'removed'; saveListings(); return send(res, 200, { ok: true }); }
      const b = await readBody(req);
      if (b.title !== undefined) l.title = String(b.title).trim().slice(0, 90);
      if (b.price !== undefined && Number(b.price) > 0) l.price = Math.round(Number(b.price) * 100) / 100;
      if (b.size !== undefined) l.size = String(b.size).slice(0, 24);
      if (b.desc !== undefined) l.desc = String(b.desc).slice(0, 1500);
      if (b.condition !== undefined && CONDITIONS.includes(b.condition)) l.condition = b.condition;
      if (b.category !== undefined && CATEGORIES.includes(b.category)) l.category = b.category;
      if (Array.isArray(b.ships)) l.ships = b.ships.filter(r => REGIONS.includes(r));
      if (b.returns !== undefined && RETURNS.includes(b.returns)) l.returns = b.returns;
      saveListings();
      return send(res, 200, { listing: listingFull(l) });
    }
    /* --- make offer --- */
    if (req.method === 'POST' && p === '/api/offers') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'Sign in to make an offer.' });
      const b = await readBody(req);
      const l = listings.find(x => x.id === b.listingId && x.status === 'active');
      if (!l) return send(res, 404, { error: 'Listing not available.' });
      if (l.seller === u.email) return send(res, 400, { error: "You can't offer on your own listing." });
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount > 0) || amount > l.price) return send(res, 400, { error: 'Offer must be above 0 and at most the asking price.' });
      const dayAgo = Date.now() - 864e5;
      if (offers.filter(o => o.buyer === u.email && o.createdAt > dayAgo).length >= MAX_OFFERS_PER_DAY)
        return send(res, 429, { error: `Daily limit reached — you can make up to ${MAX_OFFERS_PER_DAY} offers per day.` });
      offers.filter(o => o.listingId === l.id && o.buyer === u.email && o.status === 'pending').forEach(o => o.status = 'superseded');
      const of = { id: 'O-' + crypto.randomBytes(3).toString('hex').toUpperCase(), listingId: l.id, buyer: u.email, amount, status: 'pending', createdAt: Date.now() };
      offers.push(of); saveOffers();
      return send(res, 201, { offer: of });
    }
    /* --- accept / decline / counter offer (seller) --- */
    if (req.method === 'POST' && /^\/api\/offers\/[A-Za-z0-9-]+\/(accept|decline|counter)$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const parts = p.split('/'); const of = offers.find(o => o.id === parts[3]); const action = parts[4];
      if (!of) return send(res, 404, { error: 'not found' });
      const l = listings.find(x => x.id === of.listingId);
      if (!l || l.seller !== u.email) return send(res, 403, { error: 'Not your listing.' });
      if (of.status !== 'pending') return send(res, 400, { error: 'Offer already handled.' });
      if (action === 'counter') {
        const b = await readBody(req);
        const c = Math.round(Number(b.amount) * 100) / 100;
        if (!(c > 0) || c > l.price) return send(res, 400, { error: 'Counter must be above 0 and at most the asking price.' });
        of.counter = c; of.status = 'countered'; saveOffers();
        return send(res, 200, { ok: true, status: of.status });
      }
      of.status = action === 'accept' ? 'accepted' : 'declined';
      saveOffers();
      return send(res, 200, { ok: true, status: of.status });
    }
    /* --- buyer accepts the seller's counter --- */
    if (req.method === 'POST' && /^\/api\/offers\/[A-Za-z0-9-]+\/accept-counter$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const of = offers.find(o => o.id === p.split('/')[3]);
      if (!of || of.buyer !== u.email) return send(res, 403, { error: 'Not your offer.' });
      if (of.status !== 'countered' || !of.counter) return send(res, 400, { error: 'No counter to accept.' });
      of.amount = of.counter; of.status = 'accepted'; saveOffers();
      return send(res, 200, { ok: true });
    }
    /* --- report a listing --- */
    if (req.method === 'POST' && p === '/api/report') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'Sign in to report.' });
      const b = await readBody(req);
      const l = listings.find(x => x.id === b.listingId);
      if (!l) return send(res, 404, { error: 'not found' });
      reports.push({ id: 'RP-' + crypto.randomBytes(3).toString('hex').toUpperCase(), listingId: l.id, from: u.email, reason: String(b.reason || '').slice(0, 400), at: Date.now(), status: 'open' });
      saveReports();
      return send(res, 201, { ok: true });
    }
    /* --- boost a listing (paid, in USDC) --- */
    if (req.method === 'POST' && p === '/api/boost') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const l = listings.find(x => x.id === b.listingId && x.status === 'active');
      if (!l || l.seller !== u.email) return send(res, 403, { error: 'Not your listing.' });
      const days = Math.min(30, Math.max(1, parseInt(b.days, 10) || 7));
      const total = Math.round(days * BOOST_PRICE_PER_DAY * 100) / 100;
      const id = 'SWK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const order = {
        id, email: u.email, boost: true, listingId: l.id, boostDays: days,
        payment: 'USDC (ERC-20)', items: [{ id: l.id, name: 'Boost: ' + l.title, price: total, size: days + 'd', qty: 1 }],
        subtotal: total, ship: 0, total, payAmount: assignUniqueAmount(total),
        status: 'pending', paidTx: null, paidAt: null, date: Date.now(),
      };
      orders.push(order); saveOrders();
      return send(res, 201, { orderId: id, receiptUrl: `/receipt/${id}`, total, payAmount: order.payAmount, wallet: WALLET });
    }
    /* --- buy a listing (creates escrow order) --- */
    if (req.method === 'POST' && p === '/api/buy') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'Sign in to buy.' });
      const b = await readBody(req);
      const l = listings.find(x => x.id === b.listingId && x.status === 'active');
      if (!l) return send(res, 404, { error: 'Listing not available.' });
      if (l.seller === u.email) return send(res, 400, { error: "You can't buy your own listing." });
      const region = String(b.region || '');
      if (l.ships && l.ships.length && region && !l.ships.includes(region)) return send(res, 400, { error: `This seller does not ship to ${region}.` });
      let price = l.price;
      const of = offers.find(o => o.listingId === l.id && o.buyer === u.email && o.status === 'accepted');
      if (of) price = of.amount;
      // buyer-side fee: buyer pays item price + fee%; seller receives the full price
      const fee = Math.round(price * MARKET_FEE_PCT) / 100;
      const total = Math.round((price + fee) * 100) / 100;
      const id = 'SWK-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const order = {
        id, email: u.email, name: String(b.name || u.name || '').slice(0, 80),
        address: String(b.address || '').slice(0, 160), city: String(b.city || '').slice(0, 60), zip: String(b.zip || '').slice(0, 20),
        payment: 'USDC (ERC-20)', escrow: true, seller: l.seller, listingId: l.id,
        items: [{ id: l.id, name: l.title, price, size: l.size || '-', qty: 1 }],
        subtotal: price, ship: 0, total, fee,
        payAmount: assignUniqueAmount(total),
        status: 'pending', paidTx: null, paidAt: null, carrier: '', tracking: '', paidOut: false, date: Date.now(),
      };
      orders.push(order); saveOrders();
      if (of) { of.status = 'used'; saveOffers(); }
      return send(res, 201, { orderId: id, receiptUrl: `/receipt/${id}`, total, payAmount: order.payAmount, wallet: WALLET });
    }
    /* --- seller marks shipped --- */
    if (req.method === 'POST' && /^\/api\/order\/SWK-[A-Z0-9-]+\/ship$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o || o.seller !== u.email) return send(res, 403, { error: 'Not your sale.' });
      if (!['held', 'paid', 'processing'].includes(o.status)) return send(res, 400, { error: 'Order not ready to ship.' });
      const b = await readBody(req);
      o.carrier = String(b.carrier || '').slice(0, 60); o.tracking = String(b.tracking || '').slice(0, 80);
      o.status = 'shipped'; o.shippedAt = Date.now(); saveOrders();
      return send(res, 200, { ok: true });
    }
    /* --- buyer confirms receipt -> release --- */
    if (req.method === 'POST' && /^\/api\/order\/SWK-[A-Z0-9-]+\/confirm$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o || o.email !== u.email) return send(res, 403, { error: 'Not your order.' });
      if (!['shipped', 'delivered', 'disputed'].includes(o.status)) return send(res, 400, { error: 'Nothing to confirm yet.' });
      releaseOrder(o); saveOrders();
      return send(res, 200, { ok: true });
    }
    /* --- buyer opens dispute --- */
    if (req.method === 'POST' && /^\/api\/order\/SWK-[A-Z0-9-]+\/dispute$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o || o.email !== u.email) return send(res, 403, { error: 'Not your order.' });
      if (!['held', 'paid', 'shipped', 'delivered'].includes(o.status)) return send(res, 400, { error: 'Cannot dispute this order.' });
      const b = await readBody(req);
      o.status = 'disputed'; o.disputeReason = String(b.reason || '').slice(0, 500); o.disputedAt = Date.now(); saveOrders();
      return send(res, 200, { ok: true });
    }
    /* --- order chat (buyer <-> seller) --- */
    if (/^\/api\/order\/SWK-[A-Z0-9-]+\/messages$/.test(p)) {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const o = orders.find(x => x.id === p.split('/')[3]);
      if (!o) return send(res, 404, { error: 'not found' });
      if (o.email !== u.email && o.seller !== u.email) return send(res, 403, { error: 'Not part of this order.' });
      if (req.method === 'GET') {
        const thread = messages.filter(m => m.orderId === o.id).map(m => ({ from: sellerHandle(m.from), me: m.from === u.email, text: m.text, at: m.at }));
        const counterpart = o.email === u.email ? (o.seller ? sellerHandle(o.seller) : 'STUFFWEKNOW') : sellerHandle(o.email);
        return send(res, 200, { messages: thread, counterpart });
      }
      if (req.method === 'POST') {
        const b = await readBody(req);
        const text = String(b.text || '').trim().slice(0, 1000);
        if (!text) return send(res, 400, { error: 'Empty message.' });
        if (!o.seller) return send(res, 400, { error: 'Messaging is only for marketplace orders.' });
        messages.push({ id: 'M-' + crypto.randomBytes(4).toString('hex'), orderId: o.id, from: u.email, text, at: Date.now() });
        saveMessages();
        return send(res, 201, { ok: true });
      }
    }
    /* --- listing chat (buyer <-> seller, per listing) --- */
    if (p === '/api/chat/thread' && req.method === 'GET') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const lid = String(url.searchParams.get('listingId') || '');
      const buyer = String(url.searchParams.get('buyer') || u.email).toLowerCase();
      const l = listings.find(x => x.id === lid);
      if (!l) return send(res, 404, { error: 'not found' });
      if (u.email !== buyer && u.email !== l.seller) return send(res, 403, { error: 'Not part of this chat.' });
      const tid = lid + '|' + buyer;
      const thread = messages.filter(m => m.thread === tid).map(m => ({ from: sellerHandle(m.from), me: m.from === u.email, text: m.text, at: m.at }));
      const otherEmail = u.email === l.seller ? buyer : l.seller;
      const other = users[otherEmail] || {};
      const counterpart = sellerHandle(otherEmail);
      return send(res, 200, { messages: thread, counterpart, counterpartAvatar: other.avatar || '', counterpartTelegram: other.telegram || '', listing: { id: l.id, title: l.title, cover: l.cover || '', price: l.price } });
    }
    if (p === '/api/chat/send' && req.method === 'POST') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const l = listings.find(x => x.id === b.listingId);
      if (!l) return send(res, 404, { error: 'not found' });
      const buyer = String(b.buyer || u.email).toLowerCase();
      if (u.email !== buyer && u.email !== l.seller) return send(res, 403, { error: 'Not part of this chat.' });
      if (buyer === l.seller) return send(res, 400, { error: "You can't message yourself." });
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!text) return send(res, 400, { error: 'Empty message.' });
      messages.push({ id: 'M-' + crypto.randomBytes(4).toString('hex'), thread: l.id + '|' + buyer, from: u.email, text, at: Date.now() });
      saveMessages();
      return send(res, 201, { ok: true });
    }
    if (p === '/api/my/chats' && req.method === 'GET') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const byThread = {};
      for (const m of messages) {
        if (!m.thread) continue;
        const [lid, buyer] = m.thread.split('|');
        const l = listings.find(x => x.id === lid); if (!l) continue;
        if (u.email !== buyer && u.email !== l.seller) continue;
        const t = byThread[m.thread] || (byThread[m.thread] = { listingId: lid, buyer, title: l.title, cover: l.cover || '', price: l.price, role: u.email === l.seller ? 'seller' : 'buyer', counterpart: u.email === l.seller ? sellerHandle(buyer) : sellerHandle(l.seller), last: '', at: 0 });
        if (m.at >= t.at) { t.last = m.text; t.at = m.at; }
      }
      const chats = Object.values(byThread).sort((a, b) => b.at - a.at);
      return send(res, 200, { chats });
    }
    /* --- translate a chat message (keyless) --- */
    if (req.method === 'POST' && p === '/api/translate') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const text = String(b.text || '').slice(0, 1000);
      const to = String(b.to || 'en').slice(0, 5).replace(/[^a-zA-Z-]/g, '') || 'en';
      if (!text) return send(res, 400, { error: 'Nothing to translate.' });
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
        const r = await fetch(url);
        const j = await r.json();
        const out = (Array.isArray(j) && Array.isArray(j[0])) ? j[0].map(x => x[0]).join('') : text;
        const src = (Array.isArray(j) && j[2]) ? j[2] : '';
        return send(res, 200, { text: out, from: src });
      } catch (e) { return send(res, 502, { error: 'Translation unavailable right now.' }); }
    }

    /* --- leave review (after completion) --- */
    if (req.method === 'POST' && p === '/api/reviews') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const o = orders.find(x => x.id === b.orderId);
      if (!o) return send(res, 404, { error: 'not found' });
      if (!['released', 'delivered'].includes(o.status)) return send(res, 400, { error: 'You can review after the order completes.' });
      let to, role;
      if (o.email === u.email) { to = o.seller; role = 'seller'; }
      else if (o.seller === u.email) { to = o.email; role = 'buyer'; }
      else return send(res, 403, { error: 'Not part of this order.' });
      if (!to) return send(res, 400, { error: 'Nothing to review.' });
      if (reviews.find(r => r.orderId === o.id && r.from === u.email)) return send(res, 409, { error: 'Already reviewed.' });
      const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 0));
      if (!rating) return send(res, 400, { error: 'Pick 1–5 stars.' });
      reviews.push({ id: 'R-' + crypto.randomBytes(3).toString('hex').toUpperCase(), orderId: o.id, from: u.email, to, role, rating, text: String(b.text || '').slice(0, 500), createdAt: Date.now() });
      saveReviews();
      return send(res, 201, { ok: true });
    }
    /* --- public seller profile --- */
    if (req.method === 'GET' && /^\/api\/seller\/.+$/.test(p)) {
      const email = decodeURIComponent(p.split('/')[3]).toLowerCase();
      if (!users[email]) return send(res, 404, { error: 'not found' });
      const st = sellerStats(email);
      const items = listings.filter(l => l.seller === email && l.status === 'active').map(listingCard);
      const rs = reviews.filter(r => r.to === email && r.role === 'seller').slice(-30).reverse()
        .map(r => ({ rating: r.rating, text: r.text, from: sellerHandle(r.from), createdAt: r.createdAt }));
      return send(res, 200, { handle: sellerHandle(email), joined: (users[email].created || 0), avatar: users[email].avatar || '', telegram: users[email].telegram || '', ...st, listings: items, reviews: rs });
    }
    /* --- my marketplace dashboard --- */
    if (req.method === 'GET' && p === '/api/my/market') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const reviewedByMe = (oid) => !!reviews.find(r => r.orderId === oid && r.from === u.email);
      const myListings = listings.filter(l => l.seller === u.email && l.status !== 'removed').sort((a, b) => b.createdAt - a.createdAt).map(listingCard);
      const purchases = orders.filter(o => o.email === u.email).sort((a, b) => b.date - a.date).map(o => ({ ...orderView(o), reviewedByMe: reviewedByMe(o.id) }));
      const sales = orders.filter(o => o.escrow && o.seller === u.email).sort((a, b) => b.date - a.date).map(o => ({ ...orderView(o), reviewedByMe: reviewedByMe(o.id) }));
      const offersMade = offers.filter(o => o.buyer === u.email).sort((a, b) => b.createdAt - a.createdAt).map(offerView);
      const offersReceived = offers.filter(o => { const l = listings.find(x => x.id === o.listingId); return l && l.seller === u.email; }).sort((a, b) => b.createdAt - a.createdAt).map(offerView);
      return send(res, 200, { payout: u.payout || '', balance: payoutBalance(u.email), listings: myListings, purchases, sales, offersMade, offersReceived });
    }
    /* --- set payout address --- */
    if (req.method === 'POST' && p === '/api/payout') {
      const u = tokenUser(req); if (!u) return send(res, 401, { error: 'unauthorized' });
      const b = await readBody(req);
      const addr = String(b.address || '').trim();
      if (addr && !/^0x[a-fA-F0-9]{40}$/.test(addr)) return send(res, 400, { error: 'Enter a valid 0x… address.' });
      users[u.email].payout = addr; saveUsers();
      return send(res, 200, { ok: true });
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
        if (!o || !['pending', 'paid', 'held', 'processing', 'shipped', 'delivered', 'released', 'refunded', 'disputed', 'cancelled'].includes(status)) return send(res, 400, { error: 'bad request' });
        o.status = status;
        if (status === 'released') { o.releasedAt = o.releasedAt || Date.now(); const l = listings.find(x => x.id === o.listingId); if (l && l.status !== 'sold') { l.status = 'sold'; saveListings(); } }
        if (carrier !== undefined) o.carrier = String(carrier).slice(0, 60);
        if (tracking !== undefined) o.tracking = String(tracking).slice(0, 80);
        saveOrders();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/admin/payout-done') {
        const { id } = await readBody(req);
        const o = orders.find(x => x.id === id);
        if (!o) return send(res, 404, { error: 'not found' });
        o.paidOut = true; saveOrders();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/admin/verify') {
        const { email, verified } = await readBody(req);
        const em = String(email || '').toLowerCase();
        if (!users[em]) return send(res, 404, { error: 'not found' });
        users[em].verified = !!verified; saveUsers();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/admin/listing-moderate') {
        const { id, action } = await readBody(req);
        const l = listings.find(x => x.id === id);
        if (!l) return send(res, 404, { error: 'not found' });
        if (action === 'approve') l.status = 'active';
        else if (action === 'reject') l.status = 'rejected';
        else return send(res, 400, { error: 'bad action' });
        saveListings();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/api/admin/report-resolve') {
        const { id, action } = await readBody(req);
        const rp = reports.find(x => x.id === id);
        if (!rp) return send(res, 404, { error: 'not found' });
        if (action === 'remove') { const l = listings.find(x => x.id === rp.listingId); if (l) { l.status = 'removed'; saveListings(); } }
        rp.status = 'resolved'; saveReports();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET' && p === '/api/admin/market') {
        return send(res, 200, {
          pending: listings.filter(l => l.status === 'pending').sort((a, b) => a.createdAt - b.createdAt).map(l => ({ ...listingCard(l), sellerEmail: l.seller, desc: l.desc || '', photos: (l.photos || []).slice(0, 6) })),
          listings: listings.filter(l => l.status !== 'removed' && l.status !== 'pending').slice(-200).reverse().map(listingCard),
          disputes: orders.filter(o => o.status === 'disputed').map(orderView),
          payouts: orders.filter(o => o.status === 'released' && !o.paidOut).map(o => ({ ...orderView(o), payout: (users[o.seller] || {}).payout || '' })),
          reports: reports.filter(r => r.status === 'open').map(r => { const l = listings.find(x => x.id === r.listingId); return { id: r.id, listingId: r.listingId, title: l ? l.title : '(gone)', seller: l ? sellerHandle(l.seller) : '', reason: r.reason, from: sellerHandle(r.from), at: r.at }; }),
          verifiable: Object.values(users).map(u => ({ email: u.email, handle: sellerHandle(u.email), verified: !!u.verified, listings: listings.filter(l => l.seller === u.email && l.status !== 'removed').length })).filter(u => u.listings > 0),
        });
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
        match.paidTx = tx.hash; match.paidAt = ts;
        if (match.boost) {
          match.status = 'paid';
          const l = listings.find(x => x.id === match.listingId);
          if (l) { l.boostedUntil = Math.max(l.boostedUntil || 0, Date.now()) + (match.boostDays || 7) * 864e5; saveListings(); }
          console.log(`[swk-store] listing ${match.listingId} BOOSTED ${match.boostDays}d (${amt} USDC)`);
        } else {
          match.status = match.escrow ? 'held' : 'paid';
          console.log(`[swk-store] order ${match.id} ${match.escrow ? 'HELD in escrow' : 'PAID'} (${amt} USDC) tx ${tx.hash}`);
        }
        usedTx.add(tx.hash.toLowerCase()); changed = true;
      }
    }
    if (changed) saveOrders();
  } catch (e) {
    console.error('[swk-store] payment poll error:', e.message);
  }
}
if (ETHERSCAN_KEY) setInterval(pollPayments, 30000).unref();

/* ---------- auto-release escrow after the buyer-protection window ---------- */
setInterval(() => {
  const cutoff = Date.now() - AUTO_RELEASE_DAYS * 864e5;
  let changed = false;
  for (const o of orders) {
    if (o.escrow && o.status === 'shipped' && o.shippedAt && o.shippedAt < cutoff) {
      releaseOrder(o); changed = true;
      console.log(`[swk-store] order ${o.id} auto-released to seller after ${AUTO_RELEASE_DAYS}d`);
    }
  }
  if (changed) saveOrders();
}, 3600000).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[swk-store] listening on 127.0.0.1:${PORT}`);
  console.log(`[swk-store] data dir: ${DATA}`);
  console.log(`[swk-store] admin ${ADMIN_PASSWORD ? 'ENABLED' : 'DISABLED (set ADMIN_PASSWORD)'}`);
  console.log(`[swk-store] wallet: ${WALLET}`);
  console.log(`[swk-store] payment auto-check ${ETHERSCAN_KEY ? 'ENABLED (USDC ERC-20)' : 'DISABLED (set ETHERSCAN_API_KEY) — manual confirmation'}`);
});
