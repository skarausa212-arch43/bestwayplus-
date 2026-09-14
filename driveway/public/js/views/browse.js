import { api } from '../api.js';
import { store } from '../state.js';
import { toast, onClick, $, $$, esc, money, miles, timeAgo } from '../format.js';
import { carCard, skeletonGrid, emptyState, monthlyPayment, FINANCE } from '../ui.js';
import { stagger, revealOnScroll, countUp, pulse } from '../motion.js';
import { requireAuth } from '../auth.js';
import { icon, iconFilled, BODY_ICON } from '../icons.js';
import { heroPlate } from '../plate.js';

const YEAR = new Date().getFullYear();

const BODIES = ['All', 'Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Wagon', 'Van', 'Convertible'];

/** The four ways a buyer describes what they are after before they filter. */
const CONDITIONS = [
  { key: 'all',      label: 'All',      icon: 'car',
    params: {} },
  { key: 'new',      label: 'New',      icon: 'suv',
    params: { yearFrom: YEAR - 2, maxMiles: 15000 } },
  { key: 'used',     label: 'Used',     icon: 'truck',
    params: { minMiles: 15000 } },
  { key: 'verified', label: 'Verified', icon: 'shield',
    params: { cleanHistory: true } },
  { key: 'electric', label: 'Electric', icon: 'bolt',
    params: { fuel: 'Electric' } }
];

/** The filters no other US marketplace offers, mapped onto API query params. */
const SMART = [
  { key: 'uber',    label: 'Rideshare-ready',    icon: 'user',      params: { minDoors: 4, yearFrom: YEAR - 15 } },
  { key: 'teen',    label: 'Good first car',     icon: 'shield',    params: { minSafety: 4, maxPrice: 25000, cleanHistory: true } },
  { key: 'tow',     label: 'Tows 5,000+ lb',     icon: 'truck',     params: { minTow: 5000 } },
  { key: 'ev',      label: 'EV battery 90%+',    icon: 'battery',   params: { minEvSoh: 90, fuel: 'Electric' } },
  { key: 'norust',  label: 'No salt-belt years', icon: 'snowflake', params: { noSaltBelt: true } },
  { key: 'clean',   label: 'Clean history',      icon: 'document',  params: { cleanHistory: true } },
  { key: 'ending',  label: 'Offers close soon',  icon: 'clock',     params: { endingSoon: true } }
];

const state = {
  filters: {},
  condition: 'all',
  smart: new Set(),
  offset: 0,
  items: [],
  total: 0,
  loading: false,
  showAllFilters: false
};

/* The financing plate keeps its own numbers so dragging a slider never
   repaints the section it lives in. */
const fin = { price: 32000, down: 3200, apr: FINANCE.apr, term: FINANCE.termMonths };

export function setSearchQuery(q) {
  state.filters.q = q;
}

function queryParams() {
  const params = { ...state.filters, limit: 24, offset: state.offset };
  Object.assign(params, CONDITIONS.find((c) => c.key === state.condition).params);
  for (const key of state.smart) Object.assign(params, SMART.find((s) => s.key === key).params);
  if (params.body === 'All') delete params.body;
  return params;
}

/* ---------------------------------------------------------------- the page */

