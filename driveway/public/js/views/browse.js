import { api } from '../api.js';
import { store } from '../state.js';
import { toast, onClick, $, esc } from '../format.js';
import { carCard, skeletonGrid, emptyState } from '../ui.js';
import { requireAuth } from '../auth.js';

const BODIES = ['All', 'Coupe', 'Sedan', 'SUV', 'Truck', 'Electric'];

/** The filters no other US marketplace offers, mapped onto API query params. */
const SMART = [
  { key: 'uber',    label: 'Rideshare-ready',   params: { minDoors: 4, yearFrom: new Date().getFullYear() - 15 } },
  { key: 'teen',    label: 'Good first car',    params: { minSafety: 4, maxPrice: 25000, cleanHistory: true } },
  { key: 'tow',     label: 'Tows 5,000+ lb',    params: { minTow: 5000 } },
  { key: 'ev',      label: 'EV battery 90%+',   params: { minEvSoh: 90, fuel: 'Electric' } },
  { key: 'norust',  label: 'No salt-belt years', params: { noSaltBelt: true } },
  { key: 'clean',   label: 'Clean history',     params: { cleanHistory: true } },
  { key: 'ending',  label: 'Offers close soon', params: { endingSoon: true } }
];

const state = { filters: {}, smart: new Set(), offset: 0, items: [], total: 0, loading: false };

export function setSearchQuery(q) {
  state.filters.q = q;
}

function queryParams() {
  const params = { ...state.filters, limit: 24, offset: state.offset };
  for (const key of state.smart) Object.assign(params, SMART.find((s) => s.key === key).params);
  if (params.body === 'All') delete params.body;
  if (params.body === 'Electric') { params.fuel = 'Electric'; delete params.body; }
  return params;
}

const shell = () => `
  <section class="hero"><div class="hero-in">
    <h1>Buy and sell cars<br>the honest way.</h1>
    <p class="sub">Real offers, verified sellers, and the paperwork figured out before you even meet. No dealership games.</p>
    <div class="hero-stats">
      <div><b id="statCars">—</b><span>cars for sale</span></div>
      <div><b id="statSold">—</b><span>sold on Driveway</span></div>
      <div><b>$0</b><span>listing fee</span></div>
    </div>
  </div></section>

  <div class="search-panel"><div class="search-card">
    <div class="field"><label for="f-make">Make</label><select id="f-make" name="make"><option value="">Any make</option></select></div>
    <div class="field"><label for="f-price">Max price</label><select id="f-price" name="maxPrice">
      <option value="">—</option><option value="15000">Under $15,000</option><option value="25000">Under $25,000</option>
      <option value="35000">Under $35,000</option><option value="50000">Under $50,000</option><option value="100000">Under $100,000</option>
    </select></div>
    <div class="field"><label for="f-year">Year from</label><select id="f-year" name="yearFrom">
      <option value="">—</option><option>2022</option><option>2020</option><option>2018</option><option>2015</option><option>2010</option>
    </select></div>
    <div class="field"><label for="f-zip">Your ZIP</label><input id="f-zip" maxlength="5" inputmode="numeric" placeholder="78701" value="${esc(store.zip)}"></div>
    <button class="btn btn-primary" data-act="search">Search</button>
  </div></div>

  <div class="wrap">
    <div class="chips" id="bodyChips"></div>
    <div class="chips" id="smartChips"></div>
    <div class="section-head"><h2 id="listTitle">Fresh listings</h2><span class="count" id="listCount"></span></div>
    <div id="grid">${skeletonGrid()}</div>
    <div style="text-align:center;margin-bottom:50px"><button class="btn btn-outline" id="moreBtn" hidden>Load more</button></div>
  </div>

  <section class="how"><div class="wrap">
    <h2 style="font-size:26px;letter-spacing:-.5px">How Driveway works</h2>
    <div class="how-grid">
      <div class="how-step"><div class="num">1</div><h3>List in minutes</h3><p>Guided photos and a free history check are built into the listing form.</p></div>
      <div class="how-step"><div class="num">2</div><h3>Get real offers</h3><p>Your rules can accept, counter or decline offers automatically, day or night.</p></div>
      <div class="how-step"><div class="num">3</div><h3>Know the real price</h3><p>Every accepted offer feeds the sold-price database, so both sides negotiate with facts.</p></div>
      <div class="how-step"><div class="num">4</div><h3>Close it safely</h3><p>Registration cost, shipping and a 48-hour hold are settled before you meet.</p></div>
    </div>
  </div></section>`;

