import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { AppNotification, Role } from '@/types';
import { useNotificationStore } from '@/store/notifications';
import { t, langOf } from '@/i18n';
import { APP_CONFIG } from '@/config/app';

// Показывать баннеры даже когда приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
  }),
});

export async function initNotifications() {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: APP_CONFIG.name, importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') await Notifications.requestPermissionsAsync();
  } catch (e) {
    console.warn('notifications init (mock mode):', e);
  }
}

// Рендер уведомления на языке роли-ПОЛУЧАТЕЛЯ (как renderNotifTitle/Body в прототипе)
export const renderNotifTitle = (n: Pick<AppNotification, 'role' | 'titleKey' | 'params'>) =>
  t(n.titleKey, n.params, langOf(n.role));
export const renderNotifBody = (n: Pick<AppNotification, 'role' | 'bodyKey' | 'params' | 'rawBody'>) =>
  n.rawBody ?? (n.bodyKey ? t(n.bodyKey, n.params, langOf(n.role)) : '');

/**
 * Единая точка отправки уведомлений (ключи словаря + параметры).
 * 1) Пишет в in-app центр уведомлений нужной роли (колокольчик + экран).
 * 2) Показывает системный push (локальный — в MVP имитирует серверный),
 *    текст рендерится на языке роли-получателя.
 * 3) In-app toast показывается автоматически, если активная роль совпадает.
 * rawBody — сырой текст вместо bodyKey (например, текст сообщения чата).
 */
export async function notify(
  role: Role,
  titleKey: string,
  bodyKey?: string,
  params?: (string | number)[],
  opts?: { rawBody?: string; orderId?: string },
) {
  const item = { role, titleKey, bodyKey, params, rawBody: opts?.rawBody, orderId: opts?.orderId };
  useNotificationStore.getState().add(item);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: renderNotifTitle(item),
        body: renderNotifBody(item),
        data: { role, orderId: opts?.orderId },
      },
      trigger: null, // сразу
    });
  } catch (e) {
    // В Expo Go на симуляторе push может быть недоступен — in-app центр всё равно работает
  }
}
