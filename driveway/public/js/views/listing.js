import { api } from '../api.js';
import { store, modal, closeModal, showFormErrors, clearFormErrors } from '../state.js';
import { money, miles, esc, timeAgo, timeLeft, date, onClick, $, toast } from '../format.js';
import { trustBadges, sellerLine, emptyState } from '../ui.js';
import { revealOnScroll, stagger } from '../motion.js';
import { requireAuth } from '../auth.js';

let current = null;
let galleryIndex = 0;

export async function renderListing(root, id) {
  root.innerHTML = '<div class="page wide"><div class="skeleton" style="height:420px"></div></div>';
  let data;
  try {
    data = await api.get(`/api/listings/${id}`, { zip: store.zip });
  } catch (err) {
    root.innerHTML = `<div class="page">${emptyState('⚠️', esc(err.message), '<a class="btn btn-outline" href="#/browse">Back to listings</a>')}</div>`;
    return;
  }

  current = data;
  galleryIndex = 0;
  root.innerHTML = `<div class="page wide">${view(data)}</div>`;
  wire(root, data);
  stagger($('.spec-grid', root), '.spec', { step: 45 });
  revealOnScroll(root);
}

const photoUrl = (l, i) => l.photos[i]?.url;

function gallery(l) {
  if (!l.photos.length) {
    return `<div class="gallery"><div class="main"><div class="noimg" style="height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8">No photos yet</div></div></div>`;
  }
  return `<div class="gallery">
    <div class="main"><img id="galMain" src="${esc(l.photos[0].url)}" alt="${esc(`${l.year} ${l.make} ${l.model}`)}"></div>
    <div class="shot-tag" id="shotTag">${esc(tagLabel(l.photos[0].tag))}</div>
    ${l.photos.length > 1 ? `<button class="gal-nav gal-prev" data-act="prev" aria-label="Previous photo">‹</button>
      <button class="gal-nav gal-next" data-act="next" aria-label="Next photo">›</button>
      <div class="thumbs" id="thumbs">${l.photos.map((p, i) =>
        `<img src="${esc(p.thumbUrl)}" class="${i ? '' : 'on'}" data-act="thumb" data-i="${i}" alt="">`).join('')}</div>` : ''}
  </div>`;
}

const tagLabel = (key) =>
  (store.meta?.photoTags || []).find((t) => t.key === key)?.label || 'Photo';

