import { api } from '../api.js';
import { store, showFormErrors, clearFormErrors } from '../state.js';
import { money, miles, esc, onClick, $, $$, toast } from '../format.js';
import { stagger } from '../motion.js';
import { requireAuth } from '../auth.js';

const STEPS = ['Car details', 'Photos & proof', 'Price & rules', 'Review'];

let draft = null;
let step = 1;
let valuation = null;
let valuationKey = null;

const blank = () => ({
  make: '', model: '', year: '', miles: '', vin: '',
  body: 'Sedan', transmission: 'Automatic', fuel: 'Gasoline',
  doors: 4, towLb: '', evSoh: '', safety: 4,
  city: '', state: store.user?.zip ? '' : '',
  description: '', photos: [], serviceRecords: [], audio: null, obd: null,
  loanBalance: '', price: '', deadlineDays: 0,
  rulesOn: false, acceptAt: '', counterAt: '', declineBelow: ''
});

export function resetDraft() {
  draft = null;
  step = 1;
  valuation = null;
  valuationKey = null;
}

export function renderSell(root) {
  requireAuth(() => {
    if (!draft) draft = blank();
    paint(root);
  });
  if (!store.user) {
    root.innerHTML = `<div class="page"><h1>Sell your car</h1>
      <p class="lead">Sign in to publish a listing — it takes about two minutes and costs nothing.</p></div>`;
  }
}

function paint(root) {
  root.innerHTML = `<div class="page">
    <h1>Sell your car</h1>
    <p class="lead">Free to list. The extras below are what make a buyer trust you enough to send a real offer.</p>
    <div class="steps">${STEPS.map((label, i) => `
      <button class="step-pill ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}" data-act="goto" data-step="${i + 1}">
        <small>Step ${i + 1}</small><b>${label}</b></button>`).join('')}</div>
    <div class="form-err" data-form-error hidden style="margin-bottom:14px"></div>
    <div id="stepBody"></div>
  </div>`;

  const body = $('#stepBody', root);
  if (step === 1) body.innerHTML = stepCar();
  if (step === 2) { body.innerHTML = stepPhotos(); wirePhotos(root); }
  if (step === 3) { body.innerHTML = stepPrice(); wirePrice(root); loadValuation(root); }
  if (step === 4) body.innerHTML = stepReview();

  bindFields(root);
  onClick(root, {
    goto: (node) => go(root, Number(node.dataset.step)),
    next: () => go(root, step + 1),
    back: () => go(root, step - 1),
    addRecord: () => {
      const input = $('#recordInput', root);
      const value = input.value.trim();
      if (!value) return;
      draft.serviceRecords.push(value);
      paint(root);
    },
    delRecord: (node) => { draft.serviceRecords.splice(Number(node.dataset.i), 1); paint(root); },
    delPhoto: (node) => {
      const [removed] = draft.photos.splice(Number(node.dataset.i), 1);
      URL.revokeObjectURL(removed.preview);
      paint(root);
    },
    pickPhotos: () => $('#photoInput', root).click(),
    record: () => toggleRecording(root),
    delAudio: () => {
      URL.revokeObjectURL(draft.audio.url);
      draft.audio = null;
      paint(root);
    },
    scan: () => {
      // Sample result until the adapter integration exists; ~1 in 4 finds a code,
      // so the "not ready" path is visible in the flow too.
      const faulty = Math.random() < 0.25;
      draft.obd = faulty
        ? { codes: ['P0420 — catalyst efficiency below threshold'], ready: false }
        : { codes: [], ready: true };
      paint(root);
      toast(faulty ? 'Scan complete — one stored code found.' : 'Scan complete — no stored codes.');
    },
    delObd: () => { draft.obd = null; paint(root); },
    roast: () => {
      $('#roastBox', root).outerHTML = roast();
      stagger($('#roastBox', root), 'li', { step: 70 });
    },
    publish: () => publish(root)
  });
}

/* ---------------- fields ---------------- */

/**
 * Field changes update the draft and touch only the elements that depend on
 * them. Repainting the whole step on every keystroke would rebuild the input
 * the user is typing into and throw away their cursor.
 */
