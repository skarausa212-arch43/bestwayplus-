/**
 * LUMI notification templates (15_NOTIFICATION_SYSTEM.md §16).
 *
 * Templates are addressed by ID (never hardcode strings §19). Each carries a
 * category, priority, the channels it may use, a deep link, and localized
 * title/body with {placeholders}. Only `ru` is filled here (the app UI is
 * Russian); add `pl/en/uk` the same way — the delivery code reads by locale.
 *
 * Categories drive the delivery matrix + preference gating (§4/§11):
 *   operational / account  → critical, cannot be disabled
 *   smart_home / marketing → gated by user preferences
 */
'use strict';

const T = {
  'booking.created': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Заказ создан', body: 'Ищем исполнителя для «{service}».' },
  },
  'booking.accepted': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Исполнитель найден', body: '{provider} принял заказ и скоро приедет.' },
  },
  'booking.in_progress': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Уборка началась', body: '{provider} приступил к работе.' },
  },
  'booking.completed': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Заказ завершён', body: '«{service}» выполнена. Пожалуйста, оцените исполнителя.' },
  },
  'booking.cancelled': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Заказ отменён', body: '«{service}» отменён.' },
  },
  'str.problem': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Проблема после гостя', body: 'Исполнитель сообщил о проблеме при уборке «{service}».' },
  },
  'str.problem.urgent': {
    category: 'operational', priority: 'urgent', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: '⚠️ Срочно: проблема до заезда', body: 'Исполнитель сообщил о проблеме, а гость скоро заедет. Проверьте «{service}».' },
  },
  'payment.captured': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'email'],
    deepLink: 'lumi://wallet',
    ru: { title: 'Оплата прошла', body: 'Списано {amount} за «{service}».' },
  },
  'booking.responder': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Новый отклик', body: 'Исполнитель откликнулся на «{service}». Выберите, кто выполнит заказ.' },
  },
  'provider.chosen': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Вас выбрали! 🎉', body: 'Клиент выбрал вас для «{service}». Можно приступать.' },
  },
  'provider.on_the_way': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Исполнитель в пути', body: '{provider} выехал к вам. Прибудет примерно через {eta} мин.' },
  },
  'provider.invited': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://provider/offer/{bookingId}',
    ru: { title: 'Вас пригласили лично', body: 'Клиент выбрал вас для «{service}». Примите заказ первым.' },
  },
  'flash.deadline': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'FlashClean · 60 минут', body: 'Исполнитель должен прибыть в течение часа. Мы следим за временем.' },
  },
  'dispute.opened': {
    category: 'operational', priority: 'high', channels: ['in_app', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Обращение принято', body: 'Мы получили вашу проблему по «{service}» и уже разбираемся.' },
  },
  'dispute.opened_admin': {
    category: 'operational', priority: 'high', channels: ['in_app'],
    deepLink: 'lumi://admin/disputes',
    ru: { title: 'Новая проблема по заказу', body: '{who}: «{category}» по «{service}».' },
  },
  'dispute.resolved': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Проблема решена', body: 'Ваше обращение по «{service}» закрыто. {resolution}' },
  },
  'support.received': {
    category: 'account', priority: 'normal', channels: ['in_app', 'email'],
    deepLink: 'lumi://home',
    ru: { title: 'Обращение принято', body: 'Мы получили ваше сообщение и ответим на {email} в течение 24 часов.' },
  },
  'support.message_admin': {
    category: 'operational', priority: 'high', channels: ['in_app'],
    deepLink: 'lumi://admin/support',
    ru: { title: 'Новое обращение в поддержку', body: '{who}: «{topic}»' },
  },
  'provider.not_chosen': {
    category: 'operational', priority: 'low', channels: ['in_app'],
    deepLink: 'lumi://home',
    ru: { title: 'Заказ ушёл другому', body: 'На «{service}» выбрали другого исполнителя.' },
  },
  'provider.new_offer': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://provider/offer/{bookingId}',
    ru: { title: 'Новый заказ рядом', body: '«{service}» · +{payout}' },
  },
  'provider.verification_approved': {
    category: 'account', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://profile',
    ru: { title: 'Аккаунт подтверждён', body: 'Вы прошли проверку — можно выходить на линию.' },
  },
  'provider.verification_revoked': {
    category: 'account', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://profile',
    ru: { title: 'Верификация отозвана', body: 'Обратитесь в поддержку для восстановления.' },
  },
  'review.received': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Новый отзыв', body: 'Клиент оценил ваш заказ на {stars}★.' },
  },
  'subscription.started': {
    category: 'account', priority: 'normal', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://premium',
    ru: { title: 'LUMI+ активирован', body: 'Скидка 10% на все заказы теперь ваша.' },
  },
  'smart_home.recommendation': {
    category: 'smart_home', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://smart-home/{propertyId}',
    ru: { title: 'Пора обслужить дом', body: '{text}' },
  },
  'marketing.promo': {
    category: 'marketing', priority: 'low', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://home',
    ru: { title: '{title}', body: '{body}' },
  },
};

function render(str, params = {}) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : ''));
}
function getTemplate(id) { return T[id] || null; }
function renderTemplate(id, params, locale = 'ru') {
  const t = T[id]; if (!t) return null;
  const loc = t[locale] || t.ru;
  return {
    templateId: id, category: t.category, priority: t.priority, channels: t.channels.slice(),
    title: render(loc.title, params), body: render(loc.body, params),
    deepLink: render(t.deepLink, params),
  };
}

module.exports = { getTemplate, renderTemplate, TEMPLATES: T };
