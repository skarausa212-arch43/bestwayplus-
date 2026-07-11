import type { Dict } from './index';

// Українська — заглушка: перекладені базові ключі, решта падає на pl (див. t() в index.ts)
const uk: Partial<Dict> = {
  'app.tagline': 'Швидкі вантажні перевезення по всій Польщі',
  'role.customer': 'Хочу замовити перевезення',
  'role.driver': 'Хочу виконувати перевезення',
  'home.whatToMove': 'Що перевозимо?',
  'order.cancel': 'Скасувати замовлення',
  'order.total': 'Разом',
  'notif.title': 'Сповіщення',
  'common.next': 'Далі', 'common.back': 'Назад', 'common.close': 'Закрити',
  'profile.language': 'Мова застосунку',
};

export default uk;
