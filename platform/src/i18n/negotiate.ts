import { headers } from 'next/headers';
import { routing, isAppLocale, type AppLocale } from './routing';

/**
 * Locale for routes that carry no locale segment and no session — the share
 * view being the only one today. Falls back to the default rather than
 * guessing from a partial match.
 */
export async function negotiateLocale(): Promise<AppLocale> {
  const header = (await headers()).get('accept-language') ?? '';
  const candidate = header.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return isAppLocale(candidate) ? candidate : routing.defaultLocale;
}
