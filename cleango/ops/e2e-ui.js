/**
 * LUMI full-action UI E2E (manual/CI-optional — NOT part of `npm test`).
 *
 * Drives 26 real user actions through the browser UI and verifies each
 * outcome: registration, property + floor, short-term rental (reservations,
 * AI import, turnover scheduling, supplies, checklist, settings, PMS
 * calendar, problem report/resolve, QC gate), the 4-step booking flow, chat
 * open/closed rules, theme/language/notifications, family invite,
 * logout/login, the cleaner job lifecycle with payment, review, and the
 * admin panel.
 *
 * Requirements: a running LUMI server WITH seed accounts (piotr@example.com,
 * admin@cleango.app) and Playwright + Chromium available.
 *
 *   LUMI_DATA_DIR=/tmp/e2e-data node server.js &        # fresh store, seed on
 *   LUMI_E2E_URL=http://localhost:4000 node ops/e2e-ui.js
 *
 * Exits 0 only when every action passes with zero console errors.
 */
// Resolve playwright from the project, globally, or PLAYWRIGHT_PATH.
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright')); }
const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const api = async (p, m, b, tok) => { const r = await fetch(B + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); return { status: r.status, json: j }; };
const results = [];
const step = async (name, fn) => { try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e.message || e).slice(0, 160)]); } };
const ts = Date.now();
const EMAIL = `e2e${ts}@t.co`, PASS = 'Passw0rd!Long1';

