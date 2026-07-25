/**
 * LUMI full product lifecycle — от регистрации до выплаты денег.
 *
 * Walks the entire money path end-to-end over HTTP, asserting the balance at
 * every stage: customer + provider sign-up, KYC verify, property, booking,
 * accept → en route → before-photo → start → after-photo → complete →
 * settlement (provider credited, commission withheld, hidden from customer),
 * receipts, weekly bank-payout settle (wallet zeroed + ledger). Plus the
 * garden vertical, LUMI+ 5% cashback, and the 40%-after-departure cancel fee.
 *
 *   LUMI_E2E_URL=http://localhost:4000 node ops/lifecycle-check.js
 * Needs seed admin (admin@cleango.app / cleango123). Exits non-zero on failure.
 */
const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const api = async (p, m, b, tok) => {
  const r = await fetch(B + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined });
  let j = {}; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
};
const R = [];
let stage = 0;
const step = async (name, fn) => { stage++; try { const info = await fn(); R.push(['PASS', `${stage}. ${name}`, info || '']); } catch (e) { R.push(['FAIL', `${stage}. ${name}`, String(e.message || e).slice(0, 200)]); throw e; } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const ts = Date.now();

(async () => {
  const cfg = (await api('/api/cities')).json;
  const CITY = (cfg.open || cfg.cities || ['Wrocław'])[0];
  const gardenCity = ((await api('/api/ogrod/config')).json.cities || ['Wrocław'])[0];
  const admin = (await api('/api/login', 'POST', { email: 'admin@cleango.app', password: 'cleango123' })).json.token;
  ok(admin, 'admin login');
  let cust, cleaner, cleanerId, prop, booking, commission, payout, price, this_g;

  // ═════════ CLEANING LIFECYCLE ═════════
  await step('Клиент регистрируется', async () => {
    const r = await api('/api/register', 'POST', { name: 'Клиент Лайфцикл', email: `lc-cust${ts}@t.co`, password: 'averylongpassword12', phone: '+48511000001', role: 'customer', city: CITY, acceptedTerms: true });
    eq(r.status, 200, 'register'); cust = r.json.token;
    return `token ok, city ${CITY}`;
  });
  await step('Исполнитель регистрируется (KYC pending)', async () => {
    const r = await api('/api/register', 'POST', { name: 'Пётр Исполнитель', email: `lc-clean${ts}@t.co`, password: 'averylongpassword12', phone: '+48511000002', role: 'cleaner', city: CITY, teamSize: 2, acceptedTerms: true, professions: ['cleaning'], entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27114020040000300201355387', bio: 'Опыт 5 лет, генеральная и послеремонтная уборка, своё оборудование.' });
    eq(r.status, 200, 'register cleaner'); cleaner = r.json.token; cleanerId = r.json.user.id;
    ok(!r.json.user.verified, 'cleaner starts unverified');
    return 'unverified, awaiting KYC';
  });
  await step('Админ подтверждает KYC исполнителя', async () => {
    const v = await api('/api/admin/verify-cleaner', 'POST', { cleanerId, verified: true }, admin);
    eq(v.status, 200, 'verify'); ok(v.json.user.verified, 'now verified');
  });
  await step('Исполнитель выходит на линию (online)', async () => {
    const r = await api('/api/cleaner/online', 'POST', { online: true }, cleaner);
    eq(r.status, 200, 'online');
  });
  await step('Клиент добавляет дом', async () => {
    const r = await api('/api/properties', 'POST', { type: 'house', label: 'Дом клиента', city: CITY, rooms: 3, baths: 2, address: 'ul. Testowa 5' }, cust);
    eq(r.status, 200, 'property'); prop = r.json.property; return prop.label;
  });
  await step('Клиент создаёт заказ — цена считается на сервере', async () => {
    const r = await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'deep', rooms: 3, baths: 2 }, cust);
    eq(r.status, 200, 'booking'); booking = r.json.booking; price = booking.price;
    ok(price > 0, 'price computed');
    eq(booking.status, 'searching', 'searching');
    eq(booking.commission, undefined, 'commission hidden from customer');
    eq(booking.payout, undefined, 'payout hidden from customer');
    return `${price} zł · deep clean`;
  });
  await step('Исполнитель видит заказ на доске и цену НЕ видит', async () => {
    const board = await api('/api/bookings', 'GET', null, cleaner);
    const mine = board.json.bookings.find((x) => x.id === booking.id);
    ok(mine, 'on the board'); eq(mine.price, undefined, 'price hidden from provider');
    ok(mine.payout > 0, 'provider sees own payout'); payout = mine.payout;
    return `payout ${payout} zł`;
  });
  await step('Проверка экономики: payout + комиссия = цена, комиссия 15%', async () => {
    // Admin sees every booking via the role-filtered list, with commission.
    const adminView = (await api('/api/bookings', 'GET', null, admin)).json.bookings.find((x) => x.id === booking.id);
    ok(adminView, 'admin sees the booking'); commission = adminView.commission;
    ok(commission > 0, 'admin sees commission');
    eq(payout + commission, price, 'payout + commission === price');
    const rate = Math.round((commission / price) * 100);
    eq(rate, 15, 'commission rate is 15%');
    return `payout ${payout} + fee ${commission} = ${price} (${rate}%)`;
  });
  await step('Исполнитель принимает заказ', async () => {
    const r = await api(`/api/bookings/${booking.id}/accept`, 'POST', {}, cleaner);
    eq(r.status, 200, 'accept'); eq(r.json.booking.status, 'accepted', 'accepted');
  });
  await step('Исполнитель выезжает (en route, ETA)', async () => {
    const r = await api(`/api/bookings/${booking.id}/enroute`, 'POST', {}, cleaner);
    eq(r.status, 200, 'enroute'); eq(r.json.booking.status, 'on_the_way', 'on the way');
    ok(r.json.booking.etaMinutes >= 0, 'ETA set');
    return `ETA ${r.json.booking.etaMinutes} мин`;
  });
  await step('Нельзя начать без фото «до» (400)', async () => {
    const r = await api(`/api/bookings/${booking.id}/status`, 'POST', { status: 'in_progress' }, cleaner);
    eq(r.status, 400, 'blocked without before photo');
  });
  await step('Фото «до» → старт уборки', async () => {
    await api(`/api/bookings/${booking.id}/photos`, 'POST', { phase: 'before', photo: IMG }, cleaner);
    const r = await api(`/api/bookings/${booking.id}/status`, 'POST', { status: 'in_progress' }, cleaner);
    eq(r.status, 200, 'start'); eq(r.json.booking.status, 'in_progress', 'in progress');
  });
  await step('Посторонний не может завершить чужой заказ (403)', async () => {
    const r = await api(`/api/bookings/${booking.id}/status`, 'POST', { status: 'completed' }, cust);
    eq(r.status, 403, 'customer cannot complete');
  });
  await step('Фото «после» → завершение + расчёт (деньги исполнителю)', async () => {
    const before = (await api('/api/me', 'GET', null, cleaner)).json.user.wallet || 0;
    await api(`/api/bookings/${booking.id}/photos`, 'POST', { phase: 'after', photo: IMG }, cleaner);
    const r = await api(`/api/bookings/${booking.id}/status`, 'POST', { status: 'completed' }, cleaner);
    eq(r.status, 200, 'complete'); eq(r.json.booking.status, 'completed', 'completed');
    const after = (await api('/api/me', 'GET', null, cleaner)).json.user.wallet || 0;
    eq(Math.round((after - before) * 100), Math.round(payout * 100), 'wallet credited exactly the payout');
    return `wallet +${payout} zł → ${after} zł`;
  });
  await step('Чек клиента — итого без комиссии; чек исполнителя — только выплата', async () => {
    const cRec = (await api(`/api/bookings/${booking.id}/receipt`, 'GET', null, cust)).json.receipt;
    eq(cRec.total, price, 'customer sees total'); eq(cRec.commission, undefined, 'no commission on customer receipt');
    eq(cRec.payout, undefined, 'no payout on customer receipt');
    const pRec = (await api(`/api/bookings/${booking.id}/receipt`, 'GET', null, cleaner)).json.receipt;
    eq(pRec.payout, payout, 'provider sees payout'); eq(pRec.commission, undefined, 'no commission on provider receipt');
    const aRec = (await api(`/api/bookings/${booking.id}/receipt`, 'GET', null, admin)).json.receipt;
    eq(aRec.commission, commission, 'admin sees commission');
    return 'role-shaped receipts ok';
  });
  await step('Клиент оставляет отзыв ★5', async () => {
    const r = await api(`/api/bookings/${booking.id}/review`, 'POST', { rating: 5, comment: 'Отлично!' }, cust);
    ok(r.status === 200, 'review accepted');
  });

  // ═════════ WEEKLY BANK PAYOUT ═════════
  await step('Админ формирует список выплат (вторник) — исполнитель с балансом', async () => {
    const r = await api('/api/admin/payouts', 'GET', null, admin);
    eq(r.status, 200, 'payouts list');
    const row = r.json.cleaners.find((c) => c.id === cleanerId);
    ok(row, 'cleaner in payout batch'); eq(row.amount, Math.round(payout), 'amount = accrued payout');
    ok(row.bankAccount && row.bankName, 'IBAN + bank present for the transfer');
    return `${row.name}: ${row.amount} zł → ${row.bankAccount}`;
  });
  await step('Админ проводит выплату — баланс исполнителя обнуляется', async () => {
    const r = await api('/api/admin/payouts/settle', 'POST', { ids: [cleanerId] }, admin);
    eq(r.status, 200, 'settle'); ok(r.json.settled >= 1, 'settled count');
    const wallet = (await api('/api/me', 'GET', null, cleaner)).json.user.wallet || 0;
    eq(Math.round(wallet), 0, 'wallet zeroed after bank payout');
    return `paid ${r.json.total} zł, wallet → 0`;
  });
  await step('Повторная выплата — идемпотентна (нечего платить)', async () => {
    const r = await api('/api/admin/payouts/settle', 'POST', { ids: [cleanerId] }, admin);
    eq(r.json.settled, 0, 'nothing to settle twice');
  });

  // ═════════ GARDEN VERTICAL ═════════
  await step('Садовник регистрируется с профессией «Сад»', async () => {
    const r = await api('/api/register', 'POST', { name: 'Зофия Садовник', email: `lc-gard${ts}@t.co`, password: 'averylongpassword12', phone: '+48511000003', role: 'cleaner', city: gardenCity, teamSize: 1, acceptedTerms: true, professions: ['garden'], equipment: ['g_mower', 'g_trimmer'], entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'PKO', bankAccount: 'PL61109010140000071219812874', bio: 'Уход за газоном, живой изгородью и клумбами, своё оборудование.' });
    eq(r.status, 200, 'garden reg'); this_g = r.json;
    eq(JSON.stringify(r.json.user.professions), JSON.stringify(['garden']), 'garden profession stored');
    await api('/api/admin/verify-cleaner', 'POST', { cleanerId: r.json.user.id, verified: true }, admin);
    await api('/api/cleaner/online', 'POST', { online: true }, r.json.token);
    return 'verified + online';
  });
  let gTok, gId, gBk, gPayout;
  await step('Клиент заказывает Сад — цена с сервера, город Wrocław', async () => {
    gTok = this_g.token; gId = this_g.user.id;
    const nextYear = new Date().getFullYear() + 1;
    const r = await api('/api/bookings', 'POST', { service: 'garden', city: gardenCity, address: 'ul. Ogrodowa 9', garden: { koszenie: true, lawnM2: 500, mowFrequency: 'coTydzien', removeClippings: true }, scheduledFor: `${nextYear}-07-15T10:00`, price: 1 }, cust);
    eq(r.status, 200, 'garden booking'); gBk = r.json.booking;
    // 500 m² @ 1.00 = 500, -20% = 400, +40 wywóz = 440
    eq(gBk.price, 440, 'server price (not the tampered 1)');
    eq(gBk.serviceLabel, 'Ogród', 'garden label');
    return `${gBk.price} zł`;
  });
  await step('Только садовник видит/берёт садовый заказ (клинер — 403)', async () => {
    const steal = await api(`/api/bookings/${gBk.id}/accept`, 'POST', {}, cleaner);
    eq(steal.status, 403, 'cleaner blocked'); eq(steal.json.code, 'PROFESSION_MISMATCH', 'profession guard');
    const take = await api(`/api/bookings/${gBk.id}/accept`, 'POST', {}, gTok);
    eq(take.status, 200, 'gardener accepts');
    const mine = (await api('/api/bookings', 'GET', null, gTok)).json.bookings.find((x) => x.id === gBk.id);
    gPayout = mine.payout; ok(gPayout > 0, 'gardener payout'); eq(mine.price, undefined, 'price hidden from provider');
    return `payout ${gPayout} zł`;
  });
  await step('Садовый заказ проходит до завершения и оплаты', async () => {
    await api(`/api/bookings/${gBk.id}/enroute`, 'POST', {}, gTok);
    await api(`/api/bookings/${gBk.id}/photos`, 'POST', { phase: 'before', photo: IMG }, gTok);
    await api(`/api/bookings/${gBk.id}/status`, 'POST', { status: 'in_progress' }, gTok);
    await api(`/api/bookings/${gBk.id}/photos`, 'POST', { phase: 'after', photo: IMG }, gTok);
    const before = (await api('/api/me', 'GET', null, gTok)).json.user.wallet || 0;
    const r = await api(`/api/bookings/${gBk.id}/status`, 'POST', { status: 'completed' }, gTok);
    eq(r.status, 200, 'garden complete');
    const after = (await api('/api/me', 'GET', null, gTok)).json.user.wallet || 0;
    eq(Math.round((after - before) * 100), Math.round(gPayout * 100), 'gardener credited payout');
    return `wallet +${gPayout} zł`;
  });

  // ═════════ LUMI+ CASHBACK ═════════
  await step('Клиент оформляет LUMI+ и получает 5% кэшбека с заказа', async () => {
    const sub = await api('/api/subscribe', 'POST', {}, cust);
    ok(sub.status === 200, 'subscribed to LUMI+');
    const p2 = await api('/api/properties', 'POST', { type: 'apartment', label: 'Квартира', city: CITY, rooms: 2, baths: 1 }, cust);
    const bk2 = (await api('/api/bookings', 'POST', { propertyId: p2.json.property.id, service: 'standard' }, cust)).json.booking;
    // LUMI+ perk: the cleaner responds, then the customer picks them.
    await api(`/api/bookings/${bk2.id}/accept`, 'POST', {}, cleaner);
    const chose = await api(`/api/bookings/${bk2.id}/choose`, 'POST', { cleanerId: cleanerId }, cust);
    eq(chose.status, 200, 'LUMI+ customer chooses the responder');
    await api(`/api/bookings/${bk2.id}/enroute`, 'POST', {}, cleaner);
    await api(`/api/bookings/${bk2.id}/photos`, 'POST', { phase: 'before', photo: IMG }, cleaner);
    await api(`/api/bookings/${bk2.id}/status`, 'POST', { status: 'in_progress' }, cleaner);
    await api(`/api/bookings/${bk2.id}/photos`, 'POST', { phase: 'after', photo: IMG }, cleaner);
    const walletBefore = (await api('/api/me', 'GET', null, cust)).json.user.wallet || 0;
    await api(`/api/bookings/${bk2.id}/status`, 'POST', { status: 'completed' }, cleaner);
    const walletAfter = (await api('/api/me', 'GET', null, cust)).json.user.wallet || 0;
    const expected = Math.round(bk2.price * 0.05 * 100) / 100;
    eq(Math.round((walletAfter - walletBefore) * 100), Math.round(expected * 100), '5% cashback credited to LUMI balance');
    return `+${expected} zł cashback (5% of ${bk2.price})`;
  });

  // ═════════ CANCELLATION FEE ═════════
  await step('Отмена после выезда исполнителя удерживает 40%', async () => {
    const p3 = await api('/api/properties', 'POST', { type: 'apartment', label: 'Кв2', city: CITY, rooms: 1, baths: 1 }, cust);
    const bk3 = (await api('/api/bookings', 'POST', { propertyId: p3.json.property.id, service: 'standard' }, cust)).json.booking;
    await api(`/api/bookings/${bk3.id}/accept`, 'POST', {}, cleaner);
    await api(`/api/bookings/${bk3.id}/choose`, 'POST', { cleanerId: cleanerId }, cust);
    await api(`/api/bookings/${bk3.id}/enroute`, 'POST', {}, cleaner);   // departed → 40% applies
    const r = await api(`/api/bookings/${bk3.id}/status`, 'POST', { status: 'cancelled' }, cust);
    eq(r.status, 200, 'cancel after departure');
    eq(r.json.booking.cancellationFee, Math.round(bk3.price * 0.4 * 100) / 100, '40% fee withheld');
    return `fee ${r.json.booking.cancellationFee} zł of ${bk3.price}`;
  });
  await step('Отмена до выезда — бесплатно', async () => {
    const p4 = await api('/api/properties', 'POST', { type: 'apartment', label: 'Кв3', city: CITY, rooms: 1, baths: 1 }, cust);
    const bk4 = (await api('/api/bookings', 'POST', { propertyId: p4.json.property.id, service: 'standard' }, cust)).json.booking;
    const r = await api(`/api/bookings/${bk4.id}/status`, 'POST', { status: 'cancelled' }, cust);
    eq(r.status, 200, 'cancel while searching');
    ok(!r.json.booking.cancellationFee, 'no fee before departure');
  });

  // ── report ──
  console.log('\n════════════ ЖИЗНЕННЫЙ ЦИКЛ: ОТ РЕГИСТРАЦИИ ДО ВЫПЛАТЫ ════════════');
  for (const [s, n, info] of R) console.log(`${s === 'PASS' ? '✓' : '✗'}  ${n}${info ? `   — ${info}` : ''}`);
  const fails = R.filter((r) => r[0] === 'FAIL').length;
  console.log('─'.repeat(66));
  console.log(fails ? `❌ ${fails} FAILED of ${R.length}` : `✅ Все ${R.length} этапов пройдены — от регистрации до выплаты денег.`);
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.log('\n════════════ ЖИЗНЕННЫЙ ЦИКЛ ════════════');
  for (const [s, n, info] of R) console.log(`${s === 'PASS' ? '✓' : '✗'}  ${n}${info ? `   — ${info}` : ''}`);
  console.error('\n💥 ОСТАНОВ:', e.message);
  process.exit(1);
});
