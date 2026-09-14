import { api } from '../api.js';
import { store, modal, closeModal, showFormErrors, clearFormErrors } from '../state.js';
import { money, miles, esc, timeAgo, timeLeft, onClick, $, toast } from '../format.js';
import { cardThumb, emptyState } from '../ui.js';
import { stagger } from '../motion.js';
import { requireAuth } from '../auth.js';

const TABS = [
  ['listings', 'My listings'],
  ['received', 'Offers received'],
  ['made', 'My offers'],
  ['standing', 'Standing bids'],
  ['holds', 'Holds'],
  ['favorites', 'Saved']
];

let tab = 'listings';

export function renderGarage(root, requestedTab) {
  if (requestedTab && TABS.some(([k]) => k === requestedTab)) tab = requestedTab;
  requireAuth(() => paint(root));
  if (!store.user) {
    root.innerHTML = `<div class="page"><h1>My garage</h1><p class="lead">Sign in to see your listings, offers and standing bids.</p></div>`;
  }
}

async function paint(root) {
  root.innerHTML = `<div class="page wide">
    <h1>My garage</h1>
    <p class="lead">Your listings, offers, standing bids and holds — all in one place.</p>
    <div class="tabbar" id="tabs"></div>
    <div class="dash-list" id="tabBody"><div class="skeleton" style="height:120px"></div></div>
  </div>`;

  onClick(root, {
    tab: (node) => { tab = node.dataset.tab; paint(root); },
    open: (node) => { location.hash = `#/car/${node.dataset.id}`; },
    accept: (node) => act(root, `/api/offers/${node.dataset.id}/accept`, 'Deal done — contact details are now visible.'),
    decline: (node) => act(root, `/api/offers/${node.dataset.id}/decline`, 'Offer declined.'),
    withdraw: (node) => act(root, `/api/offers/${node.dataset.id}/withdraw`, 'Offer withdrawn.'),
    acceptCounter: (node) => act(root, `/api/offers/${node.dataset.id}/accept-counter`, '🤝 Counter accepted — the car is yours to close.'),
    counter: (node) => counterModal(root, node.dataset.id, Number(node.dataset.amount)),
    changePrice: (node) => priceModal(root, node.dataset.id, Number(node.dataset.price)),
    takeFloor: (node) => floorModal(root, node.dataset.id, Number(node.dataset.floor)),
    remove: (node) => removeModal(root, node.dataset.id),
    newBid: () => bidModal(root),
    fireBid: async (node) => {
      const { sent } = await api.post(`/api/standing-bids/${node.dataset.id}/fire`);
      toast(sent ? `Sent ${sent} offer${sent > 1 ? 's' : ''}.` : 'No new matches right now.');
      paint(root);
    },
    delBid: (node) => act(root, `/api/standing-bids/${node.dataset.id}`, 'Standing bid removed.', 'del'),
    releaseHold: async (node) => {
      await api.del(`/api/listings/${node.dataset.id}/hold`);
      toast('Hold released, deposit refunded.');
      paint(root);
    },
    unfav: async (node) => {
      await api.post(`/api/listings/${node.dataset.id}/favorite`);
      toast('Removed from saved');
      paint(root);
    }
  });

  await load(root);
}

async function act(root, path, message, method = 'post') {
  try {
    await (method === 'del' ? api.del(path) : api.post(path));
    toast(message);
    paint(root);
  } catch (err) {
    toast(err.message);
  }
}

async function load(root) {
  const [listings, received, made] = await Promise.all([
    api.get('/api/my/listings').catch(() => ({ items: [] })),
    api.get('/api/offers/received').catch(() => ({ items: [] })),
    api.get('/api/offers/made').catch(() => ({ items: [] }))
  ]);

  const pendingIn = received.items.filter((o) => o.status === 'pending').length;
  const counters = made.items.filter((o) => o.status === 'countered').length;
  const badges = { received: pendingIn, made: counters };

  $('#tabs', root).innerHTML = TABS.map(([key, label]) =>
    `<button class="${key === tab ? 'on' : ''}" data-act="tab" data-tab="${key}">${label}${
      badges[key] ? ` <span class="pill red" style="padding:1px 7px">${badges[key]}</span>` : ''}</button>`
  ).join('');

  const body = $('#tabBody', root);
  const show = (html) => {
    body.innerHTML = html;
    stagger(body, '.dash-item', { step: 50 });
  };

  if (tab === 'listings') return show(listingsTab(listings.items));
  if (tab === 'received') return show(receivedTab(received.items));
  if (tab === 'made') return show(madeTab(made.items));
  if (tab === 'standing') return show(standingTab((await api.get('/api/standing-bids')).items));
  if (tab === 'holds') return show(holdsTab((await api.get('/api/my/holds')).items));
  if (tab === 'favorites') return show(favoritesTab((await api.get('/api/my/favorites')).items));
}