const hero = () => `
<section class="hero">
  <div class="hero-in">
    <div class="hero-copy">
      <div class="seg" role="group" aria-label="What kind of car">
        ${CONDITIONS.map((c) => `<button data-act="cond" data-key="${c.key}"
          class="${state.condition === c.key ? 'on' : ''}"
          aria-pressed="${state.condition === c.key}">${icon(c.icon, { size: 16 })}${c.label}</button>`).join('')}
      </div>

      <h1>The car is worth what the last one <b>sold for.</b></h1>
      <p class="hero-lead">A private-party marketplace that prices every car against what
        comparable cars actually closed at, answers offers by your own rules, and keeps your
        number private until you accept one.</p>

      <form class="search-plate" id="searchPlate" novalidate>
        <div class="field sel">
          <label for="f-make">Make</label>
          <select id="f-make" name="make"><option value="">Any make</option></select>
        </div>
        <div class="field sel">
          <label for="f-model">Model</label>
          <select id="f-model" name="model"><option value="">Any model</option></select>
        </div>
        <div class="field sel">
          <label for="f-price">Max price</label>
          <select id="f-price" name="maxPrice">
            <option value="">Any price</option>
            <option value="15000">Under $15,000</option>
            <option value="25000">Under $25,000</option>
            <option value="35000">Under $35,000</option>
            <option value="50000">Under $50,000</option>
            <option value="100000">Under $100,000</option>
          </select>
        </div>
        <div class="field">
          <label for="f-zip">ZIP</label>
          <input id="f-zip" maxlength="5" inputmode="numeric" placeholder="78701" value="${esc(store.zip)}">
        </div>
        <div class="go"><button class="btn btn-primary" type="submit" data-act="search">
          ${icon('search', { size: 17 })}Search</button></div>
      </form>

      <button class="search-more" data-act="allFilters" aria-expanded="${state.showAllFilters}">
        ${icon('sliders', { size: 15 })}${state.showAllFilters ? 'Fewer filters' : 'All filters — year, body, mileage'}
      </button>
    </div>

    <div class="hero-plate">
      <div class="hero-photo-slot" id="heroSlot">${heroPlate(state.condition)}</div>
      <div class="callout c1 c-blue" style="--d:1.15s">
        <span class="fig"><i>Comp-anchored value</i><b id="coVal">$24,900</b></span><span class="lead"></span>
      </div>
      <div class="callout c2 c-green flip" style="--d:1.3s">
        <span class="lead"></span><span class="fig"><i>Deal rating</i><b>Great deal</b></span>
      </div>
      <div class="callout c3" style="--d:1.45s">
        <span class="fig"><i>Cars listed now</i><b id="coCars">—</b></span><span class="lead"></span>
      </div>
    </div>
  </div>
</section>`;

const trust = () => `
<section class="trust-strip">
  <div class="wrap">
    <div class="trust-item">${icon('chart', { size: 22 })}
      <div><b>Priced against closed sales</b><span>Every listing is measured against
        what comparable cars actually sold for here — not against asking prices.</span></div></div>
    <div class="trust-item">${icon('lock', { size: 22 })}
      <div><b>Your number stays yours</b><span>Contact details unlock when you accept an offer.
        Competing offers show as a $1,000 band, never an exact figure.</span></div></div>
    <div class="trust-item">${icon('handshake', { size: 22 })}
      <div><b>Offers answered while you sleep</b><span>Set accept, counter and decline
        thresholds once; buyers get an answer in seconds.</span></div></div>
    <div class="trust-item">${icon('shield', { size: 22 })}
      <div><b>Title, recalls and OBD on the card</b><span>Brand check, open recalls, salt-belt
        years and a diagnostic self-check, before you drive out to look.</span></div></div>
  </div>
</section>`;

const inventory = () => `
<section class="sec" id="inventory">
  <div class="wrap">
    <div class="chips" id="bodyChips"></div>
    <div class="chips" id="smartChips"></div>
    <div class="section-head">
      <h2 id="listTitle">Cars for sale right now</h2>
      <span class="count" id="listCount"></span>
    </div>
    <div id="grid">${skeletonGrid()}</div>
    <div style="text-align:center;margin-top:32px">
      <button class="btn btn-outline" id="moreBtn" hidden>Load more</button>
    </div>
  </div>
</section>`;

const financing = () => `
<section class="sec tint">
  <div class="wrap">
    <div class="fin">
      <div class="fin-copy">
        <h2>Work out the payment before you make the offer.</h2>
        <p>Private sales fall apart at the financing step. Set the terms you expect to get and
          Driveway shows every car as a monthly figure, so the offer you make is one you can carry.</p>
        <ul class="fin-steps">
          <li>${icon('calculator', { size: 18 })}<span><b>Set your terms once.</b>
            Down payment, APR and term follow you across every listing.</span></li>
          <li>${icon('tag', { size: 18 })}<span><b>Every card shows a payment.</b>
            Price and monthly estimate side by side, on the card and on the listing.</span></li>
          <li>${icon('shield', { size: 18 })}<span><b>Nothing here touches your credit.</b>
            Driveway is a marketplace, not a lender — there is no application and no credit pull.</span></li>
        </ul>
        <p class="fin-fine">Estimates only. Figures are straight amortization at the terms you set;
          your bank or credit union writes the real loan, and their rate is the one that counts.</p>
      </div>

      <div class="fin-calc">
        <div class="fin-out">
          <div class="mo"><i>Estimated payment</i><b id="finMo">$0<span>/mo</span></b></div>
          <div class="tot">Financed <b id="finAmt">$0</b><br>Total of payments <b id="finTot">$0</b></div>
        </div>
        <div class="fin-fields">
          <div class="slider-row">
            <div class="lbl-row"><label for="finPrice">Vehicle price</label><span class="val" id="finPriceV"></span></div>
            <input type="range" id="finPrice" min="3000" max="120000" step="500" value="${fin.price}">
          </div>
          <div class="slider-row">
            <div class="lbl-row"><label for="finDown">Down payment</label><span class="val" id="finDownV"></span></div>
            <input type="range" id="finDown" min="0" max="40000" step="250" value="${fin.down}">
          </div>
          <div class="slider-row">
            <div class="lbl-row"><label for="finApr">APR</label><span class="val" id="finAprV"></span></div>
            <input type="range" id="finApr" min="2" max="22" step="0.1" value="${fin.apr}">
          </div>
          <div class="slider-row">
            <div class="lbl-row"><label for="finTerm">Term</label><span class="val" id="finTermV"></span></div>
            <input type="range" id="finTerm" min="24" max="84" step="12" value="${fin.term}">
          </div>
        </div>
        <div class="fin-note">${icon('checkCircle', { size: 18 })}
          <div><b>No impact to your credit score.</b>
            Nothing on this page is an application. Driveway never runs a credit check.</div></div>
      </div>
    </div>
  </div>
</section>`;

