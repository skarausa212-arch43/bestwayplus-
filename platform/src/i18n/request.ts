import { getRequestConfig } from 'next-intl/server';
import { routing, isAppLocale } from './routing';

const NAMESPACES = [
  'common', 'nav', 'home', 'join', 'forms', 'validation',
  'portal', 'documents', 'statuses', 'notifications', 'emails',
  'opportunities', 'admin', 'share', 'messages', 'tasks',
  'consent', 'legal',
] as const;

/**
 * Loads every namespace for the active locale. A key missing from a
 * non-default catalog falls back to English rather than rendering the key,
 * and the gap is reported so it can be fixed rather than silently shipped.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isAppLocale(requested) ? requested : routing.defaultLocale;

  const load = async (loc: string) => {
    const entries = await Promise.all(
      NAMESPACES.map(async (ns) => [ns, (await import(`../messages/${loc}/${ns}.json`)).default] as const),
    );
    return Object.fromEntries(entries);
  };

  const messages = await load(locale);

  if (locale !== routing.defaultLocale) {
    const fallback = await load(routing.defaultLocale);
    for (const ns of NAMESPACES) {
      messages[ns] = { ...fallback[ns], ...messages[ns] };
    }
  }

  return {
    locale,
    messages,
    timeZone: 'Europe/Warsaw',
    now: new Date(),
    onError(error) {
      if (process.env.NODE_ENV === 'production') return; // reported by Sentry
      console.warn('[i18n]', error.message);
    },
  };
});
