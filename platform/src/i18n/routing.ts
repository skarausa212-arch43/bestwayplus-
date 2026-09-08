import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const locales = ['en', 'pl', 'ru'] as const;
export type AppLocale = (typeof locales)[number];

export const localeNames: Record<AppLocale, string> = {
  en: 'English',
  pl: 'Polski',
  ru: 'Русский',
};

/**
 * English is the default but is still prefixed, so every public URL has
 * exactly one canonical form and hreflang sets stay symmetrical.
 */
export const routing = defineRouting({
  locales,
  defaultLocale: 'en',
  localePrefix: 'always',
  localeCookie: { name: 'NEXT_LOCALE', maxAge: 60 * 60 * 24 * 365 },
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

/** Maps the URL segment to the Prisma `Locale` enum. */
export function toPrismaLocale(locale: AppLocale): 'EN' | 'PL' | 'RU' {
  return locale.toUpperCase() as 'EN' | 'PL' | 'RU';
}

export function fromPrismaLocale(locale: 'EN' | 'PL' | 'RU'): AppLocale {
  return locale.toLowerCase() as AppLocale;
}