export async function renderBrowse(root) {
  root.innerHTML = shell();

  const makeSelect = $('#f-make', root);
  for (const make of store.meta?.makes || []) makeSelect.add(new Option(make, make));
  makeSelect.value = state.filters.make || '';
  $('#f-price', root).value = state.filters.maxPrice || '';
  $('#f-year', root).value = state.filters.yearFrom || '';

  renderChips(root);

  onClick(root, {
    search: () => {
      state.filters.make = makeSelect.value;
      state.filters.maxPrice = $('#f-price', root).value;
      state.filters.yearFrom = $('#f-year', root).value;
      const zip = $('#f-zip', root).value.trim();
      if (zip) store.setZip(zip);
      reload(root);
    },
    body: (node) => {
      state.filters.body = node.dataset.body;
      renderChips(root);
      reload(root);
    },
    smart: (node) => {
      const key = node.dataset.key;
      state.smart.has(key) ? state.smart.delete(key) : state.smart.add(key);
      renderChips(root);
      reload(root);
    },
    open: (node) => { location.hash = `#/car/${node.dataset.id}`; },
    fav: async (node) => {
      requireAuth(async () => {
        const { favorited } = await api.post(`/api/listings/${node.dataset.id}/favorite`);
        toast(favorited ? 'Saved ❤️' : 'Removed from saved');
        const item = state.items.find((l) => String(l.id) === node.dataset.id);
        if (item) item.favorited = favorited;
        paint(root);
      });
    }
  });

  $('#moreBtn', root).addEventListener('click', () => {
    state.offset += 24;
    load(root, { append: true });
  });

  await load(root);
  loadStats(root);
}

function renderChips(root) {
  $('#bodyChips', root).innerHTML = BODIES.map((b) =>
    `<button class="chip ${(state.filters.body || 'All') === b ? 'on' : ''}" data-act="body" data-body="${b}">${b}</button>`
  ).join('');
  $('#smartChips', root).innerHTML = SMART.map((s) =>
    `<button class="chip smart ${state.smart.has(s.key) ? 'on' : ''}" data-act="smart" data-key="${s.key}">${s.label}</button>`
  ).join('');
}

async function reload(root) {
  state.offset = 0;
  await load(root);
}

async function load(root, { append = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  const grid = $('#grid', root);
  if (!grid) { state.loading = false; return; }
  if (!append) grid.innerHTML = skeletonGrid();

  try {
    const data = await api.get('/api/listings', queryParams());
    state.items = append ? [...state.items, ...data.items] : data.items;
    state.total = data.total;
  } catch (err) {
    // The user may have navigated away while this was in flight.
    if (grid.isConnected) grid.innerHTML = emptyState('⚠️', `Could not load listings: ${esc(err.message)}`);
    return;
  } finally {
    state.loading = false;
  }
  paint(root);
}

function paint(root) {
  const grid = $('#grid', root);
  if (!grid) return;
  const count = $('#listCount', root);
  if (count) count.textContent = `${state.total} ${state.total === 1 ? 'car' : 'cars'}`;

  grid.innerHTML = state.items.length
    ? `<div class="grid">${state.items.map(carCard).join('')}</div>`
    : emptyState('🔍', 'No cars match those filters.<br>Try turning a few off.');

  const more = $('#moreBtn', root);
  if (more) more.hidden = state.items.length >= state.total;
}

async function loadStats(root) {
  try {
    const [listings, sales] = await Promise.all([
      api.get('/api/listings', { limit: 1 }),
      api.get('/api/sales', { limit: 1 })
    ]);
    const cars = $('#statCars', root);
    const sold = $('#statSold', root);
    if (cars) cars.textContent = listings.total;
    if (sold) sold.textContent = sales.total;
  } catch { /* the hero counters are decoration; a failure here is not worth showing */ }
}