function view({ listing: l, relatedSales, buyerContext, offers }) {
  const mine = store.user && store.user.id === l.sellerId;
  const h = l.history;

  return `<a href="#/browse" style="font-size:14px">← All listings</a>
  <div class="detail" style="margin-top:14px">
    <div>
      ${gallery(l)}
      <h1 style="margin-top:18px">${l.year} ${esc(l.make)} ${esc(l.model)}</h1>
      <div class="detail-price">${money(l.price)}
        <span class="deal ${l.deal.key}">${esc(l.deal.label)}</span>
        <span class="car-price"><span class="offer-tag">or best offer</span></span></div>
      <div style="font-size:13.5px;color:var(--muted)">
        📍 ${esc(l.city)}, ${esc(l.state)} · listed ${timeAgo(l.createdAt)} · est. market ${money(l.marketValue)}
        ${l.valuationBasis === 'comps' ? ` (from ${l.compCount} real sales)` : ' (model estimate)'}
        ${l.deadlineAt && l.deadlineAt > Date.now() ? ` · <b style="color:var(--amber)">offers close in ${timeLeft(l.deadlineAt)}</b>` : ''}
      </div>
      <div class="trust-row" style="margin-top:10px">${trustBadges(l)}</div>

      ${l.offerCount ? `<div class="note warn" style="margin-top:14px">
        <b>🔥 ${l.offerCount} active offer${l.offerCount > 1 ? 's' : ''}.</b>
        Best one sits in the <b>${money(l.bestOfferRange.low)}–${money(l.bestOfferRange.high)}</b> range. Exact amounts stay private.</div>` : ''}

      <div class="spec-grid">
        <div class="spec"><span>Mileage</span><b>${miles(l.miles)}</b></div>
        <div class="spec"><span>Body</span><b>${esc(l.body)}</b></div>
        <div class="spec"><span>Transmission</span><b>${esc(l.transmission)}</b></div>
        <div class="spec"><span>Fuel</span><b>${esc(l.fuel)}</b></div>
        ${l.towLb ? `<div class="spec"><span>Tow rating</span><b>${l.towLb.toLocaleString()} lb</b></div>` : ''}
        ${l.evSoh ? `<div class="spec"><span>Battery health</span><b>${l.evSoh}%</b></div>` : ''}
        ${l.safety ? `<div class="spec"><span>Safety</span><b>${'★'.repeat(l.safety)}</b></div>` : ''}
        <div class="spec"><span>Depreciation</span><b>~${money(l.depreciationPerMonth)}/mo</b></div>
      </div>

      <p class="desc">${esc(l.description || 'No description provided.')}</p>

      ${h ? `<div class="box reveal"><h4>🛡️ Free vehicle history</h4>
        <div class="kv"><span>Title brand</span><b style="color:${h.titleBrand === 'Clean' ? 'var(--green)' : 'var(--red)'}">${esc(h.titleBrand)}</b></div>
        <div class="kv"><span>Reported owners</span><b>${h.owners}</b></div>
        <div class="kv"><span>Reported accidents</span><b>${h.accidents}</b></div>
        <div class="kv"><span>Flood-disaster area</span><b>${h.flood ? '⚠ Yes' : 'No'}</b></div>
        <div class="kv"><span>Years in road-salt states</span><b>${h.rustYears}</b></div>
        <div class="kv"><span>Open safety recalls</span><b style="color:${h.recalls.length ? 'var(--amber)' : 'var(--green)'}">${h.recalls.length ? esc(h.recalls.join('; ')) : 'None'}</b></div>
        <div class="note">${esc(h.source)}</div></div>` : ''}

      ${l.audio ? `<div class="box reveal"><h4>🎧 Cold-start recording</h4>
        <div class="audio-row"><audio controls preload="none" src="${esc(l.audio.url)}"></audio></div>
        <div class="note">Recorded by the seller on a cold engine. Listen for knocking, belt squeal or a rough idle.</div></div>` : ''}

      ${h?.obd ? `<div class="box reveal"><h4>🔌 Diagnostic self-check</h4>
        <div class="kv"><span>Stored fault codes</span><b style="color:${h.obd.codes?.length ? 'var(--red)' : 'var(--green)'}">${h.obd.codes?.length ? esc(h.obd.codes.join(', ')) : 'None'}</b></div>
        <div class="kv"><span>Readiness monitors</span><b style="color:${h.obd.ready ? 'var(--green)' : 'var(--amber)'}">${h.obd.ready ? 'All ready' : 'Not ready — codes may have been cleared recently'}</b></div>
        <div class="note">Self-reported by the seller from an OBD-II adapter, not verified by Driveway.</div></div>` : ''}

      ${l.serviceRecords.length ? `<div class="box reveal"><h4>📒 Digital logbook</h4>
        ${l.serviceRecords.map((r) => `<div class="kv"><span>${date(r.at)}</span><b>${esc(r.title)}</b></div>`).join('')}
        <div class="note">Service records stay attached to this VIN — the next owner inherits them.</div></div>` : ''}

      ${l.priceHistory.length > 1 ? `<div class="box reveal"><h4>📉 Price history</h4>
        ${l.priceHistory.map((p) => `<div class="kv"><span>${date(p.at)}</span><b>${money(p.price)}</b></div>`).join('')}</div>` : ''}

      ${relatedSales.length ? `<div class="box reveal"><h4>💵 What these actually sold for</h4>
        <div class="table-wrap"><table class="data">
          <tr><th>Car</th><th>Miles</th><th>Sold for</th><th>When</th></tr>
          ${relatedSales.map((s) => `<tr><td>${s.year} ${esc(s.make)} ${esc(s.model)}</td><td>${miles(s.miles)}</td>
            <td><b style="color:var(--green)">${money(s.price)}</b></td><td>${timeAgo(s.at)}</td></tr>`).join('')}
        </table></div>
        <div class="note">Real accepted-offer prices, not asking prices.</div></div>` : ''}

      ${mine && offers?.length ? `<div class="box reveal"><h4>📥 Offers on your listing</h4>
        ${offers.map((o) => `<div class="kv"><span>${esc(o.buyer.name)} ${o.verifiedFunds ? '<span class="pill green">✓ verified</span>' : ''}</span>
          <b>${money(o.amount)} · ${esc(o.status)}</b></div>`).join('')}
        <a class="btn btn-outline btn-sm" href="#/garage" style="margin-top:10px">Manage in My garage</a></div>` : ''}

      <div class="box reveal"><h4>🤖 Ask about this car</h4>
        <div class="qa-log" id="qaLog"><div class="qa-msg bot">Ask about features, condition, cost or paperwork. I answer from the listing data and pass anything I don't know to the seller.</div></div>
        <div style="display:flex;gap:8px">
          <input id="qaInput" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px" placeholder="Does it have Apple CarPlay?">
          <button class="btn btn-outline btn-sm" data-act="ask">Ask</button></div>
      </div>
    </div>

    <aside>
      <div class="seller-card">
        <div class="who"><div class="avatar">${esc((l.seller?.name || 'S')[0]).toUpperCase()}</div>
          <div><b>${esc(l.seller?.name || 'Private seller')}</b>${sellerLine(l.seller)}</div></div>
        ${l.seller?.highVolume ? `<div class="pill amber" style="display:block;text-align:center;margin-bottom:10px">⚑ ${l.seller.highVolume} listings in 30 days — may be a dealer</div>` : ''}

        ${l.status === 'sold'
          ? `<div class="pill red" style="display:block;text-align:center;padding:10px">Sold for ${money(l.sale.price)}</div>`
          : mine
            ? `<div class="pill gray" style="display:block;text-align:center;padding:10px;margin-bottom:10px">This is your listing</div>
               <a class="btn btn-outline" href="#/garage">Manage in My garage</a>`
            : `${l.hold && !l.hold.mine ? `<div class="pill amber" style="display:block;text-align:center;margin-bottom:10px">On hold for another buyer · ${timeLeft(l.hold.until)}</div>` : ''}
               <button class="btn btn-green btn-lg" data-act="offer">💰 Make Offer</button>
               ${l.hold ? '' : `<button class="btn btn-outline" data-act="hold">🔒 Hold it for ${store.meta?.holdHours ?? 48}h ($500 refundable)</button>`}
               <button class="btn btn-outline" data-act="fav">${l.favorited ? '♥ Saved' : '♡ Save'}</button>`}

        ${l.rules?.enabled ? '<div class="note good">⚡ This seller answers offers automatically — you get a reply instantly.</div>' : ''}

        <div class="box" style="box-shadow:none;border:1px solid var(--line)"><h4>📍 Cost in your state</h4>
          <div class="f" style="margin-bottom:8px"><input id="zipInput" maxlength="5" inputmode="numeric" placeholder="Your ZIP code" value="${esc(store.zip)}"></div>
          ${buyerContext ? costPanel(l, buyerContext) : '<div class="note">Enter your ZIP to price out tax, registration, insurance and fuel for this exact car.</div>'}
        </div>

        ${buyerContext ? registrationPanel(buyerContext) : ''}
        ${buyerContext?.shipping ? shippingPanel(buyerContext.shipping) : ''}

        <div class="box" style="box-shadow:none;border:1px solid var(--line)"><h4>🤝 Safe meetup</h4>
          <div style="font-size:13px;color:var(--muted);line-height:1.5">Meet at a police-station safe exchange zone in ${esc(l.city)} — open 24/7 and covered by cameras. Both sides verify ID in the app first.</div></div>

        <div class="note">🛡️ Never wire money in advance, check the title matches the seller's ID, and have a mechanic look at it before you pay.</div>
      </div>
    </aside>
  </div>`;
}

