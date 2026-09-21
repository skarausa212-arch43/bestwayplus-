/**
 * i18n leak audit — walks the customer-facing screens in every non-Russian
 * language and reports Russian text that survived translation.
 *
 *   node ops/i18n-audit.js          (server must be running on :4000)
 *
 * Detection is per language, because "contains Cyrillic" is only wrong for
 * Ukrainian:
 *   en/pl — any Cyrillic letter in a visible text node is a leak;
 *   uk    — Cyrillic is the alphabet, so only the four letters Russian has
 *           and Ukrainian does not (ы э ъ ё) mark a leak.
 *
 * The walk covers the screens, the booking steps and the modals a customer
 * actually meets, including placeholder/title/aria-label attributes — the DOM
 * translation pass has a separate branch for those, and it can rot on its own.
 *
 * Run it against a FRESH seed (delete data/ and restart): the seed's labels
 * are Latin, so anything Cyrillic is a real leak. On a lived-in store the
 * customer's own property names and notes are legitimately Cyrillic and will
 * read as false positives — user-entered content is never translated.
 *
 * Exit code 1 when anything leaked, so it can gate a release.
 */
'use strict';
let chromium;
try { ({ chromium } = require('playwright-core')); }
catch {
  // Resolved relative to the caller too, so `npm i -D playwright-core` in any
  // parent works; the project itself stays zero-dependency.
  try { ({ chromium } = require(require.resolve('playwright-core', { paths: [process.cwd(), process.env.PW_DIR || ''] }))); }
  catch { console.error('нужен playwright-core: npm i playwright-core (или задайте PW_DIR)'); process.exit(2); }
}

const BASE = process.env.LUMI_BASE || 'http://127.0.0.1:4000';
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const LANGS = ['en', 'pl', 'uk'];

