import type { Dict } from './index';

// Беларуская — заглушка: перакладзеныя базавыя ключы, астатняе падае на pl (гл. t() у index.ts)
const be: Partial<Dict> = {
  'app.tagline': 'Хуткія грузаперавозкі па ўсёй Польшчы',
  'role.customer': 'Хачу замовіць перавозку',
  'role.driver': 'Хачу выконваць перавозкі',
  'home.whatToMove': 'Што перавозім?',
  'order.cancel': 'Адмяніць заказ',
  'order.total': 'Разам',
  'notif.title': 'Апавяшчэнні',
  'common.next': 'Далей', 'common.back': 'Назад', 'common.close': 'Зачыніць',
  'profile.language': 'Мова праграмы',
};

export default be;
