import { api } from './api.js';
import { store, setUser, onUserChange, modal, closeModal } from './state.js';
import { $, esc } from './format.js';
import { openAuth, logout, verifyFunds } from './auth.js';
import { renderBrowse, setSearchQuery } from './views/browse.js';
import { renderListing } from './views/listing.js';
import { renderSell } from './views/sell.js';
import { renderGarage } from './views/garage.js';
import { renderSold, renderWanted } from './views/boards.js';
import { openNotifications, refreshNotifications, startNotificationPolling, stopNotificationPolling } from './notifications.js';

const view = document.getElementById('view');

const NAV = [
  ['#/browse', 'Browse'],
  ['#/sold', 'Sold prices'],
  ['#/wanted', 'Wanted'],
  ['#/garage', 'My garage']
];

/* ---------------- router ---------------- */

function parseRoute() {
  const hash = location.hash.replace(/^#\/?/, '') || 'browse';
  const [name, param] = hash.split('/');
  return { name, param };
}

async function route() {
  const { name, param } = parseRoute();
  renderNav(name);
  try {
    if (name === 'car' && param) return await renderListing(view, param);
    if (name === 'sell') return renderSell(view);
    if (name === 'garage') return renderGarage(view, param);
    if (name === 'sold') return await renderSold(view);
    if (name === 'wanted') return await renderWanted(view);
    return await renderBrowse(view);
  } catch (err) {
    view.innerHTML = `<div class="page"><div class="empty"><div class="big">⚠️</div>
      ${esc(err.message || 'Something went wrong.')}<br><br>
      <a class="btn btn-outline" href="#/browse">Back to listings</a></div></div>`;
  }
}

window.addEventListener('hashchange', () => {
  window.scrollTo({ top: 0 });
  route();
});

/* ---------------- header ---------------- */

function renderNav(active) {
  document.getElementById('mainNav').innerHTML = NAV.map(([href, label]) =>
    `<a href="${href}" class="${href.includes(active) ? 'on' : ''}">${label}</a>`).join('');
}

function renderHeader() {
  const right = document.getElementById('headerRight');
  const user = store.user;
  const sell = '<a class="btn btn-primary" href="#/sell">+<span class="lbl" style="margin-left:6px">Sell your car</span></a>';
  const menu = '<button class="menu-btn" data-menu aria-label="Menu">☰</button>';

  if (user) {
    const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const bell = `<button class="bell" data-bell aria-label="Notifications">🔔<span class="bell-count" id="bellCount" hidden></span></button>`;
    right.innerHTML = `${sell}
      <a class="btn btn-ghost hide-sm" href="#/garage">My garage<span id="pendingBadge"></span></a>
      ${bell}
      <button class="avatar" title="${esc(user.name)}" data-menu>${esc(initials)}</button>${menu}`;
    right.querySelector('[data-bell]').addEventListener('click', openNotifications);
    refreshBadge();
    refreshNotifications();
  } else {
    right.innerHTML = `<button class="btn btn-ghost hide-sm" data-login>Log in</button>${sell}${menu}`;
    right.querySelector('[data-login]').addEventListener('click', () => openAuth('login'));
  }
  right.querySelectorAll('[data-menu]').forEach((b) => b.addEventListener('click', openMenu));
}

/** Unanswered offers and counters waiting on the user, shown in the header. */
async function refreshBadge() {
  if (!store.user) return;
  try {
    const [received, made] = await Promise.all([
      api.get('/api/offers/received'),
      api.get('/api/offers/made')
    ]);
    const count = received.items.filter((o) => o.status === 'pending').length
      + made.items.filter((o) => o.status === 'countered').length;
    const badge = document.getElementById('pendingBadge');
    if (badge) badge.innerHTML = count ? ` <span class="pill red" style="padding:1px 7px">${count}</span>` : '';
  } catch { /* the badge is a nicety, never a blocker */ }
}

function openMenu() {
  const user = store.user;
  const item = (label, action) => `<button data-go="${action}">${label}</button>`;
  const back = modal(`
    <h2>${esc(user ? user.name : 'Driveway')}</h2>
    <p class="sub">${esc(user ? user.email : 'Buy and sell cars across the USA')}</p>
    <div class="menu-sheet">
      ${item('🔍 Browse cars', '#/browse')}
      ${item('💵 Sold prices', '#/sold')}
      ${item('📋 Wanted board', '#/wanted')}
      ${item('🚗 Sell your car', '#/sell')}
      ${user ? item('🔧 My garage', '#/garage') : ''}
      ${user ? '<button data-bell>🔔 Notifications</button>' : ''}
      ${user && !user.fundsVerified ? '<button data-verify>✅ Verify my funds</button>' : ''}
      ${user ? '<button data-logout>↩︎ Log out</button>' : '<button data-login>👤 Log in</button>'}
    </div>`);

  back.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => { closeModal(); location.hash = b.dataset.go; }));
  back.querySelector('[data-bell]')?.addEventListener('click', () => { closeModal(); openNotifications(); });
  back.querySelector('[data-verify]')?.addEventListener('click', () => { closeModal(); verifyFunds(); });
  back.querySelector('[data-logout]')?.addEventListener('click', () => { closeModal(); logout(); });
  back.querySelector('[data-login]')?.addEventListener('click', () => { closeModal(); openAuth('login'); });
}

/* ---------------- boot ---------------- */

document.getElementById('hdrSearch').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  setSearchQuery(e.target.value.trim());
  if (parseRoute().name === 'browse') route();
  else location.hash = '#/browse';
});

onUserChange((user) => {
  renderHeader();
  if (user) startNotificationPolling();
  else stopNotificationPolling();
  route();
});

(async function boot() {
  try {
    const [me, meta] = await Promise.all([
      api.get('/api/auth/me').catch(() => ({ user: null })),
      api.get('/api/meta')
    ]);
    store.meta = meta;
    store.user = me.user;
    if (me.user?.zip && !store.zip) store.setZip(me.user.zip);
  } catch {
    // The API is unreachable; still render the shell so the page is not blank.
  }
  renderHeader();
  route();
  if (store.user) startNotificationPolling();
})();
