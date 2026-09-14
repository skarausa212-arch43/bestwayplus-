import { money, miles, esc, timeAgo, timeLeft } from './format.js';
import { store } from './state.js';
import { icon, iconFilled } from './icons.js';
import { cardPlate } from './plate.js';

/** An estimate only: there is no lender, so this is arithmetic, not an offer. */
export const FINANCE = { apr: 7.4, termMonths: 72, downPct: 0.1 };

export function monthlyPayment(price, { apr = FINANCE.apr, term = FINANCE.termMonths, down = null } = {}) {
  const principal = Math.max(0, price - (down == null ? price * FINANCE.downPct : down));
  const r = apr / 100 / 12;
  if (!principal) return 0;
  if (!r) return Math.round(principal / term);
  return Math.round((principal * r) / (1 - Math.pow(1 + r, -term)));
}

/**
 * Trust badges: the short signals that tell a buyer whether to bother.
 * Capped at four on a card — the rest live on the listing page, where there is
 * room to explain them.
 */
export function trustBadges(l, limit = 4) {
  const out = [];
  const h = l.history;
  const tb = (kind, ico, text) => `<span class="tb ${kind}">${icon(ico, { size: 13 })}${text}</span>`;

  if (h) {
    out.push(h.titleBrand === 'Clean'
      ? tb('ok', 'checkCircle', 'Clean title')
      : tb('bad', 'alert', `${esc(h.titleBrand)} title`));
    if (h.recalls?.length) out.push(tb('warn', 'alert', `${h.recalls.length} open recall`));
    if (h.obd && !h.obd.codes?.length && h.obd.ready) out.push(tb('info', 'plug', 'OBD clean'));
    if (h.flood) out.push(tb('bad', 'alert', 'Flood area'));
    if (h.rustYears) out.push(tb('warn', 'snowflake', `Salt belt ${h.rustYears}y`));
  }
  const tags = new Set((l.photos || []).map((p) => p.tag));
  const required = ['front', 'rear', 'side', 'interior', 'dash', 'odometer', 'vin', 'engine'];
  if (required.every((t) => tags.has(t))) out.push(tb('ok', 'camera', 'Photos verified'));
  if (l.audio) out.push(tb('info', 'waveform', 'Cold start'));
  if (l.fuel === 'Electric' && l.evSoh) {
    out.push(tb(l.evSoh >= 90 ? 'ok' : 'warn', 'battery', `Battery ${l.evSoh}%`));
  }
  if (l.seller?.highVolume) out.push(tb('warn', 'flag', `${l.seller.highVolume} listings/30d`));
  return out.slice(0, limit).join('');
}

const photoOf = (l, key = 'thumbUrl') =>
  l.photos?.length
    ? `<img src="${esc(l.photos[0][key])}" alt="${esc(`${l.year} ${l.make} ${l.model}`)}" loading="lazy">`
    : cardPlate(l);

/**
 * A vehicle card carries what a buyer compares on: price, the payment that
 * price implies, the car, how it is driven, where it is, and who is selling.
 * Everything else — recalls, rust, battery health — is progressive disclosure:
 * at most four badges here, the full picture one click away.
 */
export function carCard(l) {
  const isNew = Date.now() - l.createdAt < 48 * 36e5;
  const previous = l.priceHistory?.length > 1 ? l.priceHistory[0].price : null;
  const badge = l.status === 'sold' ? '<span class="badge sold">SOLD</span>'
    : l.hold ? '<span class="badge hold">ON HOLD</span>'
    : isNew ? '<span class="badge new">JUST LISTED</span>' : '';
  const mo = monthlyPayment(l.price);

  return `<article class="car-card" data-act="open" data-id="${l.id}" tabindex="0"
      aria-label="${esc(`${l.year} ${l.make} ${l.model}`)}, ${money(l.price)}">
    <div class="car-photo">
      ${photoOf(l)}
      ${badge}
      <span class="deal ${l.deal.key}">${esc(l.deal.label)}</span>
      <button class="fav-btn${l.favorited ? ' on' : ''}" data-act="fav" data-id="${l.id}"
        aria-pressed="${l.favorited ? 'true' : 'false'}" aria-label="Save this car">
        ${l.favorited ? iconFilled('heart', { size: 18 }) : icon('heart', { size: 18 })}
      </button>
    </div>
    <div class="car-body">
      <div class="car-price">${money(l.price)}
        ${previous && previous > l.price ? `<span class="was">${money(previous)}</span>` : ''}
        <span class="offer-tag">or best offer</span></div>
      <div class="car-mo"><b>${money(mo)}/mo</b>
        <i>est. · ${FINANCE.termMonths} mo at ${FINANCE.apr}%</i></div>
      <div>
        <div class="car-title">${l.year} ${esc(l.make)} ${esc(l.model)}</div>
        ${l.trim ? `<div class="car-trim">${esc(l.trim)}</div>` : ''}
      </div>
      <div class="car-meta">
        <span>${icon('odometer', { size: 13 })}<i>${miles(l.miles)}</i></span>
        <span>${icon('steering', { size: 13 })}<i>${esc(l.drivetrain || l.transmission)}</i></span>
        <span>${icon(l.fuel === 'Electric' ? 'bolt' : 'fuel', { size: 13 })}<i>${esc(l.fuel)}</i></span>
      </div>
      <div class="trust-row">${trustBadges(l)}</div>
      <div class="car-loc">
        <span>${icon('pin', { size: 14 })}${esc(l.city)}, ${esc(l.state)}</span>
        ${l.deadlineAt && l.deadlineAt > Date.now()
          ? `<span class="deadline">${icon('clock', { size: 14 })}${timeLeft(l.deadlineAt)}</span>`
          : `<span class="car-seller">${sellerRating(l.seller)}</span>`}
      </div>
    </div>
  </article>`;
}

/** Ratings are the only place gold appears. A seller with no deals says so. */
function sellerRating(seller) {
  if (!seller) return '';
  if (!seller.rating) return 'New seller';
  return `<span class="rate">${icon('star', { size: 13 })}${seller.rating}</span>
    <span>· ${seller.deals} deal${seller.deals === 1 ? '' : 's'}</span>`;
}

export const cardThumb = (l) =>
  l.photos?.length
    ? `<img class="thumb" src="${esc(l.photos[0].thumbUrl)}" alt="">`
    : '<div class="thumb-empty"></div>';

export const skeletonGrid = (n = 8) =>
  `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join('')}</div>`;

export const emptyState = (iconName, text, action = '') =>
  `<div class="empty"><div class="big">${icon(iconName, { size: 42 })}</div>${text}${action ? `<br><br>${action}` : ''}</div>`;

export const sellerLine = (seller) => {
  if (!seller) return '';
  if (!seller.rating) return '<span>New seller · no completed deals yet</span>';
  const full = Math.round(seller.rating);
  const stars = Array.from({ length: 5 }, (_, i) =>
    i < full ? iconFilled('star', { size: 14 }) : icon('star', { size: 14 })).join('');
  return `<span><span class="stars">${stars}</span> ${seller.rating} · ${seller.deals} deal${seller.deals === 1 ? '' : 's'}</span>`;
};

export const ago = timeAgo;
export const zipOf = () => store.zip;