const costPanel = (l, ctx) => {
  const c = ctx.costToOwn;
  return `<div class="kv"><span>Sales tax (${esc(ctx.state)} ${c.salesTaxPct}%)</span><b>${money(c.salesTax)}</b></div>
    <div class="kv"><span>Title + registration</span><b>${money(c.titleAndRegistration)}</b></div>
    <div class="kv"><span>Due at purchase</span><b>${money(c.dueAtPurchase)}</b></div>
    <div class="kv"><span>Insurance est.</span><b>${money(c.insurancePerMonth)}/mo</b></div>
    <div class="kv"><span>Fuel / energy est.</span><b>${money(c.fuelPerMonth)}/mo</b></div>
    <div class="kv"><span>Maintenance est.</span><b>${money(c.maintenancePerMonth)}/mo</b></div>
    <div class="kv"><span><b>All-in monthly</b></span><b style="color:var(--accent)">${money(c.allInPerMonth)}/mo</b></div>
    <div class="note">${esc(c.disclaimer)}</div>`;
};

const registrationPanel = (ctx) => {
  const r = ctx.registration;
  return `<div class="box" style="box-shadow:none;border:1px solid var(--line)"><h4>📋 Can you register it?</h4>
    <div class="kv"><span>Emissions / safety test</span><b>${r.testRequired ? 'Required' : 'Not required'}</b></div>
    <div class="kv"><span>${esc(r.state)} emissions standard</span><b>${esc(r.emissionsNote)}</b></div>
    <div class="kv"><span>Out-of-state purchase</span><b>${esc(r.outOfStateNote)}</b></div>
    ${r.brandedTitleWarning ? `<div class="note bad">${esc(r.brandedTitleWarning)}</div>` : ''}
    <div class="note">${esc(r.disclaimer)}</div></div>`;
};

