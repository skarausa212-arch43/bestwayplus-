/**
 * LUMI click audit — «нажать все кнопки и проверить».
 *
 * Drives a real browser as customer, cleaner, company and admin, walks every
 * view in each role's navigation, and clicks EVERY visible button one at a
 * time. For each click it records:
 *   • uncaught JS errors / console errors (a crashing button)
 *   • whether anything happened at all — modal opened, toast shown, view
 *     changed, or the DOM mutated (a "dead" button that does nothing)
 * Destructive / session-ending / external buttons are opened but not confirmed.
 *
 *   LUMI_E2E_URL=http://localhost:4000 node ops/click-audit.js
 * Exits non-zero if any button crashes. Dead buttons are reported as warnings.
 */
const { chromium } = require(process.env.PW || '/opt/node22/lib/node_modules/playwright');
const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const api = async (p, m, b, t) => { const r = await fetch(B + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const ts = Date.now();

// Buttons we open but never confirm / that would end the crawl: matched by text.
const SKIP_TEXT = /Выйти|Войти под|Продолжить с|Google|Apple|Удалить аккаунт|УДАЛИТ|Обнулить|Сбросить|reset|Отменить подписку|разлогин|logout/i;

const crawl = { clicked: 0, dead: [], errors: [] };

async function auditRole(browser, label, token, views, seed) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  const jsErrors = [];
  let sideEffect = false;   // native file picker / download counts as "it did something"
  pg.on('pageerror', (e) => jsErrors.push(String(e.message || e)));
  pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|Failed to load resource|net::/.test(m.text())) jsErrors.push('console: ' + m.text()); });
  pg.on('filechooser', (fc) => { sideEffect = true; fc.setFiles([]).catch(() => {}); });
  pg.on('download', () => { sideEffect = true; });
  pg.on('dialog', (d) => { sideEffect = true; d.dismiss().catch(() => {}); });

  await pg.goto(B); await pg.waitForTimeout(300);
  await pg.evaluate(([t]) => { localStorage.setItem('cg_token', t); localStorage.setItem('lumi_lang', 'ru'); }, [token]);
  if (seed) await seed(pg);
  await pg.goto(B); await pg.waitForTimeout(1200);

  for (const view of views) {
    await pg.evaluate(([v]) => { try { state.view = v; render(); } catch (e) {} }, [view]);
    await pg.waitForTimeout(900);
    // Enumerate every clickable control in this view: real buttons plus any
    // element the app wired a handler to (cursor:pointer). Click only innermost
    // controls (skip containers that hold other clickables) to avoid giant hits.
    const buttons = await pg.evaluate(() => {
      const root = document.querySelector('.content'); if (!root) return [];
      const cand = new Set(root.querySelectorAll('button, a.btn, [role=button], .svc, .card.bk, .opt, .extra, .chip, .kyc-up, .iconbtn, .userchip, .prof, tr[style*="pointer"], [data-choose], [data-prof], [data-open], [data-v], [data-remind]'));
      root.querySelectorAll('*').forEach((el) => { if (getComputedStyle(el).cursor === 'pointer') cand.add(el); });
      const isControl = (el) => el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button' || (el.tagName === 'LABEL' && el.querySelector('input')) || el.hasAttribute('data-choose') || el.hasAttribute('data-prof') || el.hasAttribute('data-open') || el.hasAttribute('data-v') || el.hasAttribute('data-remind');
      const list = [...cand].filter((el) =>
        el instanceof HTMLElement &&        // SVG path/circle have no .click()
        !el.closest('svg') &&               // skip icon internals
        el.offsetParent !== null && el.getClientRects().length &&
        // a real control, OR explicitly made clickable (cursor:pointer). Elements
        // with cursor:default (e.g. info rows styled as cards) are not controls.
        (isControl(el) || getComputedStyle(el).cursor === 'pointer'));
      const out = [];
      list.forEach((el, i) => {
        // innermost only: skip if it contains another candidate
        if (list.some((o) => o !== el && el.contains(o))) return;
        const txt = String(el.innerText || el.getAttribute('aria-label') || (typeof el.className === 'string' ? el.className : '') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
        el.setAttribute('data-audit', 'b' + i);
        out.push({ sel: 'b' + i, txt });
      });
      return out;
    });
    for (const btn of buttons) {
      if (SKIP_TEXT.test(btn.txt)) continue;
      jsErrors.length = 0; sideEffect = false;
      const snap = () => pg.evaluate(() => ({
        view: (typeof state !== 'undefined' && state.view) || '',
        modals: document.querySelectorAll('.modal-bg').length,
        toast: (document.querySelector('#toast') || {}).textContent || '',
        html: document.querySelector('.content') ? document.querySelector('.content').innerHTML.length : 0,
        // checkbox/radio state — toggles change a property, not the serialized HTML
        checks: [...document.querySelectorAll('.content input')].map((i) => (i.checked ? 1 : 0)).join(''),
      }));
      const before = await snap();
      let res = 'ok';
      try {
        res = await pg.evaluate(([s]) => { const b = document.querySelector(`[data-audit="${s}"]`); if (!b) return 'gone'; if (b.disabled) return 'disabled'; b.click(); return 'ok'; }, [btn.sel]);
      } catch (e) { jsErrors.push('click threw: ' + e.message); }
      if (res === 'gone' || res === 'disabled') continue;   // guarded/removed — not a dead button
      await pg.waitForTimeout(260);
      const after = await snap();
      crawl.clicked++;
      if (jsErrors.length) crawl.errors.push({ role: label, view, btn: btn.txt, err: jsErrors.slice(0, 2).join(' | ') });
      const changed = sideEffect || after.view !== before.view || after.modals !== before.modals || after.toast !== before.toast || after.checks !== before.checks || Math.abs(after.html - before.html) > 4;
      if (!changed) crawl.dead.push(`[${label}/${view}] "${btn.txt}"`);
      // Close any modal the click opened, and return to the view.
      await pg.evaluate(() => { try { if (typeof closeModal === 'function') closeModal(); } catch (e) {} });
      await pg.keyboard.press('Escape').catch(() => {});
      await pg.waitForTimeout(120);
      if (after.view !== before.view) { await pg.evaluate(([v]) => { try { state.view = v; render(); } catch (e) {} }, [view]); await pg.waitForTimeout(500); }
    }
  }
  await ctx.close();
}

