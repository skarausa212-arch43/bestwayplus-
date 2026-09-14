import { getDb } from '../db/index.js';
import { config } from '../config.js';
import { sendMail } from '../lib/mailer.js';
import { insertNotification, markEmailSent, markEmailFailed } from '../models/notification.model.js';

const db = () => getDb();
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
const userById = (id) => db().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

const link = (path) => `${config.appUrl}/${path.startsWith('#') ? path : `#/${path}`}`;

/** Same message in both parts: plain text is what most people actually read. */
function htmlFor({ title, body, url, cta }) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;color:#0f172a">
  <p style="font-size:18px;font-weight:700;margin:0 0 10px">${esc(title)}</p>
  <p style="font-size:15px;line-height:1.55;margin:0 0 18px;white-space:pre-line">${esc(body)}</p>
  ${url ? `<p><a href="${esc(url)}" style="background:#2457ff;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">${esc(cta || 'Open Driveway')}</a></p>` : ''}
  <p style="font-size:12px;color:#64748b;margin-top:22px">Driveway · you are getting this because of activity on your account.
  Turn these emails off in the menu under your name.</p>
</div>`;
}

/**
 * Records a notification and tries to email it.
 *
 * The in-app record is written first and kept whatever happens to the email:
 * a seller must still be able to find out an offer arrived even if their mail
 * server rejected us. Delivery failures are stored on the row, not thrown.
 */
export async function notify({ userId, kind, title, body, path = null, cta = null, data = {} }) {
  const user = userById(userId);
  if (!user) return null;

  const url = path ? link(path) : null;
  const wantsEmail = user.notify_email !== 0;
  const id = insertNotification({
    userId,
    kind,
    title,
    body,
    link: path,
    data,
    emailTo: wantsEmail ? user.email : null
  });

  if (!wantsEmail) return id;

  try {
    const result = await sendMail({
      to: user.email,
      subject: title,
      text: `${body}\n\n${url ? `${cta || 'Open Driveway'}: ${url}\n\n` : ''}— Driveway`,
      html: htmlFor({ title, body, url, cta })
    });
    markEmailSent(id, result.transport);
  } catch (err) {
    markEmailFailed(id, err.message);
  }
  return id;
}

const carTitle = (l) => `${l.year} ${l.make} ${l.model}`;

/* ---------------- offer events ---------------- */

export async function offerCreated({ listing, offer, buyer }) {
  const title = carTitle(listing);
  const verified = buyer.funds_verified ? ' Their funds are verified.' : '';
  const source = offer.from_standing ? ' It came from a standing bid, so they are ready to move.' : '';

  if (offer.status === 'pending') {
    await notify({
      userId: listing.user_id,
      kind: 'offer_received',
      title: `New offer: ${money(offer.amount)} on your ${title}`,
      body: `${buyer.name} offered ${money(offer.amount)} against your asking price of ${money(listing.price)}.${verified}${source}`
        + (offer.message ? `\n\nTheir message: "${offer.message}"` : ''),
      path: 'garage/received',
      cta: 'Review the offer',
      data: { listingId: listing.id, offerId: offer.id, amount: offer.amount }
    });
    return;
  }

  // Handled by the seller's own rules — tell both sides what happened.
  if (offer.status === 'accepted') {
    await Promise.all([
      notify({
        userId: listing.user_id,
        kind: 'offer_accepted_seller',
        title: `Sold: your ${title} for ${money(offer.amount)}`,
        body: `Your automatic rules accepted ${buyer.name}'s offer of ${money(offer.amount)}. Their contact details are now in your garage — arrange the handover and the paperwork.`,
        path: 'garage/received',
        cta: 'See the buyer',
        data: { listingId: listing.id, offerId: offer.id, amount: offer.amount }
      }),
      notify({
        userId: buyer.id,
        kind: 'offer_accepted_buyer',
        title: `Accepted: ${money(offer.amount)} for the ${title}`,
        body: 'The seller\'s rules accepted your offer instantly. Their contact details are in your garage. Meet somewhere public, check the title against their ID, and do not wire money in advance.',
        path: 'garage/made',
        cta: 'Open my garage',
        data: { listingId: listing.id, offerId: offer.id, amount: offer.amount }
      })
    ]);
    return;
  }

  if (offer.status === 'countered') {
    await Promise.all([
      notify({
        userId: buyer.id,
        kind: 'offer_countered',
        title: `Counter-offer: ${money(offer.counter_amount)} for the ${title}`,
        body: `You offered ${money(offer.amount)} and the seller's rules countered at ${money(offer.counter_amount)} straight away. Accept it or walk away from your garage.`,
        path: 'garage/made',
        cta: 'Answer the counter',
        data: { listingId: listing.id, offerId: offer.id, counter: offer.counter_amount }
      }),
      notify({
        userId: listing.user_id,
        kind: 'offer_auto_countered',
        title: `Your rules countered a ${money(offer.amount)} offer`,
        body: `${buyer.name} offered ${money(offer.amount)} on your ${title}. Your rules countered at ${money(offer.counter_amount)} without you lifting a finger.`,
        path: 'garage/received',
        data: { listingId: listing.id, offerId: offer.id }
      })
    ]);
    return;
  }

  if (offer.status === 'declined') {
    await notify({
      userId: buyer.id,
      kind: 'offer_declined',
      title: `Declined: ${money(offer.amount)} for the ${title}`,
      body: `The seller set a floor above ${money(offer.amount)}, so your offer was declined automatically. You can send a higher one any time.`,
      path: `car/${listing.id}`,
      cta: 'See the car',
      data: { listingId: listing.id, offerId: offer.id }
    });
  }
}

