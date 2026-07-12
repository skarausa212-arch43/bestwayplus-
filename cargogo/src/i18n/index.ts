import { APP_CONFIG, Locale } from '@/config/app';
import { Role } from '@/types';
import { useLocaleStore } from '@/store/locale';
import { useNotificationStore } from '@/store/notifications';
import pl from './pl';
import ru from './ru';
import en from './en';
import uk from './uk';
import de from './de';

// pl — эталон структуры; ru/en/uk/de — полные словари (Dict)
export type Dict = Record<keyof typeof pl, string>;
export type TKey = keyof typeof pl;
export type TParams = (string | number)[] | Record<string, string | number>;

const dictionaries: Record<Locale, Partial<Dict>> = { pl, ru, en, uk, de };

// Язык конкретной роли (у каждого пользователя свой — поле профиля)
export const langOf = (role: Role): Locale =>
  useLocaleStore.getState().langs[role] ?? APP_CONFIG.defaultLocale;

// Язык активной на этом устройстве роли (залогиненный пользователь)
export const currentLang = (): Locale =>
  langOf(useNotificationStore.getState().activeRole ?? 'customer');

/**
 * Перевод. params — позиционные {0},{1}… (массив) или именованные {key} (объект).
 * lang — принудительный язык (для уведомлений: язык роли-получателя); по умолчанию язык активной роли.
 * Отсутствующий ключ падает на pl, затем на сам ключ.
 */
export const t = (key: string, params?: TParams, lang?: Locale): string => {
  const L = lang ?? currentLang();
  let str = dictionaries[L]?.[key as TKey] ?? pl[key as TKey] ?? key;
  str = str.replace('{app}', APP_CONFIG.name);
  if (Array.isArray(params)) {
    params.forEach((p, i) => { str = str.replace(`{${i}}`, String(p)); });
  } else if (params) {
    Object.entries(params).forEach(([k, v]) => { str = str.replace(`{${k}}`, String(v)); });
  }
  return str;
};

// Смена языка активной роли (переключатель в профиле)
export const setLocale = (l: Locale) => {
  const role = useNotificationStore.getState().activeRole ?? 'customer';
  useLocaleStore.getState().setLang(role, l);
};

// Реактивный t(): компонент перерисуется при смене языка или активной роли
export const useT = () => {
  const role = useNotificationStore((s) => s.activeRole) ?? 'customer';
  const lang = useLocaleStore((s) => s.langs[role]) ?? APP_CONFIG.defaultLocale;
  return (key: string, params?: TParams) => t(key, params, lang);
};