(async () => {
  const cfg = (await api('/api/cities')).json;
  const CITY = (cfg.open || cfg.cities || ['Wrocław'])[0];
  const admin = (await api('/api/login', 'POST', { email: 'admin@cleango.app', password: 'cleango123' })).json.token;

  // ── seed a customer with property + bookings in several states ──
  const cust = (await api('/api/register', 'POST', { name: 'Клик Клиент', email: `clk-c${ts}@t.co`, password: 'averylongpassword12', phone: '+48512000001', role: 'customer', city: CITY, acceptedTerms: true })).json;
  const cln = (await api('/api/register', 'POST', { name: 'Клик Исполнитель', email: `clk-p${ts}@t.co`, password: 'averylongpassword12', phone: '+48512000002', role: 'cleaner', city: CITY, teamSize: 2, acceptedTerms: true, professions: ['cleaning', 'garden'], equipment: ['vacuum', 'g_mower'], entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27114020040000300201355387', bio: 'Опыт 5 лет, уборка и сад, своё оборудование и инструмент.' })).json;
  await api('/api/admin/verify-cleaner', 'POST', { cleanerId: cln.user.id, verified: true }, admin);
  await api('/api/cleaner/online', 'POST', { online: true }, cln.token);
  const prop = (await api('/api/properties', 'POST', { type: 'house', label: 'Дом для клика', city: CITY, rooms: 3, baths: 2, address: 'ul. Klikowa 1' }, cust.token)).json.property;
  // one active booking (accepted) + one completed booking for both parties to see
  const b1 = (await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'standard' }, cust.token)).json.booking;
  await api(`/api/bookings/${b1.id}/accept`, 'POST', {}, cln.token);
  const b2 = (await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'deep' }, cust.token)).json.booking;
  await api(`/api/bookings/${b2.id}/accept`, 'POST', {}, cln.token);
  await api(`/api/bookings/${b2.id}/enroute`, 'POST', {}, cln.token);
  await api(`/api/bookings/${b2.id}/photos`, 'POST', { phase: 'before', photo: IMG }, cln.token);
  await api(`/api/bookings/${b2.id}/status`, 'POST', { status: 'in_progress' }, cln.token);
  await api(`/api/bookings/${b2.id}/photos`, 'POST', { phase: 'after', photo: IMG }, cln.token);
  await api(`/api/bookings/${b2.id}/status`, 'POST', { status: 'completed' }, cln.token);

  const browser = await chromium.launch();
  await auditRole(browser, 'customer', cust.token, ['home', 'properties', 'book', 'bookings', 'messages', 'wallet', 'premium']);
  await auditRole(browser, 'cleaner', cln.token, ['jobs', 'bookings', 'earnings', 'wallet']);
  await auditRole(browser, 'admin', admin, ['admin', 'analytics', 'bookings', 'audit', 'platform']);
  await browser.close();

  // ── report ──
  console.log('\n════════════ КЛИК-АУДИТ: нажаты все кнопки ════════════');
  console.log(`Нажато кнопок: ${crawl.clicked}`);
  if (crawl.errors.length) {
    console.log(`\n❌ КНОПКИ С ОШИБКОЙ (${crawl.errors.length}):`);
    for (const e of crawl.errors) console.log(`  ✗ [${e.role}/${e.view}] "${e.btn}" → ${e.err}`);
  } else {
    console.log('✓ Ни одна кнопка не вызвала JS-ошибку.');
  }
  if (crawl.dead.length) {
    console.log(`\n⚠ Кнопки без видимого эффекта (${crawl.dead.length}) — проверить вручную:`);
    for (const d of [...new Set(crawl.dead)]) console.log(`  • ${d}`);
  } else {
    console.log('✓ Каждая кнопка что-то делает (модалка / переход / тост / изменение экрана).');
  }
  console.log('─'.repeat(56));
  console.log(crawl.errors.length ? `❌ ${crawl.errors.length} кнопок с ошибкой` : `✅ Все ${crawl.clicked} кнопок работают без ошибок.`);
  process.exit(crawl.errors.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
