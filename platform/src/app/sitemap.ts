import type { MetadataRoute } from 'next';
import { locales, routing } from '@/i18n/routing';

const PUBLIC_PATHS = [
  '', '/players', '/clubs', '/agents', '/investors',
  '/services', '/services/players', '/services/clubs', '/services/agents',
  '/services/investors', '/services/marketing',
  '/about', '/contact', '/join',
  '/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/notices',
];

/**
 * Public pages only. The portal, the CRM and share links are noindex and must
 * never appear here — a sitemap is a published list of what exists.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? 'https://bestwayfootball.pl').replace(/\/$/, '');

  return PUBLIC_PATHS.flatMap((path) =>
    locales.map((locale) => ({
      url: `${base}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((alt) => [alt, `${base}/${alt}${path}`])),
          'x-default': `${base}/${routing.defaultLocale}${path}`,
        },
      },
    })),
  );
}
