import { el, $, esc } from './format.js';

/** Session user, reference data and the buyer's ZIP, shared by every view. */
export const store = {
  user: null,
  meta: null,
  zip: localStorage.getItem('dw_zip') || '',
  setZip(zip) {
    this.zip = zip;
    try { localStorage.setItem('dw_zip', zip); } catch { /* private mode */ }
  }
};

const listeners = new Set();
export const onUserChange = (fn) => listeners.add(fn);
export function setUser(user) {
  store.user = user;
  listeners.forEach((fn) => fn(user));
}

/* ---------------- modals ---------------- */

let openModal = null;

export function closeModal() {
  if (!openModal) return;
  openModal.remove();
  openModal = null;
  document.body.style.overflow = '';
}

/**
 * Shows a modal built from `html`. Returns the modal element so callers can
 * wire up their own handlers inside it.
 */
export function modal(html, { wide = false } = {}) {
  closeModal();
  const back = el(`<div class="modal-back"><div class="modal ${wide ? 'md' : ''}">
    <button class="modal-x" data-close aria-label="Close">✕</button>${html}</div></div>`);
  back.addEventListener('mousedown', (e) => { if (e.target === back) closeModal(); });
  back.querySelector('[data-close]').addEventListener('click', closeModal);
  document.getElementById('modalRoot').append(back);
  document.body.style.overflow = 'hidden';
  openModal = back;
  const firstField = back.querySelector('input,select,textarea');
  if (firstField) firstField.focus();
  return back;
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

/** Puts a validation error under the matching field, plus a summary at the top. */
export function showFormErrors(root, error) {
  root.querySelectorAll('.err').forEach((n) => n.remove());
  root.querySelectorAll('.bad').forEach((n) => n.classList.remove('bad'));

  const summary = $('[data-form-error]', root);
  if (summary) {
    summary.textContent = error.message;
    summary.hidden = false;
  }
  for (const [field, message] of Object.entries(error.details || {})) {
    const input = root.querySelector(`[name="${CSS.escape(field)}"]`);
    if (!input) continue;
    input.classList.add('bad');
    input.insertAdjacentHTML('afterend', `<div class="err">${esc(message)}</div>`);
  }
}

export function clearFormErrors(root) {
  const summary = $('[data-form-error]', root);
  if (summary) summary.hidden = true;
  root.querySelectorAll('.err').forEach((n) => n.remove());
  root.querySelectorAll('.bad').forEach((n) => n.classList.remove('bad'));
}

/** Collects a form's named fields into a plain object. */
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((input) => {
    out[input.name] = input.type === 'checkbox' ? input.checked : input.value.trim();
  });
  return out;
}