export async function offerAccepted({ listing, offer, byBuyer = false }) {
  const buyer = userById(offer.buyer_id);
  const title = carTitle(listing);
  const amount = money(offer.amount);

  await Promise.all([
    notify({
      userId: offer.buyer_id,
      kind: 'offer_accepted_buyer',
      title: byBuyer ? `Deal agreed: ${amount} for the ${title}` : `Accepted: ${amount} for the ${title}`,
      body: byBuyer
        ? 'You accepted the seller\'s counter, so the deal is agreed. Their contact details are in your garage.'
        : 'The seller accepted your offer. Their contact details are in your garage. Meet somewhere public, check the title against their ID, and never wire money in advance.',
      path: 'garage/made',
      cta: 'Open my garage',
      data: { listingId: listing.id, offerId: offer.id, amount: offer.amount }
    }),
    notify({
      userId: listing.user_id,
      kind: 'offer_accepted_seller',
      title: `Sold: your ${title} for ${amount}`,
      body: byBuyer
        ? `${buyer?.name || 'The buyer'} accepted your counter of ${amount}. Their contact details are in your garage.`
        : `You accepted ${buyer?.name || 'an offer'} at ${amount}. Their contact details are in your garage.`,
      path: 'garage/received',
      cta: 'See the buyer',
      data: { listingId: listing.id, offerId: offer.id, amount: offer.amount }
    })
  ]);
}

export const offerDeclined = ({ listing, offer }) =>
  notify({
    userId: offer.buyer_id,
    kind: 'offer_declined',
    title: `Declined: ${money(offer.amount)} for the ${carTitle(listing)}`,
    body: 'The seller declined your offer. The car is still listed, so a stronger offer is worth a try.',
    path: `car/${listing.id}`,
    cta: 'See the car',
    data: { listingId: listing.id, offerId: offer.id }
  });

export const offerCountered = ({ listing, offer, amount }) =>
  notify({
    userId: offer.buyer_id,
    kind: 'offer_countered',
    title: `Counter-offer: ${money(amount)} for the ${carTitle(listing)}`,
    body: `You offered ${money(offer.amount)}. The seller countered at ${money(amount)} — accept it or walk away from your garage.`,
    path: 'garage/made',
    cta: 'Answer the counter',
    data: { listingId: listing.id, offerId: offer.id, counter: amount }
  });

export const offerWithdrawn = ({ listing, offer }) =>
  notify({
    userId: listing.user_id,
    kind: 'offer_withdrawn',
    title: `Offer withdrawn on your ${carTitle(listing)}`,
    body: `${userById(offer.buyer_id)?.name || 'A buyer'} withdrew their ${money(offer.amount)} offer.`,
    path: 'garage/received',
    data: { listingId: listing.id, offerId: offer.id }
  });

export const holdPlaced = ({ listing, buyer, until }) =>
  notify({
    userId: listing.user_id,
    kind: 'hold_placed',
    title: `${buyer.name} put a hold on your ${carTitle(listing)}`,
    body: `They paid a refundable deposit to take it off the market until ${new Date(until).toLocaleString('en-US')}, usually to travel to see it or book an inspection.`,
    path: 'garage/listings',
    data: { listingId: listing.id }
  });

/* ---------------- deadline reminders ---------------- */

export async function deadlineReminder({ listing, hoursLeft }) {
  const title = carTitle(listing);
  const open = db()
    .prepare(`SELECT DISTINCT buyer_id FROM offers WHERE listing_id = ? AND status IN ('pending','countered')`)
    .all(listing.id);

  await notify({
    userId: listing.user_id,
    kind: 'deadline_soon',
    title: `Offers on your ${title} close in ${hoursLeft} hours`,
    body: open.length
      ? `You have ${open.length} live offer${open.length === 1 ? '' : 's'} to decide on before the deadline.`
      : 'No live offers yet. Dropping the price or adding the missing photos still works, even this late.',
    path: 'garage/received',
    cta: 'Review offers',
    data: { listingId: listing.id }
  });

  for (const row of open) {
    await notify({
      userId: row.buyer_id,
      kind: 'deadline_soon',
      title: `Last chance: offers on the ${title} close in ${hoursLeft} hours`,
      body: 'If you want this car, now is the moment to improve your offer — after the deadline the seller stops taking them.',
      path: `car/${listing.id}`,
      cta: 'See the car',
      data: { listingId: listing.id }
    });
  }
}
