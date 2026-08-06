/**
 * LUMI notification templates (15_NOTIFICATION_SYSTEM.md §16).
 *
 * Templates are addressed by ID (never hardcode strings §19). Each carries a
 * category, priority, the channels it may use, a deep link, and localized
 * title/body with {placeholders}. All four locales (ru/pl/en/uk) are filled; the delivery code picks by
 * `user.locale`, falling back to ru.
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
    pl: { title: 'Zamówienie utworzone', body: 'Szukamy wykonawcy dla „{service}”.' },
    en: { title: 'Order created', body: 'Looking for a provider for “{service}”.' },
    uk: { title: 'Замовлення створено', body: 'Шукаємо виконавця для «{service}».' },
  },
  'booking.accepted': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Исполнитель найден', body: '{provider} принял заказ и скоро приедет.' },
    pl: { title: 'Wykonawca znaleziony', body: '{provider} przyjął zamówienie i wkrótce przyjedzie.' },
    en: { title: 'Provider found', body: '{provider} accepted the order and will arrive soon.' },
    uk: { title: 'Виконавця знайдено', body: '{provider} прийняв замовлення і скоро приїде.' },
  },
  'booking.in_progress': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Уборка началась', body: '{provider} приступил к работе.' },
    pl: { title: 'Sprzątanie się rozpoczęło', body: '{provider} przystąpił do pracy.' },
    en: { title: 'Cleaning started', body: '{provider} has started working.' },
    uk: { title: 'Прибирання почалося', body: '{provider} приступив до роботи.' },
  },
  'booking.completed': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Заказ завершён', body: '«{service}» выполнена. Пожалуйста, оцените исполнителя.' },
    pl: { title: 'Zamówienie zakończone', body: '„{service}” wykonane. Prosimy o ocenę wykonawcy.' },
    en: { title: 'Order completed', body: '“{service}” is done. Please rate your provider.' },
    uk: { title: 'Замовлення завершено', body: '«{service}» виконано. Будь ласка, оцініть виконавця.' },
  },
  'booking.cancelled': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Заказ отменён', body: '«{service}» отменён.' },
    pl: { title: 'Zamówienie anulowane', body: '„{service}” zostało anulowane.' },
    en: { title: 'Order cancelled', body: '“{service}” was cancelled.' },
    uk: { title: 'Замовлення скасовано', body: '«{service}» скасовано.' },
  },
  'str.problem': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Проблема после гостя', body: 'Исполнитель сообщил о проблеме при уборке «{service}».' },
    pl: { title: 'Zgłoszono problem', body: 'Wykonawca zgłosił problem przy „{service}”.' },
    en: { title: 'Problem reported', body: 'The provider reported a problem with “{service}”.' },
    uk: { title: 'Повідомлено про проблему', body: 'Виконавець повідомив про проблему при «{service}».' },
  },
  'str.problem.urgent': {
    category: 'operational', priority: 'urgent', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: '⚠️ Срочно: проблема до заезда', body: 'Исполнитель сообщил о проблеме, а гость скоро заедет. Проверьте «{service}».' },
    pl: { title: '⚠️ Pilne: problem przed przyjazdem gościa', body: 'Wykonawca zgłosił problem, a gość wkrótce przyjedzie. Sprawdź „{service}”.' },
    en: { title: '⚠️ Urgent: problem before check-in', body: 'The provider reported a problem and a guest arrives soon. Check “{service}”.' },
    uk: { title: '⚠️ Терміново: проблема до заїзду', body: 'Виконавець повідомив про проблему, а гість скоро заїде. Перевірте «{service}».' },
  },
  'payment.captured': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'email'],
    deepLink: 'lumi://wallet',
    ru: { title: 'Оплата прошла', body: 'Списано {amount} за «{service}».' },
    pl: { title: 'Płatność pobrana', body: 'Pobrano {amount} za „{service}”.' },
    en: { title: 'Payment captured', body: '{amount} charged for “{service}”.' },
    uk: { title: 'Оплату списано', body: 'Списано {amount} за «{service}».' },
  },
  'payment.action_required': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Подтвердите оплату', body: 'Исполнитель найден для «{service}» — подтвердите оплату картой, чтобы начать.' },
    pl: { title: 'Potrzebna płatność', body: 'Dodaj kartę, aby opłacić „{service}”.' },
    en: { title: 'Payment needed', body: 'Add a card to pay for “{service}”.' },
    uk: { title: 'Потрібна оплата', body: 'Додайте картку, щоб оплатити «{service}».' },
  },
  'payment.refunded': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://wallet',
    ru: { title: 'Возврат оформлен', body: 'Вернули {amount} за «{service}».' },
    pl: { title: 'Zwrot środków', body: 'Zwrócono {amount} za „{service}”.' },
    en: { title: 'Refund issued', body: '{amount} refunded for “{service}”.' },
    uk: { title: 'Повернення коштів', body: 'Повернено {amount} за «{service}».' },
  },
  'payment.failed': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Оплата не прошла', body: 'Не удалось списать оплату за «{service}». Обновите карту или оплатите вручную.' },
    pl: { title: 'Płatność nieudana', body: 'Nie udało się pobrać opłaty za „{service}”. Sprawdź kartę.' },
    en: { title: 'Payment failed', body: 'We could not charge for “{service}”. Please check your card.' },
    uk: { title: 'Оплата не пройшла', body: 'Не вдалося списати оплату за «{service}». Перевірте картку.' },
  },
  'booking.responder': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Новый отклик', body: 'Исполнитель откликнулся на «{service}». Выберите, кто выполнит заказ.' },
    pl: { title: 'Nowe zgłoszenie', body: 'Wykonawca zgłosił się do „{service}”. Wybierz, kto wykona zlecenie.' },
    en: { title: 'New response', body: 'A provider responded to “{service}”. Choose who will do the job.' },
    uk: { title: 'Новий відгук', body: 'Виконавець відгукнувся на «{service}». Оберіть, хто виконає замовлення.' },
  },
  'provider.chosen': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Вас выбрали! 🎉', body: 'Клиент выбрал вас для «{service}». Можно приступать.' },
    pl: { title: 'Zamówienie jest Twoje', body: 'Klient wybrał Ciebie do „{service}”.' },
    en: { title: 'The job is yours', body: 'The customer chose you for “{service}”.' },
    uk: { title: 'Замовлення ваше', body: 'Клієнт обрав вас для «{service}».' },
  },
  'provider.on_the_way': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Исполнитель в пути', body: '{provider} выехал к вам. Прибудет примерно через {eta} мин.' },
    pl: { title: 'Wykonawca w drodze', body: '{provider} będzie za ok. {eta} min.' },
    en: { title: 'Provider on the way', body: '{provider} arrives in about {eta} min.' },
    uk: { title: 'Виконавець у дорозі', body: '{provider} буде приблизно за {eta} хв.' },
  },
  'provider.invited': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://provider/offer/{bookingId}',
    ru: { title: 'Вас пригласили лично', body: 'Клиент выбрал вас для «{service}». Примите заказ первым.' },
    pl: { title: 'Zaproszenie do zamówienia', body: 'Klient zaprasza Cię do „{service}”.' },
    en: { title: 'Job invitation', body: 'A customer invited you to “{service}”.' },
    uk: { title: 'Запрошення на замовлення', body: 'Клієнт запрошує вас на «{service}».' },
  },
  'flash.deadline': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'FlashClean · 60 минут', body: 'Исполнитель должен прибыть в течение часа. Мы следим за временем.' },
    pl: { title: 'FlashClean — 60 minut', body: 'Musisz dotrzeć do klienta w ciągu godziny.' },
    en: { title: 'FlashClean — 60 minutes', body: 'You must reach the customer within the hour.' },
    uk: { title: 'FlashClean — 60 хвилин', body: 'Потрібно дістатися клієнта протягом години.' },
  },
  'dispute.opened': {
    category: 'operational', priority: 'high', channels: ['in_app', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Обращение принято', body: 'Мы получили вашу проблему по «{service}» и уже разбираемся.' },
    pl: { title: 'Zgłoszenie przyjęte', body: 'Sprawdzamy Twoje zgłoszenie do „{service}”.' },
    en: { title: 'Complaint received', body: 'We are reviewing your complaint about “{service}”.' },
    uk: { title: 'Звернення прийнято', body: 'Ми перевіряємо ваше звернення щодо «{service}».' },
  },
  'dispute.opened_admin': {
    category: 'operational', priority: 'high', channels: ['in_app'],
    deepLink: 'lumi://admin/disputes',
    ru: { title: 'Новая проблема по заказу', body: '{who}: «{category}» по «{service}».' },
    pl: { title: 'Nowy spór', body: '{who} — {category} przy „{service}”.' },
    en: { title: 'New dispute', body: '{who} — {category} on “{service}”.' },
    uk: { title: 'Новий спір', body: '{who} — {category} щодо «{service}».' },
  },
  // SOS from inside a live order. Highest priority we have: it reaches every
  // admin channel at once, because somebody is standing in a room feeling unsafe.
  'sos.raised_admin': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://admin/sos',
    ru: { title: '🆘 SOS по заказу', body: '{who} ({role}) нажал SOS · «{service}» · {address}. Свяжитесь немедленно: {phone}' },
    pl: { title: '🆘 SOS przy zleceniu', body: '{who} ({role}) nacisnął SOS · „{service}” · {address}. Skontaktuj się natychmiast: {phone}' },
    en: { title: '🆘 SOS on a job', body: '{who} ({role}) pressed SOS · “{service}” · {address}. Contact immediately: {phone}' },
    uk: { title: '🆘 SOS за замовленням', body: '{who} ({role}) натиснув SOS · «{service}» · {address}. Звʼяжіться негайно: {phone}' },
  },
  'sos.raised': {
    category: 'operational', priority: 'high', channels: ['in_app'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Сигнал принят', body: 'Дежурный LUMI уже видит ваш SOS по «{service}». Если есть угроза жизни — звоните 112.' },
    pl: { title: 'Sygnał przyjęty', body: 'Dyżurny LUMI widzi Twój SOS przy „{service}”. Jeśli zagrożone jest życie — dzwoń 112.' },
    en: { title: 'Alert received', body: 'The LUMI duty officer can see your SOS on “{service}”. If life is in danger, call 112.' },
    uk: { title: 'Сигнал прийнято', body: 'Черговий LUMI бачить ваш SOS щодо «{service}». Якщо є загроза життю — телефонуйте 112.' },
  },
  'dispute.resolved': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Проблема решена', body: 'Ваше обращение по «{service}» закрыто. {resolution}' },
    pl: { title: 'Sprawa rozwiązana', body: '„{service}”: {resolution}' },
    en: { title: 'Issue resolved', body: '“{service}”: {resolution}' },
    uk: { title: 'Питання вирішено', body: '«{service}»: {resolution}' },
  },
  'support.received': {
    category: 'account', priority: 'normal', channels: ['in_app', 'email'],
    deepLink: 'lumi://home',
    ru: { title: 'Обращение принято', body: 'Мы получили ваше сообщение и ответим на {email} в течение 24 часов.' },
    pl: { title: 'Zgłoszenie wysłane', body: 'Odpowiemy na adres {email}.' },
    en: { title: 'Request sent', body: 'We will reply to {email}.' },
    uk: { title: 'Звернення надіслано', body: 'Відповімо на адресу {email}.' },
  },
  'support.message_admin': {
    category: 'operational', priority: 'high', channels: ['in_app'],
    deepLink: 'lumi://admin/support',
    ru: { title: 'Новое обращение в поддержку', body: '{who}: «{topic}»' },
    pl: { title: 'Nowe zgłoszenie', body: '{who}: {topic}' },
    en: { title: 'New support ticket', body: '{who}: {topic}' },
    uk: { title: 'Нове звернення', body: '{who}: {topic}' },
  },
  'provider.not_chosen': {
    category: 'operational', priority: 'low', channels: ['in_app'],
    deepLink: 'lumi://home',
    ru: { title: 'Заказ ушёл другому', body: 'На «{service}» выбрали другого исполнителя.' },
    pl: { title: 'Tym razem wybrano innego', body: 'Zamówienie „{service}” trafiło do innego wykonawcy.' },
    en: { title: 'Not selected this time', body: '“{service}” went to another provider.' },
    uk: { title: 'Цього разу обрали іншого', body: 'Замовлення «{service}» дісталося іншому виконавцю.' },
  },
  'provider.new_offer': {
    category: 'operational', priority: 'high', channels: ['in_app', 'push'],
    deepLink: 'lumi://provider/offer/{bookingId}',
    ru: { title: 'Новый заказ рядом', body: '«{service}» · +{payout}' },
    pl: { title: 'Nowe zamówienie w pobliżu', body: '„{service}” · Twoja wypłata {payout}' },
    en: { title: 'New job nearby', body: '“{service}” · your payout {payout}' },
    uk: { title: 'Нове замовлення поруч', body: '«{service}» · ваша виплата {payout}' },
  },
  'provider.verification_approved': {
    category: 'account', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://profile',
    ru: { title: 'Аккаунт подтверждён', body: 'Вы прошли проверку — можно выходить на линию.' },
    pl: { title: 'Weryfikacja zakończona', body: 'Twoje konto zostało zweryfikowane — możesz przyjmować zamówienia.' },
    en: { title: 'Verification approved', body: 'Your account is verified — you can take jobs now.' },
    uk: { title: 'Перевірку пройдено', body: 'Ваш акаунт перевірено — можете брати замовлення.' },
  },
  'provider.verification_revoked': {
    category: 'account', priority: 'high', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://profile',
    ru: { title: 'Верификация отозвана', body: 'Обратитесь в поддержку для восстановления.' },
    pl: { title: 'Weryfikacja cofnięta', body: 'Skontaktuj się z pomocą LUMI.' },
    en: { title: 'Verification revoked', body: 'Please contact LUMI support.' },
    uk: { title: 'Перевірку скасовано', body: 'Зв’яжіться з підтримкою LUMI.' },
  },
  'review.received': {
    category: 'operational', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://booking/{bookingId}',
    ru: { title: 'Новый отзыв', body: 'Клиент оценил ваш заказ на {stars}★.' },
    pl: { title: 'Nowa ocena', body: 'Klient wystawił {stars}.' },
    en: { title: 'New review', body: 'The customer rated you {stars}.' },
    uk: { title: 'Новий відгук', body: 'Клієнт поставив {stars}.' },
  },
  'subscription.started': {
    category: 'account', priority: 'normal', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://premium',
    ru: { title: 'LUMI+ активирован', body: '5% кэшбека на каждый заказ теперь ваши.' },
    pl: { title: 'Witamy w LUMI+', body: '5% cashbacku za każde zamówienie.' },
    en: { title: 'Welcome to LUMI+', body: '5% cashback on every order.' },
    uk: { title: 'Ласкаво просимо до LUMI+', body: '5% кешбеку за кожне замовлення.' },
  },
  'cashback.earned': {
    category: 'account', priority: 'normal', channels: ['in_app'],
    deepLink: 'lumi://wallet',
    ru: { title: 'Кэшбек LUMI+', body: 'Начислено {amount} за «{service}».' },
    pl: { title: 'Cashback LUMI+', body: 'Naliczono {amount} za „{service}”.' },
    en: { title: 'LUMI+ cashback', body: '{amount} credited for “{service}”.' },
    uk: { title: 'Кешбек LUMI+', body: 'Нараховано {amount} за «{service}».' },
  },
  'garden.season': {
    category: 'order', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://home',
    ru: { title: 'Ogród — sezon otwarty 🌱', body: '{service} — już dostępne. Zamów termin we Wrocławiu.' },
    pl: { title: 'Ogród — sezon otwarty 🌱', body: '{service} — już dostępne. Zamów termin we Wrocławiu.' },
    en: { title: 'Garden — season is open 🌱', body: '{service} is available again. Book a slot in Wrocław.' },
    uk: { title: 'Сад — сезон відкрито 🌱', body: '{service} — вже доступно. Замовте візит у Вроцлаві.' },
  },
  'payout.sent': {
    category: 'account', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://wallet',
    ru: { title: 'Выплата отправлена', body: 'Перевели {amount} на ваш счёт.' },
    pl: { title: 'Wypłata wysłana', body: 'Przelaliśmy {amount} na Twoje konto bankowe.' },
    en: { title: 'Payout sent', body: 'We transferred {amount} to your bank account.' },
    uk: { title: 'Виплату надіслано', body: 'Ми переказали {amount} на ваш банківський рахунок.' },
  },
  'smart_home.recommendation': {
    category: 'smart_home', priority: 'normal', channels: ['in_app', 'push'],
    deepLink: 'lumi://smart-home/{propertyId}',
    ru: { title: 'Пора обслужить дом', body: '{text}' },
    pl: { title: 'Rekomendacja dla domu', body: '{text}' },
    en: { title: 'Home recommendation', body: '{text}' },
    uk: { title: 'Рекомендація для дому', body: '{text}' },
  },
  'marketing.promo': {
    category: 'marketing', priority: 'low', channels: ['in_app', 'push', 'email'],
    deepLink: 'lumi://home',
    ru: { title: '{title}', body: '{body}' },
    pl: { title: '{title}', body: '{body}' },
    en: { title: '{title}', body: '{body}' },
    uk: { title: '{title}', body: '{body}' },
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
