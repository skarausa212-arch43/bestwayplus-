import { money, miles, esc, timeAgo, timeLeft } from './format.js';
import { store } from './state.js';

/** Trust badges: the short signals that tell a buyer whether to bother. */
export function trustBadges(l) {
  const out = [];
  const h = l.history;
  if (h) {
    out.push(h.titleBrand === 'Clean'
      ? '<span class="tb ok">✓ Clean title</span>'
      : `<span class="tb bad">⚠ ${esc(h.titleBrand)} title</span>`);
    if (h.recalls?.length) out.push(`<span class="tb warn">⚠ ${h.recalls.length} open recall</span>`);
    if (h.obd && !h.obd.codes?.length && h.obd.ready) out.push('<span class="tb info">✓ OBD clean</span>');
    if (h.flood) out.push('<span class="tb bad">⚠ Flood area</span>');
    if (h.rustYears) out.push(`<span class="tb warn">❄ Salt belt ${h.rustYears}y</span>`);
  }
  const tags = new Set((l.photos || []).map((p) => p.tag));
  const required = ['front', 'rear', 'side', 'interior', 'dash', 'odometer', 'vin', 'engine'];
  if (required.every((t) => tags.has(t))) out.push('<span class="tb ok">✓ Photos verified</span>');
  if (l.audio) out.push('<span class="tb pur">♪ Cold start</span>');
  if (l.fuel === 'Electric' && l.evSoh) {
    out.push(`<span class="tb ${l.evSoh >= 90 ? 'ok' : 'warn'}">🔋 ${l.evSoh}%</span>`);
  }
  if (l.seller?.highVolume) out.push(`<span class="tb warn">⚑ ${l.seller.highVolume} listings/30d</span>`);
  return out.slice(0, 4).join('');
}

const photoOf = (l, key = 'thumbUrl') =>
  l.photos?.length
    ? `<img src="${esc(l.photos[0][key])}" alt="${esc(`${l.year} ${l.make} ${l.model}`)}" loading="lazy">`
    : '<div class="noimg">No photos yet</div>';

export function carCard(l) {
  const isNew = Date.now() - l.createdAt < 48 * 36e5;
  const previous = l.priceHistory?.length > 1 ? l.priceHistory[0].price : null;
  const badge = l.status === 'sold' ? '<span class="badge sold">SOLD</span>'
    : l.hold ? '<span class="badge hold">ON HOLD</span>'
    : isNew ? '<span class="badge new">NEW</span>' : '';

  return `<article class="car-card" data-act="open" data-id="${l.id}">
    <div class="car-photo">
      ${photoOf(l)}
      ${badge}
      <span class="deal ${l.deal.key}">${esc(l.deal.label)}</span>
      <button class="fav-btn" data-act="fav" data-id="${l.id}" aria-label="Save">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${l.favorited ? '#ef4444' : 'none'}" stroke="${l.favorited ? '#ef4444' : '#64748b'}" stroke-width="2">
          <path d="M12 21C7 16.5 3 13.3 3 9.3 3 6.4 5.2 4 8 4c1.6 0 3.1.8 4 2 .9-1.2 2.4-2 4-2 2.8 0 5 2.4 5 5.3 0 4-4 7.2-9 11.7z"/></svg>
      </button>
    </div>
    <div class="car-body">
      <div class="car-price">${money(l.price)}
        ${previous && previous > l.price ? `<span class="was">${money(previous)}</span>` : ''}
        <span class="offer-tag">or best offer</span></div>
      <div class="car-title">${l.year} ${esc(l.make)} ${esc(l.model)}</div>
      <div class="car-meta"><span>${miles(l.miles)}</span>·<span>${esc(l.transmission)}</span>·<span>${esc(l.fuel)}</span></div>
      <div class="trust-row">${trustBadges(l)}</div>
      <div class="car-loc">
        <span>📍 ${esc(l.city)}, ${esc(l.state)}</span>
        ${l.deadlineAt && l.deadlineAt > Date.now() ? `<span class="deadline">⏱ ${timeLeft(l.deadlineAt)}</span>` : ''}
      </div>
    </div>
  </article>`;
}

export const cardThumb = (l) =>
  l.photos?.length
    ? `<img class="thumb" src="${esc(l.photos[0].thumbUrl)}" alt="">`
    : '<div class="thumb-empty"></div>';

export const skeletonGrid = (n = 8) =>
  `<div class="grid">${Array.from({ length: n }, () => '<div class="skeleton"></div>').join('')}</div>`;

export const emptyState = (icon, text, action = '') =>
  `<div class="empty"><div class="big">${icon}</div>${text}${action ? `<br><br>${action}` : ''}</div>`;

export const sellerLine = (seller) => {
  if (!seller) return '';
  if (!seller.rating) return '<span>New seller · no completed deals yet</span>';
  return `<span><span class="stars">${'★'.repeat(Math.round(seller.rating))}</span> ${seller.rating} · ${seller.deals} deal${seller.deals === 1 ? '' : 's'}</span>`;
};

export const ago = timeAgo;
export const zipOf = () => store.zip;