const tradeIn = () => `
<section class="sec">
  <div class="wrap">
    <div class="trade">
      <div>
        <h2>What is the one on your driveway worth?</h2>
        <p>A dealer trade-in quote is a wholesale number with a margin taken out of it.
          This is the other figure: what cars like yours have closed at between private
          parties here, what it is losing every month you wait, and how long it should
          take to sell.</p>
        <p class="fin-fine" style="margin-top:20px">Priced from closed sales of the same model line,
          adjusted ±6% per model year and $0.06 per mile. Where comparable sales are thin,
          Driveway falls back to a depreciation curve and says so.</p>
      </div>
      <form class="trade-form" id="tradeForm" novalidate>
        <h3>Value my car</h3>
        <div class="trade-grid">
          <div class="field"><label for="t-make">Make</label>
            <select id="t-make"><option value="">Select</option></select></div>
          <div class="field"><label for="t-model">Model</label>
            <input id="t-model" placeholder="Camry" autocomplete="off"></div>
          <div class="field"><label for="t-year">Year</label>
            <input id="t-year" inputmode="numeric" maxlength="4" placeholder="${YEAR - 5}"></div>
          <div class="field"><label for="t-miles">Mileage</label>
            <input id="t-miles" inputmode="numeric" placeholder="62,000"></div>
          <div class="field full">
            <button class="btn btn-primary btn-lg" style="width:100%" type="submit" data-act="value">
              ${icon('gauge', { size: 18 })}Get my value</button>
          </div>
        </div>
        <div id="tradeOut"></div>
      </form>
    </div>
  </div>
</section>`;

const why = () => `
<section class="sec tint">
  <div class="wrap">
    <div class="section-head"><h2>What a classifieds page cannot do.</h2></div>
    <div class="why">
      <article class="lead-cell">
        <h3>The price is computed, not claimed.</h3>
        <p>Ask a seller why the car costs what it costs and you get a story. Driveway
          answers with arithmetic: comparable closed sales of the same model line,
          adjusted for model year and mileage, and a deal rating derived from the gap.
          The seller cannot set the rating, and neither can we.</p>
        <div class="fig-line"><b id="whySold">—</b><span>closed sales in the price database</span></div>
      </article>
      <article>
        <h3>Your rules negotiate for you.</h3>
        <p>Set the number you will accept, the number you will counter at, and the
          number you will not read. Offers are judged the moment they arrive, so a
          buyer at midnight gets an answer at midnight.</p>
      </article>
      <article>
        <h3>Privacy is enforced, not promised.</h3>
        <p>Competing offers are exposed as a $1,000 band. Auto-negotiation thresholds
          and any loan balance stay with the owner. Contact details unlock on acceptance.
          All of it decided on the server, not hidden in the page.</p>
      </article>
      <article class="minor">
        <h3>Evidence, not adjectives.</h3>
        <p>A cold-start recording, an OBD-II self-check, a digital logbook and a
          guided photo set — the things you would ask for on the phone, attached
          before you call.</p>
      </article>
      <article class="minor">
        <h3>It costs nothing to find out.</h3>
        <p>Listing is free. Valuing your car is free. There is no lead sold to a
          dealership at the end of it.</p>
        <div class="fig-line"><b>$0</b><span>to list a car today</span></div>
      </article>
    </div>
  </div>
</section>`;

