/** Formatting and small DOM helpers shared by every view. */

export const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
export const miles = (n) => Number(n || 0).toLocaleString('en-US') + ' mi';
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

export function timeAgo(ts) {
  const h = Math.floor((Date.now() - ts) / 36e5);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function timeLeft(ts) {
  const m = Math.floor((ts - Date.now()) / 6e4);
  if (m <= 0) return 'ended';
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h left`;
  return `${Math.floor(h / 24)}d left`;
}

export const date = (ts) => new Date(ts).toLocaleDateString('en-US');

/** Builds an element from an HTML string. */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/**
 * Delegated click handling: [data-act] attributes instead of inline handlers,
 * which the page's CSP forbids anyway.
 *
 * Views re-render into the same container, so this attaches exactly one
 * listener per element and swaps the handler table on every later call —
 * otherwise each repaint would stack another listener and fire actions twice.
 */
export function onClick(root, handlers) {
  if (root.__actions) {
    root.__actions = handlers;
    return;
  }
  root.__actions = handlers;
  root.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (!target || !root.contains(target)) return;
    const fn = root.__actions[target.dataset.act];
    if (!fn) return;
    e.preventDefault();
    fn(target, e);
  });
}

let toastTimer;
export function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3000);
}
