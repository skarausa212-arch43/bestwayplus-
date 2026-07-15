/**
 * LUMI chat & realtime core (16_CHAT_REALTIME.md).
 *
 * Pure, dependency-free helpers the server composes over the JSON store. The
 * server owns persistence and permissions; this module owns the *rules*:
 * message schema/normalization, delivery states, read-receipt math, typing
 * expiry, translation (original is never overwritten §11) and provider-ETA.
 *
 * Realtime here is delivered by short-poll (the zero-dep MVP has no socket
 * layer), but the state model is identical to a socket implementation — the
 * client reconciles optimistic local messages against server truth (§2/§6).
 */
'use strict';

// §4 message types and §6 delivery states.
const MESSAGE_TYPES = ['text', 'image', 'voice', 'file', 'location', 'system', 'payment', 'booking_status'];
const DELIVERY_STATES = ['local', 'sending', 'sent', 'delivered', 'read', 'failed'];

// §8 typing indicator is realtime-only and never persisted; it expires on its own.
const TYPING_TTL_MS = 6000;

// §13 provider location: rough ETA from straight-line distance at city speed.
const CITY_SPEED_KMH = 24;
function etaMinutes(distanceKm) {
  const km = Math.max(0, Number(distanceKm) || 0);
  return Math.max(1, Math.round((km / CITY_SPEED_KMH) * 60));
}

// §5 message schema. Normalizes an inbound message into the stored shape.
// `attachments` are references (signed-URL/data-URL) — validated by the caller.
function normalizeMessage(input, { id, conversationId, sender, at }) {
  const type = MESSAGE_TYPES.includes(input.type) ? input.type : 'text';
  const body = String(input.body != null ? input.body : input.text || '').slice(0, 4000);
  const attachments = Array.isArray(input.attachments) ? input.attachments.slice(0, 6) : [];
  return {
    id,
    conversationId,
    senderId: sender.id,
    senderRole: sender.role,
    senderName: sender.name,
    type,
    body,
    attachments,
    translatedBody: null,   // filled only by translate(), never overwrites body (§11)
    language: input.language || null,
    replyTo: input.replyTo || null,
    status: 'sent',         // server-acknowledged; client shows local→sending before this
    createdAt: at,
    editedAt: null,
    deletedAt: null,
  };
}

// §7 read receipts: a message is "read" once the *other* participant's
// lastReadAt is at/after it. Sender's own messages never show unread.
function deliveryStatus(msg, reads, viewerId) {
  if (msg.senderId !== viewerId) return null;               // only the sender sees receipts
  const others = Object.entries(reads || {}).filter(([uid]) => uid !== viewerId);
  if (!others.length) return 'sent';
  const seen = others.some(([, r]) => r && r.at >= msg.createdAt);
  return seen ? 'read' : 'delivered';
}

// Unread count for a viewer: messages after their lastReadAt not sent by them.
function unreadCount(messages, reads, viewerId) {
  const mine = (reads && reads[viewerId]) || null;
  const since = mine ? mine.at : 0;
  return messages.filter((m) => m.senderId !== viewerId && m.senderId !== 'system' && m.createdAt > since).length;
}

// §8 who is currently typing (excluding the viewer), dropping expired entries.
function activeTypers(typing, viewerId, nowMs) {
  const out = [];
  for (const [uid, entry] of Object.entries(typing || {})) {
    if (uid === viewerId) continue;
    if (entry && nowMs - entry.at < TYPING_TTL_MS) out.push({ userId: uid, name: entry.name });
  }
  return out;
}

// §11 translation. Demo dictionary (RU→target) — production swaps in a provider.
// Returns the translation without mutating the source; caller stores it beside
// the original so the original text is always recoverable.
const DICT = {
  en: {
    'привет': 'hi', 'здравствуйте': 'hello', 'спасибо': 'thank you', 'да': 'yes', 'нет': 'no',
    'когда': 'when', 'вы': 'you', 'приедете': 'will arrive', 'уже': 'already', 'еду': "i'm on my way",
    'буду': "i'll be", 'через': 'in', 'минут': 'minutes', 'дверь': 'door', 'ключи': 'keys',
    'у': 'at', 'соседей': 'the neighbours', 'хорошо': 'okay', 'открыто': 'open', 'жду': 'waiting',
  },
  pl: {
    'привет': 'cześć', 'спасибо': 'dziękuję', 'да': 'tak', 'нет': 'nie', 'еду': 'jadę',
    'через': 'za', 'минут': 'minut', 'ключи': 'klucze', 'дверь': 'drzwi', 'хорошо': 'dobrze', 'жду': 'czekam',
  },
  uk: {
    'привет': 'привіт', 'спасибо': 'дякую', 'да': 'так', 'нет': 'ні', 'еду': 'їду',
    'через': 'через', 'минут': 'хвилин', 'ключи': 'ключі', 'дверь': 'двері', 'хорошо': 'добре', 'жду': 'чекаю',
  },
};
function translate(text, target = 'en') {
  const dict = DICT[target] || DICT.en;
  const translated = String(text || '').replace(/[\p{L}]+/gu, (w) => {
    const hit = dict[w.toLowerCase()];
    if (!hit) return w;
    return w[0] === w[0].toUpperCase() ? hit.charAt(0).toUpperCase() + hit.slice(1) : hit;
  });
  return { original: text, translated, target, language: 'ru' };
}

module.exports = {
  MESSAGE_TYPES, DELIVERY_STATES, TYPING_TTL_MS,
  etaMinutes, normalizeMessage, deliveryStatus, unreadCount, activeTypers, translate,
};