const bodies = () => `
<section class="sec">
  <div class="wrap">
    <div class="section-head">
      <h2>Start from the shape you need.</h2>
      <a class="more" href="#inventory" data-act="jumpInventory">All inventory${icon('arrowRight', { size: 15 })}</a>
    </div>
    <nav class="bodies" id="bodyNav" aria-label="Browse by body style">
      ${['Sedan', 'SUV', 'Truck', 'Coupe', 'Wagon', 'Van'].map((b) => `
        <a href="#/browse" data-act="bodyJump" data-body="${b}">
          ${icon(BODY_ICON[b] || 'car', { size: 42 })}
          <span>${b}</span><em data-bodycount="${b}">—</em>
        </a>`).join('')}
    </nav>
  </div>
</section>`;

const closed = () => `
<section class="sec tint" id="closedSec">
  <div class="wrap">
    <div class="section-head">
      <h2>Recently closed on Driveway.</h2>
      <a class="more" href="#/sold">The whole price database${icon('arrowRight', { size: 15 })}</a>
    </div>
    <div class="records" id="closedGrid"></div>
    <p class="demo-note">${icon('alert', { size: 15 })}
      <span>Driveway is new and has no customer testimonials yet, so this is the deal record
      instead: accepted offers, not asking prices. The sales shown here come from the
      demonstration dataset this instance was seeded with.</span></p>
  </div>
</section>`;

const shell = () => hero() + trust() + inventory() + financing() + tradeIn() + why() + bodies() + closed();

/* ------------------------------------------------------------------ render */

export async function renderBrowse(root) {
  root.innerHTML = shell();

  const makeSelect = $('#f-make', root);
  const tradeMake = $('#t-make', root);
  for (const make of store.meta?.makes || []) {
    makeSelect.add(new Option(make, make));
    tradeMake.add(new Option(make, make));
  }
  makeSelect.value = state.filters.make || '';
  $('#f-price', root).value = state.filters.maxPrice || '';

  renderChips(root);
  wireSearch(root);
  wireFinance(root);
  wireTrade(root);

  onClick(root, {
    search: () => runSearch(root),
    allFilters: () => {
      state.showAllFilters = !state.showAllFilters;
      toggleAllFilters(root);
    },
    cond: (node) => {
      state.condition = node.dataset.key;
      $$('.seg button', root).forEach((b) => {
        const on = b.dataset.key === state.condition;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      // The plate redraws for the chosen kind of car — the one moment on the
      // page where a control changes the illustration rather than a list.
      $('#heroSlot', root).innerHTML = heroPlate(state.condition);
      reload(root);
    },
    body: (node) => {
      state.filters.body = node.dataset.body;
      renderChips(root);
      reload(root);
    },
    bodyJump: (node) => {
      state.filters.body = node.dataset.body;
      renderChips(root);
      reload(root);
      $('#inventory', root)?.scrollIntoView({ block: 'start' });
    },
    jumpInventory: () => $('#inventory', root)?.scrollIntoView({ block: 'start' }),
    smart: (node) => {
      const key = node.dataset.key;
      state.smart.has(key) ? state.smart.delete(key) : state.smart.add(key);
      renderChips(root);
      reload(root);
    },
    open: (node) => { location.hash = `#/car/${node.dataset.id}`; },
    fav: async (node) => {
      requireAuth(async () => {
        pulse(node, 'pop', 500);
        const { favorited } = await api.post(`/api/listings/${node.dataset.id}/favorite`);
        toast(favorited ? 'Saved to your garage.' : 'Removed from saved.');
        const item = state.items.find((l) => String(l.id) === node.dataset.id);
        if (item) item.favorited = favorited;
        // Repaint just this card's control so the grid does not flash.
        node.classList.toggle('on', favorited);
        node.setAttribute('aria-pressed', String(favorited));
        node.innerHTML = favorited ? iconFilled('heart', { size: 18 }) : icon('heart', { size: 18 });
      });
    }
  });

  // Cards are focusable, so Enter and Space must open them like a click does.
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest?.('.car-card');
    if (!card) return;
    e.preventDefault();
    location.hash = `#/car/${card.dataset.id}`;
  });

  $('#moreBtn', root).addEventListener('click', () => {
    state.offset += 24;
    load(root, { append: true });
  });

  await load(root);
  loadStats(root);
  revealOnScroll(root);
}