const shippingPanel = (s) => `<div class="box" style="box-shadow:none;border:1px solid var(--line)"><h4>🚚 Get it to you</h4>
  ${s.local
    ? '<div class="kv"><span>Distance</span><b>Local — go and see it</b></div>'
    : `<div class="kv"><span>Distance</span><b>${s.distance.toLocaleString()} mi</b></div>
       <div class="kv"><span>Carrier estimate</span><b>${money(s.price)}</b></div>
       <div class="kv"><span>Transit time</span><b>~${s.days} days</b></div>`}</div>`;

function wire(root, data) {
  const l = data.listing;

  onClick(root, {
    prev: () => showPhoto(l, galleryIndex - 1),
    next: () => showPhoto(l, galleryIndex + 1),
    thumb: (node) => showPhoto(l, Number(node.dataset.i)),
    ask: () => ask(l),
    fav: async () => requireAuth(async () => {
      const { favorited } = await api.post(`/api/listings/${l.id}/favorite`);
      toast(favorited ? 'Saved ❤️' : 'Removed from saved');
      renderListing(root, l.id);
    }),
    offer: () => requireAuth(() => offerModal(root, data)),
    hold: () => requireAuth(() => holdModal(root, l))
  });

  $('#qaInput', root)?.addEventListener('keydown', (e) => { if (e.key === 'Enter') ask(l); });

  $('#zipInput', root)?.addEventListener('change', (e) => {
    const zip = e.target.value.trim();
    if (zip.length === 5) {
      store.setZip(zip);
      renderListing(root, l.id);
    }
  });
}