// What counts as a leak, per language.
const LEAK_RE = {
  en: /[А-Яа-яЁёІіЇїЄєҐґ]/,
  pl: /[А-Яа-яЁёІіЇїЄєҐґ]/,
  uk: /[ЫыЭэЪъЁё]/,
};
// Things that legitimately contain Cyrillic in any language: user-entered data
// from the demo seed (names, bios, addresses), and the language switcher's
// native names. Selector-based, not string-based, so real leaks can't hide.
const SKIP_SEL = '[data-noi18n]';

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const leaks = new Map();   // "lang :: screen :: text" -> true (dedup)
  const add = (lang, screen, text) => {
    const key = `${lang} :: ${screen} :: ${text}`;
    if (!leaks.has(key)) leaks.set(key, { lang, screen, text });
  };

  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 1280 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => add(lang, 'PAGE ERROR', e.message.slice(0, 120)));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'anna@example.com', password: 'cleango123' }) });
      const j = await r.json(); localStorage.setItem('cg_token', j.token);
    });
    await page.evaluate((l) => localStorage.setItem('lumi_lang', l), lang);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    /** Harvest every visible text node + translatable attribute on the page. */
    const harvest = async (screen) => {
      await page.waitForTimeout(450);   // let the MutationObserver pass run
      const texts = await page.evaluate((skipSel) => {
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(n) {
          const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
          if (['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'].includes(p.nodeName)) return NodeFilter.FILTER_REJECT;
          if (p.closest(skipSel)) return NodeFilter.FILTER_REJECT;
          const st = getComputedStyle(p);
          if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
          return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        } });
        let n; while ((n = w.nextNode())) out.push(n.nodeValue.trim());
        document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((e) => {
          if (e.closest(skipSel)) return;
          ['placeholder', 'title', 'aria-label'].forEach((a) => {
            const v = e.getAttribute(a); if (v && v.trim()) out.push('[attr] ' + v.trim());
          });
        });
        return out;
      }, SKIP_SEL);
      const re = LEAK_RE[lang];
      for (const txt of texts) if (re.test(txt)) add(lang, screen, txt.slice(0, 90));
    };

    const go = async (fn) => { await page.evaluate(fn); };
    const closeAnyModal = () => page.evaluate(() => { const m = document.querySelector('.modal-bg'); if (m) m.remove(); });

    // ── the walk ──
    await harvest('home');

    await go(() => { state.view = 'properties'; render(); });
    await harvest('properties');
    await go(() => openPropertyForm());
    await harvest('property-form');
    await closeAnyModal();

    // property smart-home view (first home)
    const hasProp = await page.evaluate(() => (state.properties || []).length > 0);
    if (hasProp) {
      await go(() => openPropView(state.properties[0].id));
      await harvest('smart-home');
    }

    // booking: cleaning steps 0..3
    await go(() => startBooking('standard'));
    await harvest('book-cleaning-0');
    for (let s = 1; s <= 3; s++) {
      await go(() => { state.draft.step++; viewBook(); });
      await harvest('book-cleaning-' + s);
    }
    // windows step 0 + extras
    await go(() => startBooking('windows'));
    await harvest('book-windows-0');
    await page.evaluate(() => { const o = document.querySelector('#winSide .opt[data-side=outside]'); if (o) o.click(); });
    await harvest('book-windows-0-outside');
    await go(() => { state.draft.step = 1; viewBook(); });
    await harvest('book-windows-extras');
    // garden inline
    await go(() => startBooking('garden'));
    await harvest('book-garden');

    await go(() => { state.view = 'bookings'; render(); });
    await harvest('bookings');
    // first booking's detail, when the seed has one
    const bkId = await page.evaluate(async () => {
      try { const r = await api('/api/bookings'); return (r.bookings && r.bookings[0] && r.bookings[0].id) || null; }
      catch { return null; }
    });
    if (bkId) {
      await page.evaluate((id) => openBooking(id), bkId);
      await harvest('booking-detail');
    }

    await go(() => { state.view = 'wallet'; render(); });
    await harvest('wallet');
    await go(() => { state.view = 'premium'; render(); });
    await harvest('premium');
    await go(() => { state.view = 'messages'; render(); });
    await harvest('messages');

    // ── customer modals: completed order → receipt button, issue flow,
    //    provider profile, support. The receipt itself is deliberately Polish
    //    for every viewer (a document, not UI) and carries data-noi18n. ──
    const doneId = await page.evaluate(async () => {
      try { const r = await api('/api/bookings'); const d = (r.bookings || []).find((b) => b.status === 'completed'); return d ? d.id : null; }
      catch { return null; }
    });
    if (doneId) {
      await page.evaluate((id) => openBooking(id), doneId);
      await harvest('booking-completed');
      await page.evaluate((id) => openIssue(id), doneId);
      await harvest('issue-modal');
      await closeAnyModal();
    }
    const clnId = await page.evaluate(async () => {
      try { const r = await api('/api/cleaners/recommended'); return (r.cleaners && r.cleaners[0] && r.cleaners[0].id) || null; }
      catch { return null; }
    });
    if (clnId) {
      await page.evaluate((id) => openCleanerProfile(id), clnId);
      await harvest('cleaner-profile');
      await closeAnyModal();
    }
    await page.evaluate(() => openSupport());
    await harvest('support-modal');
    await closeAnyModal();

    await ctx.close();

    // ── the provider's side of the app, same detector ──
    const cctx = await browser.newContext({ viewport: { width: 800, height: 1280 } });
    const cpage = await cctx.newPage();
    cpage.on('pageerror', (e) => add(lang, 'PAGE ERROR (cleaner)', e.message.slice(0, 120)));
    await cpage.goto(BASE, { waitUntil: 'networkidle' });
    await cpage.evaluate(async () => {
      const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'piotr@example.com', password: 'cleango123' }) });
      const j = await r.json(); localStorage.setItem('cg_token', j.token);
    });
    await cpage.evaluate((l) => localStorage.setItem('lumi_lang', l), lang);
    await cpage.reload({ waitUntil: 'networkidle' });
    const charvest = async (screen) => {
      await cpage.waitForTimeout(450);
      const texts = await cpage.evaluate((skipSel) => {
        const out = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode(n) {
          const p = n.parentElement; if (!p) return NodeFilter.FILTER_REJECT;
          if (['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT'].includes(p.nodeName)) return NodeFilter.FILTER_REJECT;
          if (p.closest(skipSel)) return NodeFilter.FILTER_REJECT;
          const st = getComputedStyle(p);
          if (st.display === 'none' || st.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
          return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        } });
        let n; while ((n = w.nextNode())) out.push(n.nodeValue.trim());
        document.querySelectorAll('[placeholder],[title],[aria-label]').forEach((e) => {
          if (e.closest(skipSel)) return;
          ['placeholder', 'title', 'aria-label'].forEach((a) => {
            const v = e.getAttribute(a); if (v && v.trim()) out.push('[attr] ' + v.trim());
          });
        });
        return out;
      }, SKIP_SEL);
      const re = LEAK_RE[lang];
      for (const txt of texts) if (re.test(txt)) add(lang, 'cleaner:' + screen, txt.slice(0, 90));
    };
    await charvest('jobs');
    for (const v of ['bookings', 'earnings', 'wallet', 'messages']) {
      await cpage.evaluate((vv) => { state.view = vv; render(); }, v);
      await charvest(v);
    }
    // the provider's own first job, when the seed has one
    const jobId = await cpage.evaluate(async () => {
      try { const r = await api('/api/bookings'); return (r.bookings && r.bookings[0] && r.bookings[0].id) || null; }
      catch { return null; }
    });
    if (jobId) {
      await cpage.evaluate((id) => openBooking(id), jobId);
      await charvest('job-detail');
    }
    await cctx.close();
  }
  await browser.close();

  // ── report ──
  const all = [...leaks.values()];
  const byLang = {};
  for (const l of all) (byLang[l.lang] = byLang[l.lang] || []).push(l);
  console.log('\ni18n audit — русский текст на нерусских языках');
  console.log('─'.repeat(64));
  if (!all.length) console.log('  ✓ утечек не найдено');
  for (const lang of LANGS) {
    const list = byLang[lang] || [];
    if (!list.length) { console.log(`  ${lang}: чисто`); continue; }
    console.log(`  ${lang}: ${list.length} утечек`);
    const byScreen = {};
    for (const l of list) (byScreen[l.screen] = byScreen[l.screen] || []).push(l.text);
    for (const [screen, texts] of Object.entries(byScreen)) {
      console.log(`    · ${screen}`);
      [...new Set(texts)].slice(0, 40).forEach((t) => console.log(`        «${t}»`));
    }
  }
  console.log('─'.repeat(64));
  console.log(all.length ? `✗ всего утечек: ${all.length}` : '✓ все языки чистые');
  process.exit(all.length ? 1 : 0);
})().catch((e) => { console.error('AUDIT CRASH:', e.message); process.exit(2); });