/* ---------------- tabs ---------------- */

const listingsTab = (items) => items.length ? items.map((l) => `
  <div class="dash-item">
    ${cardThumb(l)}
    <div class="info">
      <b>${l.year} ${esc(l.make)} ${esc(l.model)}</b>
      <span>${money(l.price)} · ${miles(l.miles)} · ${esc(l.city)}, ${esc(l.state)}</span>
      <span>${l.offerCount} open offer${l.offerCount === 1 ? '' : 's'} · est. ${l.daysToSell} day${l.daysToSell === 1 ? '' : 's'} to sell${
        l.rules ? ' · 🤝 auto-negotiation on' : ''}${l.loanBalance ? ` · loan ${money(l.loanBalance)}` : ''}</span>
      ${l.status === 'sold'
        ? `<span class="pill green">Sold for ${money(l.sale.price)}</span>`
        : l.hold ? `<span class="pill amber">On hold · ${timeLeft(l.hold.until)}</span>`
        : '<span class="pill blue">Active</span>'}
      ${l.deadlineAt && l.deadlineAt > Date.now() ? `<span class="pill amber">⏱ ${timeLeft(l.deadlineAt)}</span>` : ''}
    </div>
    <div class="actions">
      <button class="btn btn-outline btn-sm" data-act="open" data-id="${l.id}">View</button>
      ${l.status === 'active' ? `
        <button class="btn btn-outline btn-sm" data-act="changePrice" data-id="${l.id}" data-price="${l.price}">Change price</button>
        <button class="btn btn-outline btn-sm" data-act="takeFloor" data-id="${l.id}" data-floor="${l.guaranteedFloor}">Take floor ${money(l.guaranteedFloor)}</button>
        <button class="btn btn-danger btn-sm" data-act="remove" data-id="${l.id}">Remove</button>` : ''}
    </div>
  </div>`).join('')
  : emptyState('🚗', "You haven't listed a car yet.", '<a class="btn btn-primary" href="#/sell">+ Sell your car</a>');

const receivedTab = (items) => items.length ? items.map((o) => `
  <div class="dash-item">
    ${o.listingPhoto ? `<img class="thumb" src="${esc(o.listingPhoto)}" alt="">` : '<div class="thumb-empty"></div>'}
    <div class="info">
      <b>${money(o.amount)} <span style="font-weight:500;font-size:13px;color:var(--muted)">for ${esc(o.listingTitle)} · asking ${money(o.asking)}</span></b>
      <span>${esc(o.buyer.name)}
        ${o.verifiedFunds ? '<span class="pill green">✓ funds verified</span>' : '<span class="pill gray">unverified</span>'}
        ${o.fromStanding ? '<span class="pill pur">standing bid</span>' : ''}
        ${o.autoHandled ? '<span class="pill blue">auto-handled</span>' : ''} · ${timeAgo(o.createdAt)}
        ${o.status === 'accepted' && o.buyer.phone ? ` · 📞 ${esc(o.buyer.phone)}` : ''}</span>
      ${o.message ? `<div class="offer-msg">💬 ${esc(o.message)}</div>` : ''}
      ${o.scamFlags?.length ? `<div class="scam-warn">🚨 ${o.scamFlags.map((f) => esc(f.warning)).join(' ')}</div>` : ''}
    </div>
    <div class="actions">
      ${['pending', 'countered'].includes(o.status) ? `
        <button class="btn btn-green btn-sm" data-act="accept" data-id="${o.id}">Accept ${money(o.amount)}</button>
        <button class="btn btn-outline btn-sm" data-act="counter" data-id="${o.id}" data-amount="${o.amount}">Counter</button>
        <button class="btn btn-outline btn-sm" data-act="decline" data-id="${o.id}">Decline</button>`
        : `<span class="pill ${o.status === 'accepted' ? 'green' : 'red'}">${esc(o.status)}</span>`}
      ${o.status === 'countered' ? `<span class="pill amber">countered ${money(o.counterAmount)}</span>` : ''}
    </div>
  </div>`).join('')
  : emptyState('📭', 'No offers yet. They land here the moment a buyer bites.');