function bindFields(root) {
  $$('[data-field]', root).forEach((input) => {
    const key = input.dataset.field;
    input.addEventListener('input', () => {
      draft[key] = input.type === 'checkbox' ? input.checked : input.value;
      if (key === 'fuel') {
        const electric = input.value === 'Electric';
        const ev = $('[data-when="ev"]', root);
        const ice = $('[data-when="ice"]', root);
        if (ev) ev.hidden = !electric;
        if (ice) ice.hidden = electric;
      }
      if (key === 'rulesOn') {
        const block = $('#rulesBlock', root);
        if (block) block.hidden = !input.checked;
      }
      if (key === 'loanBalance') updateEquity(root);
    });
  });
}

function updateEquity(root) {
  const out = $('#equityOut', root);
  if (!out) return;
  const loan = Number(draft.loanBalance) || 0;
  const price = Number(draft.price) || 0;
  out.textContent = loan ? money(price - loan) : '—';
  out.style.color = price - loan >= 0 ? 'var(--green)' : 'var(--red)';
  const warning = $('#equityWarning', root);
  if (warning) {
    warning.hidden = !(loan > price && price > 0);
    warning.textContent = `You owe more than your asking price — you would need to bring ${money(loan - price)} to closing.`;
  }
}

const opts = (list, selected) =>
  list.map((v) => `<option value="${esc(v)}" ${String(selected) === String(v) ? 'selected' : ''}>${esc(v)}</option>`).join('');

