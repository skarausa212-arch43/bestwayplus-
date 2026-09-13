import { api } from '../api.js';
import { store, modal, closeModal, showFormErrors, clearFormErrors } from '../state.js';
import { money, miles, esc, timeAgo, onClick, $, toast } from '../format.js';
import { emptyState } from '../ui.js';
import { requireAuth } from '../auth.js';

/* ---------------- sold prices ---------------- */

let query = '';

export async function renderSold(root) {
  root.innerHTML = `<div class="page wide">
    <h1>Sold prices</h1>
    <p class="lead">What cars <b>actually sold for</b> on Driveway — accepted offers, not asking prices.
      Dealers have transaction data like this. Buyers normally don't.</p>
    <div class="panel">
      <div class="f" style="margin-bottom:14px"><input id="soldQ" value="${esc(query)}" placeholder="Search make or model, e.g. Mustang"></div>
      <div class="meter" id="soldStats"></div>
      <div class="table-wrap" id="soldTable" style="margin-top:16px"><div class="skeleton" style="height:200px"></div></div>
      <div class="note">Seeded with sample sales so the database is useful from day one. Every accepted offer adds a real, verified data point.</div>
    </div>
  </div>`;

  const input = $('#soldQ', root);
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = input.value.trim(); load(root); }, 250);
  });

  await load(root);
}

async function load(root) {
  const data = await api.get('/api/sales', { q: query, limit: 60 });
  const { stats, items } = data;

  $('#soldStats', root).innerHTML = `
    <div><span>Sales in view</span><b>${stats.count}</b></div>
    <div><span>Average sold price</span><b>${stats.average ? money(stats.average) : '—'}</b></div>
    <div><span>Lowest</span><b>${stats.lowest ? money(stats.lowest) : '—'}</b></div>
    <div><span>Highest</span><b>${stats.highest ? money(stats.highest) : '—'}</b></div>`;

  $('#soldTable', root).innerHTML = items.length
    ? `<table class="data">
        <tr><th>Vehicle</th><th>Miles</th><th>State</th><th>Sold for</th><th>When</th></tr>
        ${items.map((s) => `<tr>
          <td><b>${s.year} ${esc(s.make)} ${esc(s.model)}</b></td>
          <td>${miles(s.miles)}</td><td>${esc(s.state)}</td>
          <td><b style="color:var(--green)">${money(s.price)}</b></td>
          <td>${timeAgo(s.at)} ${s.source === 'driveway' ? '<span class="pill blue">Driveway</span>' : ''}</td>
        </tr>`).join('')}
      </table>`
    : emptyState('🔍', 'No sales match that search yet.');
}

/* ---------------- wanted board ---------------- */

export async function renderWanted(root) {
  root.innerHTML = `<div class="page wide">
    <h1>Wanted board</h1>
    <p class="lead">Buyers post what they are looking for and sellers come to them. If the car is sitting in your driveway, here is your customer.</p>
    <button class="btn btn-primary" style="margin-bottom:18px" data-act="post">+ Post what you're looking for</button>
    <div class="dash-list" id="wantedList"><div class="skeleton" style="height:120px"></div></div>
  </div>`;

  onClick(root, {
    post: () => requireAuth(() => postModal(root)),
    del: async (node) => {
      await api.del(`/api/wanted/${node.dataset.id}`);
      toast('Removed.');
      renderWanted(root);
    },
    sell: () => { location.hash = '#/sell'; }
  });

  const { items } = await api.get('/api/wanted');
  $('#wantedList', root).innerHTML = items.length
    ? items.map((w) => `<div class="dash-item">
        <div class="avatar">${esc(w.userName[0]).toUpperCase()}</div>
        <div class="info">
          <b>${esc(w.title)}</b>
          <span>${w.budget ? `Budget up to ${money(w.budget)} · ` : ''}${esc(w.timeframe || 'no timeframe given')} · ${esc(w.userName)} · ${timeAgo(w.createdAt)}</span>
          ${w.note ? `<div class="offer-msg">${esc(w.note)}</div>` : ''}
        </div>
        <div class="actions">${store.user?.id === w.userId
          ? `<button class="btn btn-outline btn-sm" data-act="del" data-id="${w.id}">Remove</button>`
          : '<button class="btn btn-green btn-sm" data-act="sell">I have this car</button>'}</div>
      </div>`).join('')
    : emptyState('📋', 'Nobody has posted a request yet. Be the first.');
}

function postModal(root) {
  const back = modal(`<h2>Post what you're looking for</h2>
    <p class="sub">Sellers browse this board before they even write a listing.</p>
    <form class="form-grid" novalidate>
      <div class="form-err" data-form-error hidden></div>
      <div class="f"><label for="w-title">What do you want?</label><input id="w-title" name="title" placeholder="2018-2021 Toyota RAV4, under 60k miles"></div>
      <div class="row2">
        <div class="f"><label for="w-budget">Budget up to</label><input id="w-budget" name="budget" type="number" placeholder="25000"></div>
        <div class="f"><label for="w-time">How soon?</label><select id="w-time" name="timeframe">
          <option>Ready to buy this week</option><option>Within a month</option><option>Just watching</option></select></div>
      </div>
      <div class="f"><label for="w-note">Notes <span class="sublabel">optional</span></label>
        <textarea id="w-note" name="note" placeholder="Clean title only, no accidents. Can pick up within 300 miles."></textarea></div>
      <button class="btn btn-primary btn-lg" type="submit">Post request</button>
    </form>`, { wide: true });

  const form = $('form', back);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    try {
      await api.post('/api/wanted', {
        title: $('#w-title', form).value.trim(),
        budget: Number($('#w-budget', form).value) || 0,
        timeframe: $('#w-time', form).value,
        note: $('#w-note', form).value.trim()
      });
      closeModal();
      toast('Posted to the wanted board.');
      renderWanted(root);
    } catch (err) {
      showFormErrors(form, err);
    }
  });
}