const madeTab = (items) => items.length ? items.map((o) => `
  <div class="dash-item">
    ${o.listingPhoto ? `<img class="thumb" src="${esc(o.listingPhoto)}" alt="">` : '<div class="thumb-empty"></div>'}
    <div class="info">
      <b>${esc(o.listingTitle)}</b>
      <span>your offer ${money(o.amount)} · asking ${money(o.asking)} · ${timeAgo(o.createdAt)}${o.fromStanding ? ' · from a standing bid' : ''}</span>
      ${o.status === 'countered' ? `<div class="offer-msg">↩️ Seller countered at <b>${money(o.counterAmount)}</b>${o.autoHandled ? ' (automatically)' : ''}</div>` : ''}
    </div>
    <div class="actions">
      ${o.status === 'countered' ? `
        <button class="btn btn-green btn-sm" data-act="acceptCounter" data-id="${o.id}">Accept ${money(o.counterAmount)}</button>
        <button class="btn btn-outline btn-sm" data-act="withdraw" data-id="${o.id}">Walk away</button>`
        : o.status === 'pending'
          ? `<span class="pill amber">pending</span><button class="btn btn-outline btn-sm" data-act="withdraw" data-id="${o.id}">Withdraw</button>`
          : `<span class="pill ${o.status === 'accepted' ? 'green' : 'red'}">${esc(o.status)}</span>`}
      <button class="btn btn-outline btn-sm" data-act="open" data-id="${o.listingId}">View car</button>
    </div>
  </div>`).join('')
  : emptyState('💸', 'No offers yet.<br>Find a car and hit Make Offer — or set a standing bid and let cars come to you.');

const standingTab = (items) => `
  <div class="panel">
    <h3>Standing bids</h3>
    <p class="hint">A limit order for cars. Name your price once; when a matching car is listed, your offer is already waiting on the seller's screen before anyone else has seen it.</p>
    <button class="btn btn-primary" data-act="newBid">+ New standing bid</button>
  </div>
  ${items.length ? items.map((b) => `
    <div class="dash-item">
      <div class="avatar">⚡</div>
      <div class="info">
        <b>${money(b.amount)} for ${esc(b.make || 'any make')} ${esc(b.model || '')}</b>
        <span>${b.yearMin ? `${b.yearMin}+` : 'any year'} · ${b.maxMiles ? `under ${miles(b.maxMiles)}` : 'any mileage'} · ${esc(b.state || 'any state')}</span>
        <span class="pill ${b.matchCount ? 'green' : 'gray'}">${b.matchCount} matching car${b.matchCount === 1 ? '' : 's'} right now</span>
      </div>
      <div class="actions">
        ${b.matchCount ? `<button class="btn btn-green btn-sm" data-act="fireBid" data-id="${b.id}">Send offers now</button>` : ''}
        <button class="btn btn-outline btn-sm" data-act="delBid" data-id="${b.id}">Remove</button>
      </div>
    </div>`).join('')
    : emptyState('⚡', 'No standing bids yet.')}`;

const holdsTab = (items) => items.length ? items.map((l) => `
  <div class="dash-item">
    ${cardThumb(l)}
    <div class="info">
      <b>${l.year} ${esc(l.make)} ${esc(l.model)}</b>
      <span>${money(l.price)} · held until ${new Date(l.heldUntil).toLocaleString()}</span>
      <span class="pill amber">⏱ ${timeLeft(l.heldUntil)} · $500 refundable</span>
    </div>
    <div class="actions">
      <button class="btn btn-outline btn-sm" data-act="open" data-id="${l.id}">View</button>
      <button class="btn btn-outline btn-sm" data-act="releaseHold" data-id="${l.id}">Release hold</button>
    </div>
  </div>`).join('')
  : emptyState('🔒', 'No active holds. Use "Hold it" on any car you need time to inspect.');

const favoritesTab = (items) => items.length ? items.map((l) => `
  <div class="dash-item">
    ${cardThumb(l)}
    <div class="info"><b>${l.year} ${esc(l.make)} ${esc(l.model)}</b>
      <span>${money(l.price)} · ${esc(l.city)}, ${esc(l.state)}</span></div>
    <div class="actions">
      <button class="btn btn-outline btn-sm" data-act="open" data-id="${l.id}">View</button>
      <button class="btn btn-outline btn-sm" data-act="unfav" data-id="${l.id}">Unsave</button>
    </div>
  </div>`).join('')
  : emptyState('❤️', 'No saved cars yet. Tap the heart on any listing.');

/* ---------------- modals ---------------- */

function simpleForm(root, { title, sub, body, submit, run }) {
  const back = modal(`<h2>${title}</h2><p class="sub">${sub}</p>
    <form class="form-grid" novalidate><div class="form-err" data-form-error hidden></div>${body}
    <button class="btn btn-primary btn-lg" type="submit">${submit}</button></form>`);
  const form = $('form', back);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      await run(form);
      closeModal();
      paint(root);
    } catch (err) {
      showFormErrors(form, err);
      button.disabled = false;
    }
  });
  return back;
}