(async () => {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 440, height: 950 } });
  const consoleErrs = [];
  pg.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text().slice(0, 120)); });
  pg.on('pageerror', e => consoleErrs.push('PAGEERR ' + e.message.slice(0, 120)));
  pg.on('dialog', d => d.accept());                         // auto-accept confirm() dialogs
  const wait = (ms) => pg.waitForTimeout(ms);
  const clickText = async (re) => pg.evaluate((src) => { const rx = new RegExp(src); const b = [...document.querySelectorAll('button')].find(x => rx.test(x.textContent)); if (b) { b.click(); return true; } return false; }, re);
  const lastToast = () => pg.evaluate(() => document.querySelector('#toast')?.textContent || '');

  // ── 1. UI registration ──
  await pg.goto(B); await wait(400);
  await pg.evaluate(() => localStorage.setItem('lumi_lang', 'ru'));   // stable RU text for matching
  await pg.reload(); await wait(800);
  await step('UI: регистрация клиента через форму', async () => {
    await pg.evaluate(() => document.querySelector('[data-m="register"]').click()); await wait(500);
    await pg.evaluate(([em, pw]) => {
      const card = document.querySelector('#authCard');
      const set = (sel, v) => { const e = card.querySelector(sel); if (!e) throw new Error('no ' + sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
      set('input[name="name"]', 'E2E Тест');
      set('input[name="email"]', em);
      set('input[name="phone"]', '+48500600711');
      set('input[name="password"]', pw);
      // Cities the platform has not opened yet are rendered disabled and are
      // rejected server-side — always register in an open one.
      const city = card.querySelector('select[name="city"]');
      if (city) { const open = [...city.options].find((o) => !o.disabled); if (!open) throw new Error('no open city in the form'); city.value = open.value; }
      const consent = card.querySelector('#regConsent'); if (!consent) throw new Error('no consent checkbox'); consent.checked = true; consent.dispatchEvent(new Event('change', { bubbles: true }));
    }, [EMAIL, PASS]);
    await pg.evaluate(() => document.querySelector('#authCard button[type="submit"]').click());
    let user = null;
    for (let i = 0; i < 12 && user !== EMAIL; i++) { await wait(500); user = await pg.evaluate(() => (typeof state !== 'undefined' && state.user) ? state.user.email : null); }
    if (user !== EMAIL) throw new Error('after submit user=' + user);
  });

  // ── 2. add apartment with floor ──
  await step('UI: добавить квартиру (этаж 7) через форму', async () => {
    await pg.evaluate(() => { state.view = 'properties'; render(); }); await wait(600);
    await pg.evaluate(() => openPropertyForm()); await wait(400);
    await pg.evaluate(() => {
      const q = (s) => document.querySelector(s);
      q('#pl').value = 'Тест Квартира'; q('#pa').value = 'ul. Testowa 1';
      q('#pr').value = '3'; q('#pb').value = '1'; q('#pfl').value = '7'; q('#par').value = '70';
      q('#savep').click();
    });
    await wait(1000);
    const props = await pg.evaluate(() => state.properties.map(p => ({ l: p.label, f: p.floor })));
    const mine = props.find(p => p.l === 'Тест Квартира');
    if (!mine) throw new Error('property not in list');
    if (mine.f !== 7) throw new Error('floor=' + mine.f);
  });

  // ── 3. add STR property via type card ──
  await step('UI: добавить посуточную аренду (карточка типа + настройки)', async () => {
    await pg.evaluate(() => openPropertyForm()); await wait(400);
    await pg.evaluate(() => { document.querySelector('[data-pt="short_term_rental"]').click(); });
    await wait(300);
    const strVisible = await pg.evaluate(() => document.querySelector('#strBlock').style.display !== 'none');
    if (!strVisible) throw new Error('strBlock hidden after selecting type');
    await pg.evaluate(() => {
      const q = (s) => document.querySelector(s);
      q('#pl').value = 'Тест Аренда'; q('#pa').value = 'Rynek 5'; q('#pr').value = '2'; q('#pb').value = '1';
      q('#pbed').value = '2';
      document.querySelector('#pbuf [data-buf="90"]').click();
      q('#savep').click();
    });
    await wait(1000);
    const p = await pg.evaluate(() => state.properties.find(x => x.label === 'Тест Аренда'));
    if (!p) throw new Error('STR not created');
    if (!p.strSummary) throw new Error('no strSummary on list payload');
  });
  let strId = await pg.evaluate(() => (state.properties.find(x => x.label === 'Тест Аренда') || state.properties.find(x => x.type === 'short_term_rental') || {}).id || null);
  if (!strId) { // keep the rest of the audit alive even if UI creation failed
    const tokNow = await pg.evaluate(() => localStorage.getItem('cg_token'));
    const r = await api('/api/properties', 'POST', { type: 'short_term_rental', label: 'Тест Аренда', city: 'Warsaw', rooms: 2, baths: 1 }, tokNow);
    strId = r.json.property && r.json.property.id;
  }

  // ── 4. add reservation via form ──
  await step('UI: добавить бронирование через форму', async () => {
    await pg.evaluate(id => openPropView(id), strId); await wait(1300);
    await pg.evaluate(() => document.querySelector('#ssAdd').click()); await wait(500);
    await pg.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const d = (n) => { const x = new Date(Date.now() + n * 86400000); return x.toISOString().slice(0, 10); };
      q('#rci').value = d(2); q('#rco').value = d(5); q('#rgn').value = 'Анна Тест'; q('#rgc').value = '2';
      q('#rsave').click();
    });
    await wait(1200);
    const n = await pg.evaluate(() => (ssData.reservations || []).length);
    if (n !== 1) throw new Error('reservations=' + n);
  });

  // ── 5. edit reservation ──
  await step('UI: изменить бронирование (имя гостя)', async () => {
    await pg.evaluate(() => { document.querySelector('#ssRes .card').click(); }); await wait(500);
    await pg.evaluate(() => { const q = document.querySelector('#rgn'); q.value = 'Анна Изм.'; document.querySelector('#rsave').click(); });
    await wait(1200);
    const g = await pg.evaluate(() => ssData.reservations[0].guestName);
    if (g !== 'Анна Изм.') throw new Error('guestName=' + g);
  });

  // ── 6. AI import: paste → recognize → confirm ──
  await step('UI: AI-импорт календаря (текст → распознать → подтвердить)', async () => {
    await pg.evaluate(() => document.querySelector('#ssImport').click()); await wait(500);
    const yr = new Date().getFullYear() + 1;
    const okSet = await pg.evaluate((y) => { const ta = document.querySelector('#ciText'); if (!ta) return false; ta.value = `${y}-03-10 to ${y}-03-14 Airbnb\n${y}-03-14 to ${y}-03-18 Booking.com`; return true; }, yr);
    if (!okSet) throw new Error('#ciText not found');
    await clickText('Распознать календарь'); await wait(900);
    const found = await pg.evaluate(() => document.body.innerText.includes('AI распознал календарь'));
    if (!found) throw new Error('review screen not shown');
    await clickText('Подтвердить и создать календарь'); await wait(1400);
    const n = await pg.evaluate(() => (ssData.reservations || []).length);
    if (n !== 3) throw new Error('after confirm reservations=' + n);
  });

  // ── 7. schedule turnover ──
  await step('UI: запланировать уборку между гостями', async () => {
    const had = await pg.evaluate(() => { const b = document.querySelector('#ssTurnovers [data-sch]'); if (!b) return false; b.click(); return true; });
    if (!had) throw new Error('no Запланировать button');
    await wait(1400);
    const st = await pg.evaluate(() => ssData.turnovers.map(t => t.status));
    if (!st.includes('scheduled')) throw new Error('statuses=' + st.join(','));
  });

  // ── 8. supplies editor ──
  await step('UI: расходники — добавить и сохранить', async () => {
    await pg.evaluate(() => document.querySelector('#ssSupEdit').click()); await wait(400);
    await pg.evaluate(() => { const i = document.querySelector('#supNew'); i.value = 'Туалетная бумага'; document.querySelector('#supAdd').click(); });
    await wait(200);
    await pg.evaluate(() => document.querySelector('#supSave').click()); await wait(1200);
    const sup = await pg.evaluate(() => ssData.supplies.map(s => s.name));
    if (!sup.includes('Туалетная бумага')) throw new Error('supplies=' + sup.join(','));
  });

  // ── 9. checklist editor: custom + reset ──
  await step('UI: чек-лист — добавить раздел, сохранить, сбросить', async () => {
    await pg.evaluate(() => document.querySelector('#ssChkEdit').click()); await wait(400);
    await pg.evaluate(() => document.querySelector('#chkAddSec').click()); await wait(200);
    await pg.evaluate(() => {
      const secs = document.querySelectorAll('#chkList [data-sec]');
      const last = secs[secs.length - 1]; last.value = 'Балкон'; last.dispatchEvent(new Event('change'));
      const items = document.querySelectorAll('#chkList [data-it]');
      const li = items[items.length - 1]; li.value = 'Подмести'; li.dispatchEvent(new Event('change'));
      document.querySelector('#chkSave').click();
    });
    await wait(1200);
    let isDef = await pg.evaluate(() => ssData.checklistIsDefault);
    if (isDef !== false) throw new Error('custom not saved');
    await pg.evaluate(() => document.querySelector('#ssChkEdit').click()); await wait(400);
    await clickText('Сбросить к стандартному'); await wait(1200);
    isDef = await pg.evaluate(() => ssData.checklistIsDefault);
    if (isDef !== true) throw new Error('reset failed');
  });

  // ── 10. STR settings save ──
  await step('UI: настройки гостей/уборок — буфер 90, сохранить', async () => {
    await pg.evaluate(() => document.querySelector('#ssSettings').click()); await wait(500);
    await pg.evaluate(() => {
      const inputs = [...document.querySelectorAll('.card.pad input.input')];
      const buf = inputs.find(i => i.type === 'number');
      buf.value = '90'; buf.dispatchEvent(new Event('input'));
      [...document.querySelectorAll('button')].find(b => /Сохранить/.test(b.textContent)).click();
    });
    await wait(1200);
    const v = await pg.evaluate(() => ssData.settings.minimumBufferMinutes);
    if (v !== 90) throw new Error('buffer=' + v);
  });

  // ── 11. PMS calendar opens from properties ──
  await step('UI: PMS «Календарь аренды» открывается и рисует брони', async () => {
    await pg.evaluate(() => { state.view = 'properties'; render(); }); await wait(700);
    const had = await pg.evaluate(() => { const b = document.querySelector('#pmsBtn'); if (!b) return false; b.click(); return true; });
    if (!had) throw new Error('no PMS button');
    await wait(1300);
    const bars = await pg.evaluate(() => document.querySelectorAll('.pms-bar').length);
    if (bars < 1) throw new Error('bars=' + bars);
    await pg.evaluate(() => { document.querySelector('[data-po="1"]').click(); });  // page next
    await wait(400);
  });

  // ── 12. booking flow through all 4 steps ──
  let bookingId = null;
  await step('UI: заказ уборки — 4 шага до подтверждения', async () => {
    await pg.evaluate(() => { state.view = 'book'; state.draft = null; render(); }); await wait(700);
    await pg.evaluate(() => document.querySelector('#next').click()); await wait(600);   // step0 defaults
    await pg.evaluate(() => document.querySelector('#next').click()); await wait(600);   // step1 extras skip
    await pg.evaluate(() => {                                                            // step2 date/time/addr
      const d = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
      const de = document.querySelector('#schedDate'); de.value = d; de.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await wait(400);
    await pg.evaluate(() => { const s = [...document.querySelectorAll('.slot')].find(x => !x.disabled); s.click(); });
    await wait(400);
    await pg.evaluate(() => {
      const a = [...document.querySelectorAll('input')].find(i => /Улица|Ulica/.test(i.placeholder || ''));
      if (a) { a.value = 'ul. Testowa 1'; a.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await wait(300);
    await pg.evaluate(() => document.querySelector('#next').click()); await wait(900);   // → step3 estimate
    const est = await pg.evaluate(() => !!document.querySelector('#confirm'));
    if (!est) throw new Error('no confirm button on step 3');
    await pg.evaluate(() => document.querySelector('#confirm').click()); await wait(1600);
    const tokC = await pg.evaluate(() => localStorage.getItem('cg_token'));
    const bks = await api('/api/bookings', 'GET', null, tokC);
    const std = (bks.json.bookings || []).find(b => b.service === 'standard');
    if (!std) throw new Error('booking not created');
    bookingId = std.id;
  });

  // ── 13. chat message in booking ──
  await step('UI: детали заказа открываются из списка', async () => {
    await pg.evaluate(() => { state.view = 'bookings'; render(); }); await wait(800);
    const clicked = await pg.evaluate(() => { const c = document.querySelector('#root .card.bk'); if (!c) return false; c.click(); return true; });
    if (!clicked) throw new Error('no booking row');
    await wait(900);
    const opened = await pg.evaluate(() => /Отменить заказ|Идёт поиск|итого|Стандартная/.test(document.body.innerText));
    if (!opened) throw new Error('detail view not rendered');
  });

  // ── 14. theme + language + notifications ──
  await step('UI: тема, язык, уведомления', async () => {
    await pg.evaluate(() => { state.view = 'home'; render(); }); await wait(700);
    const before = await pg.evaluate(() => document.documentElement.getAttribute('data-theme') || '');
    await pg.evaluate(() => document.querySelector('#themeBtn').click()); await wait(400);
    const after = await pg.evaluate(() => document.documentElement.getAttribute('data-theme') || '');
    if (before === after) throw new Error('theme unchanged');
    await pg.evaluate(() => document.querySelector('#themeBtn').click()); await wait(300);
    await pg.evaluate(() => document.querySelector('#langBtn').click()); await wait(400);
    const sw = await pg.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Polski/.test(x.textContent)); if (!b) return false; b.click(); return true; });
    if (!sw) throw new Error('lang menu has no Polski');
    await wait(900);
    const lang = await pg.evaluate(() => state.lang);
    if (lang !== 'pl') throw new Error('lang=' + lang);
    const plOk = await pg.evaluate(() => document.body.innerText.includes('Główna'));
    if (!plOk) throw new Error('PL nav not applied');
    await pg.evaluate(() => document.querySelector('#langBtn').click()); await wait(300);
    await pg.evaluate(() => { [...document.querySelectorAll('button')].find(x => /Русский/.test(x.textContent)).click(); }); await wait(800);
    await pg.evaluate(() => document.querySelector('#bellBtn').click()); await wait(600);
    const modal = await pg.evaluate(() => document.body.innerText.includes('Уведомлен'));
    if (!modal) throw new Error('notifications modal not shown');
    await pg.keyboard.press('Escape'); await pg.evaluate(() => { if (typeof closeModal === 'function') closeModal(); }); await wait(300);
  });

  // ── 15. invite family member ──
  await step('UI: пригласить члена семьи в дом', async () => {
    const em = `fam${ts}@t.co`;
    // City gating: registration is only open in cities from /api/cities `open`.
    const cityInfo = (await api('/api/cities')).json;
    const openCity = (cityInfo.open || cityInfo.cities || [])[0];
    const r = await api('/api/register', 'POST', { email: em, password: PASS, name: 'Fam', role: 'customer', phone: '+48500600712', city: openCity, acceptedTerms: true });
    if (r.status !== 200) throw new Error('fam register ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 120));
    await pg.evaluate(() => { state.view = 'properties'; render(); }); await wait(800);
    const had = await pg.evaluate(() => { const b = document.querySelector('[data-invite]'); if (!b) return false; b.click(); return true; });
    if (!had) throw new Error('no invite button');
    await wait(500);
    await pg.evaluate((e) => { document.querySelector('#iv').value = e; document.querySelector('#doInvite').click(); }, em);
    await wait(1200);
    const okChip = await pg.evaluate(() => document.body.innerText.includes('Fam'));
    if (!okChip) throw new Error('member chip not shown');
  });

  // ── 16. logout + login via UI ──
  await step('UI: выйти и войти снова', async () => {
    await pg.evaluate(() => document.querySelector('#meBtn').click()); await wait(600);
    const out = await clickText('Выйти'); if (!out) throw new Error('no logout button');
    await wait(900);
    const authShown = await pg.evaluate(() => !!document.querySelector('#authCard'));
    if (!authShown) throw new Error('auth screen not shown after logout');
    await pg.evaluate(([em, pw]) => {
      const card = document.querySelector('#authCard');
      const set = (sel, v) => { const e = card.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
      set('input[name="email"]', em); set('input[name="password"]', pw);
      card.querySelector('button[type="submit"]').click();
    }, [EMAIL, PASS]);
    await wait(1500);
    const user = await pg.evaluate(() => state.user && state.user.email);
    if (user !== EMAIL) throw new Error('login failed, user=' + user);
  });

  // ── 17-20. cleaner side: standard job lifecycle via the same API the app calls ──
  const custTok = await pg.evaluate(() => localStorage.getItem('cg_token'));
  let cleanTok = null;
  await step('Исполнитель: вход (сид-аккаунт) и приём заказа', async () => {
    const l = await api('/api/login', 'POST', { email: 'piotr@example.com', password: 'cleango123' });
    if (l.status !== 200) throw new Error('piotr login ' + l.status);
    cleanTok = l.json.token;
    const acc = await api(`/api/bookings/${bookingId}/accept`, 'POST', {}, cleanTok);
    if (acc.status !== 200) throw new Error('accept ' + acc.status + ' ' + JSON.stringify(acc.json).slice(0, 80));
  });
  await step('UI: чат заказа — отправить сообщение (заказ активен)', async () => {
    await pg.evaluate((id) => openBooking(id), bookingId); await wait(1100);
    const has = await pg.evaluate(() => !!document.querySelector('#chatInput'));
    if (!has) throw new Error('chat input not present on accepted booking');
    await pg.evaluate(() => { const i = document.querySelector('#chatInput'); i.value = 'Тест сообщение'; i.dispatchEvent(new Event('input')); document.querySelector('#chatSend').click(); });
    await wait(1000);
    const sent = await pg.evaluate(() => document.body.innerText.includes('Тест сообщение'));
    if (!sent) throw new Error('message not in thread');
  });
  await step('Исполнитель: выехал → фото «до» → начал → фото «после» → завершил (оплата)', async () => {
    let r = await api(`/api/bookings/${bookingId}/enroute`, 'POST', {}, cleanTok);
    if (r.status !== 200) throw new Error('enroute ' + r.status);
    r = await api(`/api/bookings/${bookingId}/photos`, 'POST', { phase: 'before', photo: IMG }, cleanTok);
    if (r.status !== 200) throw new Error('before photo ' + r.status);
    r = await api(`/api/bookings/${bookingId}/status`, 'POST', { status: 'in_progress' }, cleanTok);
    if (r.status !== 200) throw new Error('start ' + r.status);
    r = await api(`/api/bookings/${bookingId}/photos`, 'POST', { phase: 'after', photo: IMG }, cleanTok);
    if (r.status !== 200) throw new Error('after photo ' + r.status);
    r = await api(`/api/bookings/${bookingId}/status`, 'POST', { status: 'completed' }, cleanTok);
    if (r.status !== 200) throw new Error('complete ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 100));
    const bk = await api(`/api/bookings/${bookingId}`, 'GET', null, custTok);
    if (bk.json.booking.status !== 'completed') throw new Error('status=' + bk.json.booking.status);
    if (!bk.json.booking.paid) throw new Error('not paid after completion');
  });
  await step('Клиент: оставить отзыв ★5', async () => {
    const r = await api(`/api/bookings/${bookingId}/review`, 'POST', { quality: 5, punctuality: 5, communication: 5, text: 'Отлично!' }, custTok);
    if (r.status !== 200) throw new Error('review ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 80));
  });
  await step('UI: чат закрыт после завершения заказа (по спецификации)', async () => {
    await pg.evaluate((id) => openBooking(id), bookingId); await wait(1100);
    const closed = await pg.evaluate(() => document.body.innerText.includes('Чат закрыт'));
    if (!closed) throw new Error('closed-chat notice not shown');
  });

  // ── 21-24. STR turnover lifecycle incl. QC + problem ──
  let tId = null;
  await step('Аренда: уборка-турновер — приём, QC-гейт (мало фото), 3 фото, завершение', async () => {
    const s = await api(`/api/properties/${strId}/str`, 'GET', null, custTok);
    const scheduled = s.json.str.turnovers.find(x => x.status === 'scheduled');
    if (!scheduled) throw new Error('no scheduled turnover');
    tId = scheduled.bookingId;
    let r = await api(`/api/bookings/${tId}/accept`, 'POST', {}, cleanTok);
    if (r.status !== 200) throw new Error('accept ' + r.status);
    await api(`/api/bookings/${tId}/enroute`, 'POST', {}, cleanTok);
    await api(`/api/bookings/${tId}/photos`, 'POST', { phase: 'before', photo: IMG }, cleanTok);
    await api(`/api/bookings/${tId}/status`, 'POST', { status: 'in_progress' }, cleanTok);
    await api(`/api/bookings/${tId}/photos`, 'POST', { phase: 'after', photo: IMG }, cleanTok);
    r = await api(`/api/bookings/${tId}/status`, 'POST', { status: 'completed' }, cleanTok);
    if (r.status !== 400 || r.json.code !== 'QC_PHOTOS') throw new Error('QC gate did not block: ' + r.status + ' ' + (r.json.code || ''));
    await api(`/api/bookings/${tId}/photos`, 'POST', { phase: 'after', photo: IMG }, cleanTok);
    await api(`/api/bookings/${tId}/photos`, 'POST', { phase: 'after', photo: IMG }, cleanTok);
    r = await api(`/api/bookings/${tId}/status`, 'POST', { status: 'completed' }, cleanTok);
    if (r.status !== 200) throw new Error('complete after 3 photos: ' + r.status + ' ' + JSON.stringify(r.json).slice(0, 100));
  });
  await step('Аренда: исполнитель сообщает проблему — владельцу приходит уведомление', async () => {
    const r = await api(`/api/bookings/${tId}/turnover-problem`, 'POST', { kind: 'damage', note: 'Разбита чашка' }, cleanTok);
    if (r.status !== 200) throw new Error('report ' + r.status);
    const nf = await api('/api/notifications', 'GET', null, custTok);
    const hit = (nf.json.notifications || []).some(n => /Проблема|проблем/.test(n.title + n.body));
    if (!hit) throw new Error('owner notification not found');
  });
  await step('UI: владелец видит QC-бейдж и проблему, жмёт «Решено»', async () => {
    await pg.evaluate(id => openPropView(id), strId); await wait(1500);
    const seen = await pg.evaluate(() => { const t2 = document.body.innerText; return { prb: /Разбита чашка/.test(t2), qc: /Фото ОК|Проверить фото/.test(t2) }; });
    if (!seen.prb) throw new Error('problem not visible to owner');
    if (!seen.qc) throw new Error('QC badge not visible');
    const had = await pg.evaluate(() => { const b = document.querySelector('[data-resolve]'); if (!b) return false; b.click(); return true; });
    if (!had) throw new Error('no Решено button');
    await wait(1400);
    const open = await pg.evaluate(() => ssData.status.openProblems);
    if (open !== 0) throw new Error('openProblems=' + open);
  });
  await step('UI: удалить бронирование через форму', async () => {
    await pg.evaluate(() => { document.querySelector('#ssRes .card').click(); }); await wait(500);
    await pg.evaluate(() => document.querySelector('#rdel').click()); await wait(1300);
    const n = await pg.evaluate(() => ssData.reservations.length);
    if (n !== 2) throw new Error('after delete reservations=' + n);
  });

  // ── 25. admin panel ──
  await step('Админ: панель пользователей открывается, профиль доступен', async () => {
    const a = await api('/api/login', 'POST', { email: 'admin@cleango.app', password: 'cleango123' });
    if (a.status !== 200) throw new Error('admin login ' + a.status);
    const pg2 = await br.newPage({ viewport: { width: 1100, height: 900 } });
    pg2.on('pageerror', e => consoleErrs.push('ADMIN PAGEERR ' + e.message.slice(0, 100)));
    await pg2.goto(B);
    await pg2.evaluate(t2 => localStorage.setItem('cg_token', t2), a.json.token);
    await pg2.reload(); await pg2.waitForTimeout(1400);
    const isAdmin = await pg2.evaluate(() => state.user && state.user.role === 'admin');
    if (!isAdmin) throw new Error('not admin in UI');
    const hasUsers = await pg2.evaluate(() => document.body.innerText.includes('E2E Тест') || document.body.innerText.includes('Пользовател'));
    if (!hasUsers) throw new Error('admin view has no users section');
    await pg2.close();
  });

  await br.close();
  console.log('==================== RESULTS ====================');
  for (const [st, name, note] of results) console.log(`${st === 'PASS' ? '✓' : '✗ FAIL'}  ${name}${note ? '  →  ' + note : ''}`);
  const fails = results.filter(r => r[0] === 'FAIL').length;
  console.log('-------------------------------------------------');
  console.log(`${results.length - fails}/${results.length} actions passed · console errors: ${consoleErrs.length}`);
  if (consoleErrs.length) console.log('CONSOLE:', JSON.stringify([...new Set(consoleErrs)].slice(0, 5)));
  process.exit(fails || consoleErrs.length ? 1 : 0);
})().catch(e => { console.error('E2E DRIVER CRASH:', e.message); process.exit(1); });