function wireSearch(root) {
  const form = $('#searchPlate', root);
  form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(root); });
  if (state.showAllFilters) toggleAllFilters(root, true);
}

function runSearch(root) {
  state.filters.make = $('#f-make', root).value;
  state.filters.model = $('#f-model', root)?.value || '';
  state.filters.maxPrice = $('#f-price', root).value;
  const extra = $('#extraFilters', root);
  if (extra) {
    state.filters.yearFrom = $('#f-year', extra).value;
    state.filters.maxMiles = $('#f-miles', extra).value;
  }
  const zip = $('#f-zip', root).value.trim();
  if (zip) store.setZip(zip);
  reload(root);
  $('#inventory', root)?.scrollIntoView({ block: 'start' });
}

/** Year, body and mileage stay folded away until asked for. */
function toggleAllFilters(root, initial = false) {
  const btn = $('[data-act="allFilters"]', root);
  let extra = $('#extraFilters', root);
  if (!state.showAllFilters) {
    extra?.remove();
    if (btn) {
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = `${icon('sliders', { size: 15 })}All filters — year, body, mileage`;
    }
    return;
  }
  if (!extra) {
    extra = document.createElement('div');
    extra.id = 'extraFilters';
    extra.className = 'search-plate';
    extra.innerHTML = `
      <div class="field sel"><label for="f-year">Year from</label>
        <select id="f-year">${['', YEAR, YEAR - 2, YEAR - 4, YEAR - 6, YEAR - 10, YEAR - 15]
          .map((y) => `<option value="${y}">${y || 'Any year'}</option>`).join('')}</select></div>
      <div class="field sel"><label for="f-miles">Max mileage</label>
        <select id="f-miles"><option value="">Any mileage</option>
          <option value="15000">Under 15,000</option><option value="40000">Under 40,000</option>
          <option value="80000">Under 80,000</option><option value="120000">Under 120,000</option></select></div>
      <div class="field sel"><label for="f-body">Body style</label>
        <select id="f-body">${BODIES.map((b) => `<option value="${b}">${b === 'All' ? 'Any body' : b}</option>`).join('')}</select></div>
      <div class="go"><button class="btn btn-outline" type="button" data-act="search">Apply</button></div>`;
    $('#searchPlate', root).after(extra);
    $('#f-body', extra).value = state.filters.body || 'All';
    $('#f-body', extra).addEventListener('change', (e) => {
      state.filters.body = e.target.value;
      renderChips(root);
    });
  }
  if (btn && !initial) {
    btn.setAttribute('aria-expanded', 'true');
    btn.innerHTML = `${icon('sliders', { size: 15 })}Fewer filters`;
  }
}

/* ----------------------------------------------------------- the financing */

function wireFinance(root) {
  const ids = ['finPrice', 'finDown', 'finApr', 'finTerm'];
  const paint = () => {
    const price = Number($('#finPrice', root).value);
    const down = Math.min(Number($('#finDown', root).value), price);
    const apr = Number($('#finApr', root).value);
    const term = Number($('#finTerm', root).value);
    Object.assign(fin, { price, down, apr, term });

    const mo = monthlyPayment(price, { apr, term, down });
    $('#finPriceV', root).textContent = money(price);
    $('#finDownV', root).textContent = `${money(down)} · ${price ? Math.round((down / price) * 100) : 0}%`;
    $('#finAprV', root).textContent = `${apr.toFixed(1)}%`;
    $('#finTermV', root).textContent = `${term} months`;
    $('#finMo', root).innerHTML = `${money(mo)}<span>/mo</span>`;
    $('#finAmt', root).textContent = money(Math.max(0, price - down));
    $('#finTot', root).textContent = money(mo * term);
  };
  for (const id of ids) $(`#${id}`, root).addEventListener('input', paint);
  paint();
}

/* ------------------------------------------------------------- the trade-in */

