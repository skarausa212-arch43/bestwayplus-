import { api } from './api.js';
import { store, modal, closeModal, setUser } from './state.js';
import { esc, timeAgo, toast, $ } from './format.js';
import { pulse, stagger } from './motion.js';

/**
 * Notifications live in the header bell. The list is the source of truth —
 * email is a copy, and a seller who turned email off must still find out here
 * that an offer arrived.
 */

let unread = 0;
let polling = null;

export const unreadCount = () => unread;

export async function refreshNotifications({ silent = true } = {}) {
  if (!store.user) {
    unread = 0;
    paintBell();
    return;
  }
  try {
    const { unread: count } = await api.get('/api/notifications');
    const arrived = count > unread;
    unread = count;
    paintBell();
    // Something new landed while the page was open — make the bell say so.
    if (arrived) pulse(document.querySelector('.bell'), 'ring', 900);
  } catch {
    if (!silent) toast('Could not load notifications.');
  }
}

function paintBell() {
  const bell = document.getElementById('bellCount');
  if (!bell) return;
  bell.textContent = unread > 9 ? '9+' : String(unread);
  bell.hidden = unread === 0;
}

/**
 * Polls quietly while the tab is open; a socket is the next step, not this one.
 * Coming back to the tab refreshes immediately — waiting out the interval to
 * find out an offer arrived while you were away is the wrong trade.
 */
export function startNotificationPolling(intervalMs = 60_000) {
  stopNotificationPolling();
  refreshNotifications();
  polling = setInterval(() => {
    if (document.visibilityState === 'visible') refreshNotifications();
  }, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
}

function onVisible() {
  if (document.visibilityState === 'visible') refreshNotifications();
}

export function stopNotificationPolling() {
  if (polling) clearInterval(polling);
  polling = null;
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('focus', onVisible);
}

const ICONS = {
  offer_received: '💰',
  offer_accepted_seller: '🤝',
  offer_accepted_buyer: '🤝',
  offer_countered: '↩️',
  offer_auto_countered: '⚡',
  offer_declined: '🚫',
  offer_withdrawn: '↩︎',
  hold_placed: '🔒',
  deadline_soon: '⏱'
};

export async function openNotifications() {
  const back = modal(`
    <h2>Notifications</h2>
    <p class="sub">Offers, counters and closing deadlines.</p>
    <div id="notifyList"><div class="skeleton" style="height:90px"></div></div>
    <div class="wizard-nav">
      <button class="btn btn-outline btn-sm" data-mark>Mark all read</button>
      <button class="btn btn-outline btn-sm" data-prefs></button>
    </div>`, { wide: true });

  const prefsButton = back.querySelector('[data-prefs]');
  const paintPrefs = () => {
    prefsButton.textContent = store.user?.notifyEmail ? '🔕 Turn emails off' : '🔔 Turn emails on';
  };
  paintPrefs();

  prefsButton.addEventListener('click', async () => {
    const next = !store.user.notifyEmail;
    try {
      await api.patch('/api/me/preferences', { notifyEmail: next });
      setUser({ ...store.user, notifyEmail: next });
      paintPrefs();
      toast(next ? 'Emails back on.' : 'Emails off — you will still see everything here.');
    } catch (err) {
      toast(err.message);
    }
  });

  back.querySelector('[data-mark]').addEventListener('click', async () => {
    await api.post('/api/notifications/read', {});
    unread = 0;
    paintBell();
    closeModal();
    toast('All caught up.');
  });

  let items = [];
  try {
    ({ items } = await api.get('/api/notifications'));
  } catch (err) {
    $('#notifyList', back).innerHTML = `<div class="note bad">${esc(err.message)}</div>`;
    return;
  }

  $('#notifyList', back).innerHTML = items.length
    ? items.map((n) => `
      <div class="dash-item" style="padding:12px;${n.read ? 'opacity:.62' : ''}">
        <div class="avatar" style="background:var(--bg);color:var(--ink)">${ICONS[n.kind] || '🔔'}</div>
        <div class="info">
          <b>${esc(n.title)}</b>
          <span style="white-space:pre-line">${esc(n.body)}</span>
          <span>${timeAgo(n.createdAt)}${n.emailError ? ' · ✉️ email failed' : n.emailSent ? ' · ✉️ emailed' : ''}</span>
        </div>
        ${n.link ? `<div class="actions"><button class="btn btn-outline btn-sm" data-open="${esc(n.link)}">Open</button></div>` : ''}
      </div>`).join('')
    : '<div class="empty"><div class="big">🔔</div>Nothing yet. Offers and counters land here.</div>';

  stagger($('#notifyList', back), '.dash-item', { step: 60 });

  back.querySelectorAll('[data-open]').forEach((button) =>
    button.addEventListener('click', () => {
      closeModal();
      location.hash = `#/${button.dataset.open}`;
    })
  );

  // Opening the list is the read receipt.
  if (items.some((n) => !n.read)) {
    await api.post('/api/notifications/read', {});
    unread = 0;
    paintBell();
  }
}