function showPhoto(l, index) {
  if (!l.photos.length) return;
  galleryIndex = (index + l.photos.length) % l.photos.length;
  const main = $('#galMain');
  // Restart the fade so each photo arrives rather than snapping into place.
  main.style.animation = 'none';
  void main.offsetWidth;
  main.style.animation = '';
  main.src = photoUrl(l, galleryIndex);
  $('#shotTag').textContent = tagLabel(l.photos[galleryIndex].tag);
  const thumbs = $('#thumbs');
  if (thumbs) [...thumbs.children].forEach((img, i) => img.classList.toggle('on', i === galleryIndex));
}

/* ---------------- make offer ---------------- */

function offerModal(root, { listing: l, relatedSales }) {
  const suggested = Math.round((l.price * 0.94) / 50) * 50;
  const compRange = relatedSales.length
    ? `${money(Math.min(...relatedSales.map((s) => s.price)))}–${money(Math.max(...relatedSales.map((s) => s.price)))}`
    : 'no comparable sales yet';

  const back = modal(`
    <h2>Make an offer</h2>
    <p class="sub">${l.year} ${esc(l.make)} ${esc(l.model)} — asking ${money(l.price)}</p>
    <form class="form-grid" novalidate>
      <div class="form-err" data-form-error hidden></div>
      <div class="note">Market value is about <b>${money(l.marketValue)}</b>. Similar cars sold for <b>${compRange}</b>.
        A realistic offer here is around <b>${money(suggested)}</b>.
        ${l.rules?.enabled ? '<br><b style="color:var(--accent)">This seller answers automatically — expect an instant reply.</b>' : ''}</div>
      <div class="f"><label for="of-amount">Your offer (USD)</label><input id="of-amount" name="amount" type="number" value="${suggested}"></div>
      <div class="f"><label for="of-msg">Message to seller <span class="sublabel">optional</span></label>
        <textarea id="of-msg" name="message" placeholder="Hi! Can I come and see it this weekend?"></textarea></div>
      ${store.user?.fundsVerified
        ? '<div class="note good">✓ Your offer carries a <b>funds verified</b> badge — sellers see these first.</div>'
        : '<div class="note warn">Your offer is unverified. Verifying your funds from the menu makes sellers take it far more seriously.</div>'}
      <button class="btn btn-green btn-lg" type="submit">Send offer</button>
    </form>`, { wide: true });

  const form = $('form', back);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    const button = $('button[type=submit]', form);
    button.disabled = true;
    try {
      const res = await api.post(`/api/listings/${l.id}/offers`, {
        amount: Number($('#of-amount', form).value),
        message: $('#of-msg', form).value.trim()
      });
      closeModal();
      announce(res);
      renderListing(root, l.id);
    } catch (err) {
      showFormErrors(form, err);
      button.disabled = false;
    }
  });
}

function announce({ offer }) {
  if (offer.status === 'accepted') return toast(`🤝 Accepted instantly — ${money(offer.amount ?? 0) || 'the car is yours'}. Check My garage.`);
  if (offer.status === 'countered') return toast(`↩️ Instant counter: the seller wants ${money(offer.counterAmount)}.`);
  if (offer.status === 'declined') return toast('Declined automatically — the seller set a floor above that.');
  toast('✅ Offer sent to the seller.');
}

function holdModal(root, l) {
  const hours = store.meta?.holdHours ?? 48;
  const back = modal(`
    <h2>Hold this car for ${hours} hours</h2>
    <p class="sub">${l.year} ${esc(l.make)} ${esc(l.model)} — ${money(l.price)}</p>
    <div class="note">A <b>$500 refundable deposit</b> takes the car off the market so you can drive out, get an inspection or arrange financing. Nobody can buy it from under you in the meantime.</div>
    <div class="note demo"><b>Prototype note:</b> no money moves yet — real deposits need a licensed payment partner.</div>
    <button class="btn btn-primary btn-lg" style="width:100%;margin-top:14px" data-go>Place $500 refundable hold</button>`);

  back.querySelector('[data-go]').addEventListener('click', async () => {
    try {
      await api.post(`/api/listings/${l.id}/hold`);
      closeModal();
      toast(`🔒 Held for ${hours} hours. It is off the market for everyone else.`);
      renderListing(root, l.id);
    } catch (err) {
      toast(err.message);
    }
  });
}