function wireTrade(root) {
  const form = $('#tradeForm', root);
  const out = $('#tradeOut', root);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const make = $('#t-make', root).value.trim();
    const model = $('#t-model', root).value.trim();
    const year = Number($('#t-year', root).value);
    const mileage = Number(String($('#t-miles', root).value).replace(/[^\d]/g, ''));

    if (!make || !model || !year || !mileage) {
      out.innerHTML = `<p class="form-err">${icon('alert', { size: 15 })}
        Fill in make, model, year and mileage — all four move the number.</p>`;
      return;
    }

    const btn = $('[data-act="value"]', form);
    btn.classList.add('is-loading');
    try {
      const v = await api.post('/api/valuation', { make, model, year, miles: mileage });
      out.innerHTML = `
        <div class="trade-result">
          <div class="top"><i>Private-party value</i><b>${money(v.marketValue)}</b></div>
          <div class="rows">
            <div><span>Guaranteed floor</span><b>${money(v.guaranteedFloor)}</b></div>
            <div><span>Losing per month to depreciation</span><b>${money(v.depreciationPerMonth)}</b></div>
            <div><span>Expected time to sell</span><b>${v.daysToSell} days</b></div>
            <div><span>Based on</span><b>${v.compCount
              ? `${v.compCount} closed sale${v.compCount === 1 ? '' : 's'}`
              : 'depreciation curve'}</b></div>
          </div>
        </div>
        <a class="btn btn-primary" style="width:100%;margin-top:16px" href="#/sell">
          ${icon('plus', { size: 17 })}List it for $0</a>`;
    } catch (err) {
      out.innerHTML = `<p class="form-err">${icon('alert', { size: 15 })}${esc(err.message)}</p>`;
    } finally {
      btn.classList.remove('is-loading');
    }
  });
}

/* ---------------------------------------------------------------- the grid */

function renderChips(root) {
  const body = state.filters.body || 'All';
  $('#bodyChips', root).innerHTML = BODIES.map((b) =>
    `<button class="chip ${body === b ? 'on' : ''}" data-act="body" data-body="${b}"
      aria-pressed="${body === b}">${b === 'All' ? '' : icon(BODY_ICON[b] || 'car', { size: 16 })}${b}</button>`
  ).join('');
  $('#smartChips', root).innerHTML = SMART.map((s) =>
    `<button class="chip smart ${state.smart.has(s.key) ? 'on' : ''}" data-act="smart" data-key="${s.key}"
      aria-pressed="${state.smart.has(s.key)}">${icon(s.icon, { size: 15 })}${s.label}</button>`
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
    if (grid.isConnected) grid.innerHTML = emptyState('alert', `Could not load listings: ${esc(err.message)}`);
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
    : emptyState('search', 'No cars match those filters.<br>Try turning a few off.');

  stagger($('.grid', grid));

  const more = $('#moreBtn', root);
  if (more) more.hidden = state.items.length >= state.total;
}

async function loadStats(root) {
  try {
    const [listings, sales] = await Promise.all([
      api.get('/api/listings', { limit: 1 }),
      api.get('/api/sales', { limit: 24 })
    ]);
    const format = (v) => v.toLocaleString('en-US');
    countUp($('#coCars', root), listings.total, { format });
    countUp($('#whySold', root), sales.total, { format });
    paintClosed(root, sales.items);
    if (sales.items?.length) {
      const median = sales.items.map((s) => s.price).sort((a, b) => a - b)[Math.floor(sales.items.length / 2)];
      $('#coVal', root).textContent = money(median);
    }
  } catch { /* the hero figures are supporting detail; a failure is not worth a toast */ }
  loadBodyCounts(root);
}

/** The body-style nav states real inventory counts, or nothing at all. */
async function loadBodyCounts(root) {
  const nodes = $$('[data-bodycount]', root);
  await Promise.all(nodes.map(async (node) => {
    try {
      const { total } = await api.get('/api/listings', { body: node.dataset.bodycount, limit: 1 });
      node.textContent = `${total} listed`;
    } catch { node.textContent = ''; }
  }));
}

/**
 * The closed-sale record stands in for testimonials, which do not exist. Every
 * figure here is an accepted offer the marketplace recorded.
 */
function paintClosed(root, sales) {
  const wrapEl = $('#closedGrid', root);
  const sec = $('#closedSec', root);
  if (!wrapEl) return;
  if (!sales?.length) { sec?.remove(); return; }

  wrapEl.innerHTML = sales.slice(0, 3).map((s) => `
    <article class="record">
      <div class="mark">${icon('checkCircle', { size: 15 })}Closed</div>
      <b class="amount">${money(s.price)}</b>
      <div class="car">${s.year} ${esc(s.make)} ${esc(s.model)}</div>
      <div class="foot">
        <span class="plate">${esc(s.state)}</span>
        <span>${miles(s.miles || 0)} · accepted ${timeAgo(s.at)}</span>
      </div>
    </article>`).join('');
}