function stepCar() {
  const meta = store.meta || { makes: [], states: [], bodies: [], fuels: [] };
  return `<div class="panel">
    <h3>What are you selling?</h3>
    <p class="hint">The VIN unlocks the free title check and recall lookup on your listing.</p>
    <div class="form-grid">
      <div class="row2">
        <div class="f"><label for="s-make">Make *</label><select id="s-make" name="make" data-field="make"><option value="">Select</option>${opts(meta.makes, draft.make)}</select></div>
        <div class="f"><label for="s-model">Model *</label><input id="s-model" name="model" data-field="model" value="${esc(draft.model)}" placeholder="Camry SE"></div>
      </div>
      <div class="row3">
        <div class="f"><label for="s-year">Year *</label><input id="s-year" name="year" data-field="year" type="number" value="${esc(draft.year)}" placeholder="2019"></div>
        <div class="f"><label for="s-miles">Mileage *</label><input id="s-miles" name="miles" data-field="miles" type="number" value="${esc(draft.miles)}" placeholder="45000"></div>
        <div class="f"><label for="s-vin">VIN <span class="sublabel">optional</span></label><input id="s-vin" name="vin" data-field="vin" maxlength="17" value="${esc(draft.vin)}" placeholder="1HGCV1F3XLA000000"></div>
      </div>
      <div class="row3">
        <div class="f"><label for="s-body">Body</label><select id="s-body" name="body" data-field="body">${opts(meta.bodies, draft.body)}</select></div>
        <div class="f"><label for="s-trans">Transmission</label><select id="s-trans" name="transmission" data-field="transmission">${opts(['Automatic', 'Manual'], draft.transmission)}</select></div>
        <div class="f"><label for="s-fuel">Fuel</label><select id="s-fuel" name="fuel" data-field="fuel">${opts(meta.fuels, draft.fuel)}</select></div>
      </div>
      <div class="row3">
        <div class="f"><label for="s-doors">Doors</label><select id="s-doors" name="doors" data-field="doors">${opts([2, 4, 5], draft.doors)}</select></div>
        <div class="f" data-when="ev" ${draft.fuel === 'Electric' ? '' : 'hidden'}>
          <label for="s-soh">Battery health % <span class="sublabel">from the car's menu</span></label>
          <input id="s-soh" name="evSoh" data-field="evSoh" type="number" value="${esc(draft.evSoh)}" placeholder="93"></div>
        <div class="f" data-when="ice" ${draft.fuel === 'Electric' ? 'hidden' : ''}>
          <label for="s-tow">Tow rating (lb) <span class="sublabel">optional</span></label>
          <input id="s-tow" name="towLb" data-field="towLb" type="number" value="${esc(draft.towLb)}" placeholder="7500"></div>
        <div class="f"><label for="s-safety">Safety rating</label><select id="s-safety" name="safety" data-field="safety">
          ${[5, 4, 3].map((n) => `<option value="${n}" ${Number(draft.safety) === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></div>
      </div>
      <div class="row2">
        <div class="f"><label for="s-city">City *</label><input id="s-city" name="city" data-field="city" value="${esc(draft.city)}" placeholder="Austin"></div>
        <div class="f"><label for="s-state">State *</label><select id="s-state" name="state" data-field="state"><option value="">Select</option>${opts(meta.states, draft.state)}</select></div>
      </div>
      <div class="f"><label for="s-desc">Description</label>
        <textarea id="s-desc" name="description" data-field="description" placeholder="Condition, service history, why you are selling. Being straight about flaws sells faster than hiding them.">${esc(draft.description)}</textarea></div>
    </div>
    ${nav(false, true)}
  </div>`;
}

function stepPhotos() {
  const tags = store.meta?.photoTags || [];
  const have = new Set(draft.photos.map((p) => p.tag));
  return `<div class="panel">
    <h3>Guided photos</h3>
    <p class="hint">Shoot these angles and your listing earns a "Photos verified" badge. The odometer and VIN shots are what serious buyers look for first.</p>
    <div class="photo-drop" id="photoDrop" data-act="pickPhotos"><b>Click to upload or drag photos here</b>JPEG, PNG or HEIC · up to ${store.meta?.limits.photosPerListing ?? 12}</div>
    <input type="file" id="photoInput" accept="image/*" multiple hidden>
    <div class="shot-list">${tags.map((t) =>
      `<span class="shot-need ${have.has(t.key) ? 'got' : ''}">${have.has(t.key) ? '✓' : t.required ? '•' : '○'} ${esc(t.label)}</span>`).join('')}</div>
    <div class="photo-previews">${draft.photos.map((p, i) => `
      <div class="ph"><img src="${p.preview}" alt="">
        <button data-act="delPhoto" data-i="${i}" aria-label="Remove photo">✕</button>
        <select data-photo-tag="${i}">${tags.map((t) => `<option value="${t.key}" ${p.tag === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
      </div>`).join('')}</div>
  </div>

  <div class="panel">
    <h3>🎧 Cold-start recording</h3>
    <p class="hint">Ten seconds of the engine starting from cold. Knocking, belt squeal and a rough idle are all audible, and a recording is far harder to fake than a photo — it is the cheapest trust you can buy, especially for buyers in another state.</p>
    ${draft.audio
      ? `<div class="audio-row"><audio controls src="${draft.audio.url}"></audio>
           <button class="btn btn-outline btn-sm" data-act="delAudio">Remove</button></div>`
      : `<button class="btn btn-outline" data-act="record" id="recBtn">● Start recording</button>
         <span id="recTime" style="margin-left:10px;font-weight:700;color:var(--red)"></span>
         <div class="note" id="recNote" hidden></div>`}
  </div>

  <div class="panel">
    <h3>🔌 Diagnostic self-check</h3>
    <p class="hint">Plug a $20 OBD-II adapter into the port under the dash. Stored fault codes matter, but the readiness monitors matter more: clearing codes right before a sale leaves them "not ready", and that shows up here.</p>
    ${draft.obd
      ? `<div class="kv"><span>Stored codes</span><b style="color:${draft.obd.codes.length ? 'var(--red)' : 'var(--green)'}">${draft.obd.codes.length ? esc(draft.obd.codes.join(', ')) : 'None'}</b></div>
         <div class="kv"><span>Readiness monitors</span><b>${draft.obd.ready ? 'All ready' : 'Not ready'}</b></div>
         <button class="btn btn-outline btn-sm" style="margin-top:10px" data-act="delObd">Remove report</button>`
      : '<button class="btn btn-outline" data-act="scan">Run diagnostic scan (demo)</button>'}
    <div class="note demo"><b>Prototype note:</b> this generates a sample result and is stored as <b>self-reported</b>. A production build pairs with the adapter over Bluetooth and signs the reading.</div>
  </div>

  <div class="panel">
    <h3>📒 Digital logbook</h3>
    <p class="hint">Service records attach to the VIN permanently. If this car is ever resold on Driveway the history follows it, which makes it worth more.</p>
    ${draft.serviceRecords.map((r, i) =>
      `<div class="kv"><span>${esc(r)}</span><button class="btn btn-sm btn-outline" data-act="delRecord" data-i="${i}">✕</button></div>`).join('')}
    <div style="display:flex;gap:8px;margin-top:10px">
      <input id="recordInput" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:10px 12px" placeholder="e.g. Timing belt replaced at 90,000 mi">
      <button class="btn btn-outline" data-act="addRecord">Add</button></div>
    <div class="note demo"><b>Coming next:</b> cold-start audio and the OBD-II diagnostic report attach here too.</div>
  </div>
  ${nav(true, true)}`;
}

function stepPrice() {
  const v = valuation;
  const market = v?.marketValue || 0;
  const low = market ? Math.round(market * 0.6) : 1000;
  const high = market ? Math.round(market * 1.6) : 100000;
  if (!draft.price && market) draft.price = market;
  const price = Number(draft.price) || 0;
  const loan = Number(draft.loanBalance) || 0;

  return `<div class="panel">
    <h3>Set your price</h3>
    <p class="hint">We estimate how long it takes to sell at each price, based on what cars like yours actually sold for.</p>
    <div class="slider-row">
      <input type="range" id="priceRange" min="${low}" max="${high}" step="50" value="${Math.min(Math.max(price || market, low), high)}">
      <div class="price-out" id="priceOut">${money(price)}</div>
    </div>
    <div class="meter" id="priceMeter">${priceMeter()}</div>
    ${v?.comps?.length ? `<div class="box"><h4>💵 What similar cars actually sold for</h4>
      <div class="table-wrap"><table class="data">
        <tr><th>Car</th><th>Miles</th><th>Sold for</th></tr>
        ${v.comps.slice(0, 5).map((s) => `<tr><td>${s.year} ${esc(s.make)} ${esc(s.model)}</td><td>${miles(s.miles)}</td><td><b>${money(s.price)}</b></td></tr>`).join('')}
      </table></div></div>` : ''}
    <div class="note">🛟 <b>Guaranteed floor:</b> if nobody buys privately, you can close at ${money(v?.guaranteedFloor || 0)} at any time from My garage. Trying the private market first costs you nothing but time.
      <span style="display:block;margin-top:6px;color:var(--purple)"><b>Prototype note:</b> needs a wholesale buying partner in a real build.</span></div>
  </div>

  <div class="panel">
    <h3>💳 Still paying it off?</h3>
    <p class="hint">This is where most private sales die: the bank holds the title, so the seller cannot hand it over. Tell us the balance and we pay the lender directly, then send the released title to the buyer.</p>
    <div class="row2">
      <div class="f"><label for="s-loan">Remaining loan balance</label><input id="s-loan" data-field="loanBalance" type="number" value="${esc(draft.loanBalance)}" placeholder="14000"></div>
      <div class="f"><label>You walk away with</label>
        <div id="equityOut" style="font-size:24px;font-weight:800;padding:8px 0;color:${price - loan >= 0 ? 'var(--green)' : 'var(--red)'}">${loan ? money(price - loan) : '—'}</div></div>
    </div>
    <div class="note bad" id="equityWarning" ${loan > price && price ? '' : 'hidden'}>You owe more than your asking price — you would need to bring ${money(Math.max(0, loan - price))} to closing.</div>
    <div class="note demo"><b>Prototype note:</b> real lien payoff needs lender integrations and money-transmitter licensing in every state.</div>
  </div>

  <div class="panel">
    <h3>⏱ Offer deadline</h3>
    <p class="hint">A clock stops buyers stalling. Everyone sees how many offers exist and the range of the best one — never the exact number.</p>
    <div class="f"><select data-field="deadlineDays">
      ${[[0, 'No deadline — classic listing'], [3, 'Offers close in 3 days'], [7, 'Offers close in 7 days'], [14, 'Offers close in 14 days']]
        .map(([v2, label]) => `<option value="${v2}" ${Number(draft.deadlineDays) === v2 ? 'selected' : ''}>${label}</option>`).join('')}
    </select></div>
  </div>

  <div class="panel">
    <h3>🤝 Automatic negotiation</h3>
    <p class="hint">Hate haggling? Set your rules once and Driveway answers offers for you, instantly, day or night.</p>
    <label style="display:flex;gap:9px;align-items:center;font-size:14.5px;font-weight:600;margin-bottom:12px">
      <input type="checkbox" data-field="rulesOn" ${draft.rulesOn ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--accent)">
      Let Driveway answer offers automatically</label>
    <div id="rulesBlock" ${draft.rulesOn ? '' : 'hidden'}>
      <div class="row3">
        <div class="f"><label for="s-accept">Accept instantly at or above</label><input id="s-accept" data-field="acceptAt" type="number" value="${esc(draft.acceptAt)}" placeholder="${Math.round(price * 0.96)}"></div>
        <div class="f"><label for="s-counter">Otherwise counter with</label><input id="s-counter" data-field="counterAt" type="number" value="${esc(draft.counterAt)}" placeholder="${Math.round(price * 0.98)}"></div>
        <div class="f"><label for="s-decline">Decline below</label><input id="s-decline" data-field="declineBelow" type="number" value="${esc(draft.declineBelow)}" placeholder="${Math.round(price * 0.82)}"></div>
      </div>
      <div class="note">Lowballs get a polite automatic decline, serious offers an instant counter, and a strong offer closes the deal while you sleep.</div>
    </div>
  </div>
  ${nav(true, true)}`;
}

function priceMeter() {
  const v = valuation;
  if (!v) return '<div><span>Valuing your car…</span><b>—</b></div>';
  const price = Number(draft.price) || v.marketValue;
  const days = daysAt(price);
  return `<div><span>Est. market value</span><b>${money(v.marketValue)}</b></div>
    <div><span>Expected time to sell</span><b>~${days} day${days === 1 ? '' : 's'}</b></div>
    <div><span>Depreciation while you wait</span><b>−${money(Math.round(v.depreciationPerMonth * days / 30))}</b></div>
    <div><span>Guaranteed floor offer</span><b>${money(v.guaranteedFloor)}</b></div>`;
}

/** Mirrors the server's curve so the slider responds without a round trip per pixel. */
function daysAt(price) {
  const ratio = price / (valuation?.marketValue || price || 1);
  return Math.round(Math.min(180, Math.max(2, 9 * 2.9 ** ((ratio - 0.94) * 6))));
}

function stepReview() {
  const tags = new Set(draft.photos.map((p) => p.tag));
  const required = (store.meta?.photoTags || []).filter((t) => t.required);
  const verified = required.length > 0 && required.every((t) => tags.has(t.key));

  return `<div class="panel">
    <h3>Review and publish</h3>
    <p class="hint">One last look before it goes live.</p>
    <div class="row2">
      <div>${draft.photos.length
        ? `<img src="${draft.photos[0].preview}" style="width:100%;border-radius:12px;aspect-ratio:16/10;object-fit:cover" alt="">`
        : '<div class="note">No photos added — listings without photos are mostly ignored.</div>'}</div>
      <div>
        <div style="font-size:22px;font-weight:800">${money(draft.price || 0)}</div>
        <div style="font-size:16px;font-weight:600">${esc(draft.year)} ${esc(draft.make)} ${esc(draft.model)}</div>
        <div style="color:var(--muted);font-size:14px">${draft.miles ? miles(draft.miles) : '—'} · ${esc(draft.city)}, ${esc(draft.state)}</div>
        <div class="trust-row" style="margin-top:10px">
          ${verified ? '<span class="tb ok">✓ Photos verified</span>' : '<span class="tb warn">Photos incomplete</span>'}
          ${draft.audio ? '<span class="tb pur">♪ Cold start</span>' : ''}
          ${draft.obd ? (draft.obd.codes.length ? '<span class="tb warn">⚠ OBD code</span>' : '<span class="tb info">✓ OBD clean</span>') : ''}
          ${draft.rulesOn ? '<span class="tb info">🤝 Auto-negotiation</span>' : ''}
          ${Number(draft.deadlineDays) ? `<span class="tb warn">⏱ ${draft.deadlineDays}-day deadline</span>` : ''}
          ${draft.serviceRecords.length ? `<span class="tb pur">📒 ${draft.serviceRecords.length} record${draft.serviceRecords.length === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>
    </div>
    <button class="btn btn-outline" style="margin-top:16px" data-act="roast">🔥 Roast my listing</button>
    <div id="roastBox"></div>
    <div class="wizard-nav">
      <button class="btn btn-outline" data-act="back">← Back</button>
      <button class="btn btn-primary btn-lg" data-act="publish" id="publishBtn">Publish listing — free</button>
    </div>
  </div>`;
}

/** An honest critique before publishing, from the things buyers actually complain about. */
function roast() {
  const problems = [];
  const tags = new Set(draft.photos.map((p) => p.tag));
  const price = Number(draft.price) || 0;

  if (draft.photos.length < 4) problems.push(`Only ${draft.photos.length} photo${draft.photos.length === 1 ? '' : 's'}. Buyers scroll past listings with fewer than six.`);
  if (!tags.has('odometer')) problems.push('No odometer photo. It is the single most requested shot, and leaving it out reads as hiding something.');
  if (!tags.has('vin')) problems.push('No VIN plate photo. Serious buyers want to run their own history check before they drive out.');
  if (!tags.has('interior')) problems.push('No interior photo. The interior is how people actually judge condition.');
  if ((draft.description || '').length < 80) problems.push('The description is thin. Write about service history, why you are selling, and any flaws.');
  if (!draft.vin || draft.vin.length < 17) problems.push('VIN is missing or incomplete, so the free title and recall check cannot run.');
  if (!draft.audio) problems.push('No cold-start recording. It takes ten seconds and it is the cheapest trust you can buy.');
  if (!draft.obd) problems.push('No diagnostic scan. A clean scan quietly answers the "is there a check engine light" question before anyone asks it.');
  if (!draft.serviceRecords.length) problems.push('No service records. Even two lines of maintenance history separates you from the cars people are afraid of.');
  if (valuation && price > valuation.marketValue * 1.12) problems.push(`Your price is about ${Math.round((price / valuation.marketValue - 1) * 100)}% over market. Expect a long, quiet wait.`);
  if (valuation && price && price < valuation.marketValue * 0.82) problems.push(`Your price is well under market — you will sell in days, but you are giving away roughly ${money(valuation.marketValue * 0.9 - price)}.`);

  return problems.length
    ? `<div class="roast" id="roastBox"><b>Here is what a buyer will hold against you:</b><ul>${problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>`
    : '<div class="roast good" id="roastBox"><b>Honestly? This is a strong listing.</b> Photos, proof and price all check out. Publish it.</div>';
}

const nav = (back, next) => `<div class="wizard-nav">
  ${back ? '<button class="btn btn-outline" data-act="back">← Back</button>' : '<span></span>'}
  ${next ? '<button class="btn btn-primary" data-act="next">Continue →</button>' : ''}</div>`;

/* ---------------- interactions ---------------- */

function wirePhotos(root) {
  const input = $('#photoInput', root);
  const drop = $('#photoDrop', root);
  const max = store.meta?.limits.photosPerListing ?? 12;
  const tagOrder = (store.meta?.photoTags || []).map((t) => t.key);

  const addFiles = (files) => {
    const room = max - draft.photos.length;
    const accepted = [...files].filter((f) => f.type.startsWith('image/')).slice(0, Math.max(0, room));
    if (!accepted.length) return;
    for (const file of accepted) {
      const used = new Set(draft.photos.map((p) => p.tag));
      draft.photos.push({ file, preview: URL.createObjectURL(file), tag: tagOrder.find((t) => !used.has(t)) || 'other' });
    }
    paint(root);
  };

  input.addEventListener('change', (e) => addFiles(e.target.files));
  ['dragover', 'dragleave', 'drop'].forEach((type) =>
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.toggle('drag', type === 'dragover');
      if (type === 'drop') addFiles(e.dataTransfer.files);
    })
  );
  $$('[data-photo-tag]', root).forEach((select) =>
    select.addEventListener('change', () => { draft.photos[Number(select.dataset.photoTag)].tag = select.value; })
  );
  $('#recordInput', root)?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const value = e.target.value.trim();
    if (!value) return;
    draft.serviceRecords.push(value);
    paint(root);
  });
}

/* ---------------- cold-start recording ---------------- */

const RECORD_SECONDS = 10;
let recorder = null;
let recordTimer = null;

async function toggleRecording(root) {
  if (recorder && recorder.state === 'recording') {
    recorder.stop();
    return;
  }
  const note = $('#recNote', root);
  const showNote = (message) => {
    if (!note) return toast(message);
    note.textContent = message;
    note.hidden = false;
  };

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return showNote('This browser cannot record audio. You can still publish — buyers will just have one less reason to trust the listing.');
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    return showNote('Microphone access was blocked, so there is nothing to record from.');
  }

  const chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    clearInterval(recordTimer);
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
    recorder = null;
    if (!blob.size) return showNote('Nothing was recorded — check the microphone and try again.');
    draft.audio = { blob, url: URL.createObjectURL(blob) };
    paint(root);
    toast('🎧 Cold-start recording saved.');
  };

  recorder.start();
  let left = RECORD_SECONDS;
  const button = $('#recBtn', root);
  const clock = $('#recTime', root);
  if (button) button.textContent = '■ Stop';
  if (clock) clock.textContent = `${left}s`;
  recordTimer = setInterval(() => {
    left -= 1;
    if (clock) clock.textContent = `${left}s`;
    if (left <= 0 && recorder?.state === 'recording') recorder.stop();
  }, 1000);
}

function wirePrice(root) {
  const range = $('#priceRange', root);
  range?.addEventListener('input', () => {
    draft.price = Number(range.value);
    const out = $('#priceOut', root);
    const meter = $('#priceMeter', root);
    if (out) out.textContent = money(draft.price);
    if (meter) meter.innerHTML = priceMeter();
    updateEquity(root);
  });
}

/**
 * Fetches the market value once per car, then repaints so the slider can be
 * centred on it. The key guard matters: painting step 3 calls this, so without
 * it the repaint would trigger another fetch and loop forever.
 */
async function loadValuation(root) {
  if (!draft.make || !draft.model || !draft.year || !draft.miles) return;
  const key = [draft.make, draft.model, draft.year, draft.miles, draft.body, draft.fuel].join('|');
  if (key === valuationKey) return;
  valuationKey = key;

  try {
    valuation = await api.post('/api/valuation', {
      make: draft.make, model: draft.model, year: Number(draft.year),
      miles: Number(draft.miles), body: draft.body, fuel: draft.fuel,
      price: Number(draft.price) || undefined
    });
  } catch {
    valuationKey = null; // let a later attempt retry
    return;
  }
  if (step === 3) paint(root);
}

function go(root, next) {
  if (next > step && !validate(root, step)) return;
  step = Math.min(STEPS.length, Math.max(1, next));
  paint(root);
  window.scrollTo({ top: 0 });
}

function validate(root, which) {
  const summary = $('[data-form-error]', root);
  const fail = (message) => {
    summary.textContent = message;
    summary.hidden = false;
    return false;
  };
  summary.hidden = true;

  if (which === 1) {
    if (!draft.make || !draft.model || !draft.year || !draft.miles || !draft.city || !draft.state) {
      return fail('Fill in make, model, year, mileage, city and state.');
    }
    const year = Number(draft.year);
    if (year < 1960 || year > new Date().getFullYear() + 2) return fail('That year does not look right.');
  }
  if (which === 2 && !draft.photos.length) return fail('Add at least one photo — listings with photos get far more offers.');
  if (which === 3) {
    if (!Number(draft.price)) return fail('Set a price.');
    if (draft.rulesOn) {
      const accept = Number(draft.acceptAt) || Math.round(draft.price * 0.96);
      const counter = Number(draft.counterAt) || Math.round(draft.price * 0.98);
      const decline = Number(draft.declineBelow) || Math.round(draft.price * 0.82);
      if (!(accept > decline && counter > decline)) {
        return fail('Auto-negotiation needs the accept and counter amounts to be above the decline line.');
      }
    }
  }
  return true;
}

async function publish(root) {
  for (const which of [1, 2, 3]) if (!validate(root, which)) return;

  const button = $('#publishBtn', root);
  button.disabled = true;
  button.textContent = 'Publishing…';

  const price = Number(draft.price);
  const payload = {
    make: draft.make, model: draft.model, year: Number(draft.year), miles: Number(draft.miles),
    price, body: draft.body, transmission: draft.transmission, fuel: draft.fuel,
    doors: Number(draft.doors), towLb: Number(draft.towLb) || 0, evSoh: Number(draft.evSoh) || 0,
    safety: Number(draft.safety), city: draft.city, state: draft.state,
    vin: draft.vin || '', description: draft.description,
    loanBalance: Number(draft.loanBalance) || 0, deadlineDays: Number(draft.deadlineDays) || 0,
    serviceRecords: draft.serviceRecords,
    rules: draft.rulesOn ? {
      acceptAt: Number(draft.acceptAt) || Math.round(price * 0.96),
      counterAt: Number(draft.counterAt) || Math.round(price * 0.98),
      declineBelow: Number(draft.declineBelow) || Math.round(price * 0.82)
    } : null
  };

  let created;
  try {
    created = await api.post('/api/listings', payload);
  } catch (err) {
    showFormErrors(root, err);
    button.disabled = false;
    button.textContent = 'Publish listing — free';
    window.scrollTo({ top: 0 });
    return;
  }

  const id = created.listing.id;

  // The listing exists from here on. Attachments are best-effort: if one fails
  // we say so rather than pretending the publish failed and stranding the car.
  if (draft.photos.length) {
    button.textContent = `Uploading ${draft.photos.length} photo${draft.photos.length === 1 ? '' : 's'}…`;
    const form = new FormData();
    for (const photo of draft.photos) {
      form.append('photos', photo.file);
      form.append('tags', photo.tag);
    }
    try {
      await api.upload(`/api/listings/${id}/photos`, form);
    } catch (err) {
      return finishPartial(id, `Listing published, but the photos failed: ${err.message}`);
    }
  }

  if (draft.audio) {
    button.textContent = 'Uploading recording…';
    const form = new FormData();
    form.append('audio', draft.audio.blob, 'cold-start.webm');
    try {
      await api.upload(`/api/listings/${id}/audio`, form);
    } catch (err) {
      return finishPartial(id, `Listing published, but the recording failed: ${err.message}`);
    }
  }

  if (draft.obd) {
    try {
      await api.post(`/api/listings/${id}/obd`, { codes: draft.obd.codes, ready: draft.obd.ready });
    } catch {
      return finishPartial(id, 'Listing published, but the diagnostic report could not be saved.');
    }
  }

  const fired = created.standingBidOffers;
  toast(fired
    ? `🎉 Live — and ${fired} standing bid${fired > 1 ? 's' : ''} already came in!`
    : '🎉 Your listing is live!');
  resetDraft();
  location.hash = `#/car/${id}`;
}

/** The listing went up but an attachment did not; send the seller to it either way. */
function finishPartial(id, message) {
  toast(message);
  resetDraft();
  location.hash = `#/car/${id}`;
}