const priceModal = (root, id, price) => simpleForm(root, {
  title: 'Change your price',
  sub: 'Buyers see the drop on your card, which is exactly why price cuts work.',
  body: `<div class="f"><label for="np">New price (USD)</label><input id="np" name="price" type="number" value="${price}"></div>`,
  submit: 'Update price',
  run: async (form) => {
    await api.patch(`/api/listings/${id}/price`, { price: Number($('#np', form).value) });
    toast('Price updated.');
  }
});

const counterModal = (root, id, amount) => simpleForm(root, {
  title: 'Counter this offer',
  sub: `They offered ${money(amount)}. Name your number.`,
  body: `<div class="f"><label for="ca">Counter amount (USD)</label><input id="ca" name="amount" type="number" value="${Math.round(amount * 1.05)}"></div>`,
  submit: 'Send counter',
  run: async (form) => {
    await api.post(`/api/offers/${id}/counter`, { amount: Number($('#ca', form).value) });
    toast('Counter sent.');
  }
});

const bidModal = (root) => {
  const meta = store.meta || { makes: [], states: [] };
  return simpleForm(root, {
    title: 'Create a standing bid',
    sub: 'Like a limit order for cars: the moment a matching listing appears, your offer is on the seller\'s screen.',
    body: `
      <div class="row2">
        <div class="f"><label for="b-make">Make</label><select id="b-make" name="make"><option value="">Any</option>
          ${meta.makes.map((m) => `<option>${esc(m)}</option>`).join('')}</select></div>
        <div class="f"><label for="b-model">Model contains <span class="sublabel">optional</span></label><input id="b-model" name="model" placeholder="Camry"></div>
      </div>
      <div class="row3">
        <div class="f"><label for="b-year">Year from</label><input id="b-year" name="yearMin" type="number" placeholder="2018"></div>
        <div class="f"><label for="b-miles">Max miles</label><input id="b-miles" name="maxMiles" type="number" placeholder="70000"></div>
        <div class="f"><label for="b-state">State</label><select id="b-state" name="state"><option value="">Any</option>
          ${meta.states.map((s) => `<option>${esc(s)}</option>`).join('')}</select></div>
      </div>
      <div class="f"><label for="b-amount">I will pay up to</label><input id="b-amount" name="amount" type="number" placeholder="18000"></div>`,
    submit: 'Create standing bid',
    run: async (form) => {
      const { bid } = await api.post('/api/standing-bids', {
        make: $('#b-make', form).value,
        model: $('#b-model', form).value.trim(),
        yearMin: Number($('#b-year', form).value) || 0,
        maxMiles: Number($('#b-miles', form).value) || 0,
        state: $('#b-state', form).value,
        amount: Number($('#b-amount', form).value)
      });
      toast(bid?.matchCount ? `Standing bid live — ${bid.matchCount} car${bid.matchCount > 1 ? 's' : ''} already match.` : 'Standing bid live. We are watching for matches.');
    }
  });
};

function floorModal(root, id, floor) {
  const back = modal(`<h2>Sell to Driveway now?</h2>
    <p class="sub">Your listing closes immediately and you take the guaranteed floor.</p>
    <div class="note">You would receive <b>${money(floor)}</b>. This is deliberately below private-sale money — it is the price of certainty, and it exists so that trying the private market first costs you nothing.</div>
    <div class="note demo"><b>Prototype note:</b> a real build settles this through a wholesale buying partner.</div>
    <div class="wizard-nav"><button class="btn btn-outline" data-cancel>Keep my listing</button>
      <button class="btn btn-primary" data-go>Take ${money(floor)}</button></div>`);
  back.querySelector('[data-cancel]').addEventListener('click', closeModal);
  back.querySelector('[data-go]').addEventListener('click', async () => {
    const res = await api.post(`/api/listings/${id}/take-floor`);
    closeModal();
    toast(`Sold at the guaranteed floor: ${money(res.price)}.`);
    paint(root);
  });
}

function removeModal(root, id) {
  const back = modal(`<h2>Remove this listing?</h2>
    <p class="sub">It disappears from search and its photos are deleted. This cannot be undone.</p>
    <div class="wizard-nav"><button class="btn btn-outline" data-cancel>Keep it</button>
      <button class="btn btn-danger" data-go>Remove listing</button></div>`);
  back.querySelector('[data-cancel]').addEventListener('click', closeModal);
  back.querySelector('[data-go]').addEventListener('click', async () => {
    await api.del(`/api/listings/${id}`);
    closeModal();
    toast('Listing removed.');
    paint(root);
  });
}