/* ---------------- listing assistant ---------------- */

function ask(l) {
  const input = $('#qaInput');
  const question = input.value.trim();
  if (!question) return;
  const log = $('#qaLog');
  log.insertAdjacentHTML('beforeend', `<div class="qa-msg me">${esc(question)}</div>`);
  input.value = '';
  log.insertAdjacentHTML('beforeend', `<div class="qa-msg bot">${answer(l, question)}</div>`);
  log.scrollTop = log.scrollHeight;
}

function answer(l, question) {
  const q = question.toLowerCase();
  const has = (...words) => words.some((w) => q.includes(w));
  const age = Math.max(1, new Date().getFullYear() - l.year);
  const h = l.history;

  if (has('mile', 'odometer', 'km')) {
    const perYear = Math.round(l.miles / age);
    return `It shows <b>${miles(l.miles)}</b> — about ${perYear.toLocaleString()} miles a year, ${perYear < 12000 ? 'below' : 'above'} the US average.`;
  }
  if (has('accident', 'wreck', 'damage')) {
    return h ? `The history report shows <b>${h.accidents} reported accident${h.accidents === 1 ? '' : 's'}</b> and a <b>${esc(h.titleBrand.toLowerCase())}</b> title.` : 'No history data on file.';
  }
  if (has('price', 'negotiab', 'best offer', 'lower', 'discount')) {
    return `Asking is ${money(l.price)} against an estimated market value of ${money(l.marketValue)}. ${l.rules?.enabled ? 'The seller answers offers automatically, so you may get an instant reply.' : 'Use Make Offer — the seller sees every offer.'}`;
  }
  if (has('battery', 'range', 'charge')) {
    return l.fuel === 'Electric'
      ? `Battery health is <b>${l.evSoh}%</b> of original capacity — roughly ${Math.round(310 * l.evSoh / 100)} miles in mild weather, noticeably less in winter.`
      : 'This one is not electric.';
  }
  if (has('tow', 'trailer', 'haul')) {
    return l.towLb ? `Rated to tow <b>${l.towLb.toLocaleString()} lb</b>.` : 'No tow rating is listed — assume it is not a tow vehicle.';
  }
  if (has('recall')) {
    return h?.recalls.length
      ? `There ${h.recalls.length === 1 ? 'is' : 'are'} <b>${h.recalls.length} open recall${h.recalls.length === 1 ? '' : 's'}</b>: ${esc(h.recalls.join('; '))}. Recall work is free at any franchised dealer.`
      : 'No open safety recalls on this VIN.';
  }
  if (has('title', 'lien', 'loan', 'owe')) {
    return `Title brand is <b>${esc(h?.titleBrand || 'unknown')}</b>. If there is still a loan on it, Driveway pays the lender directly and releases funds only once the title is clear.`;
  }
  if (has('insur', 'cost', 'month', 'own')) {
    return store.zip
      ? `With your ZIP ${esc(store.zip)}, see the cost panel on the right — it prices out insurance, fuel, maintenance and registration for this exact car.`
      : 'Enter your ZIP in the panel on the right and I will price out insurance, fuel and registration for you.';
  }
  if (has('carplay', 'android', 'bluetooth', 'screen', 'nav')) {
    return l.year >= 2018
      ? `Not stated explicitly, but a ${l.year} ${esc(l.make)} almost certainly has Bluetooth and very likely CarPlay. I have flagged this for the seller to confirm.`
      : 'Not stated in the listing — I have passed the question to the seller.';
  }
  if (has('test drive', 'see it', 'meet', 'inspect')) {
    return `The seller is in ${esc(l.city)}, ${esc(l.state)}. Meet at the safe exchange zone listed on the right, and consider a $500 hold so nobody buys it while you travel.`;
  }
  return `I don't have that in the listing data, so I have sent the question to <b>${esc(l.seller?.name || 'the seller')}</b>. You will get an answer here.`;
}
