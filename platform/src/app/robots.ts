import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? 'https://bestwayfootball.pl').replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Everything behind authentication, plus tokenised profile links.
        disallow: ['/admin', '/api/', '/share/', '/en/portal', '/pl/portal', '/ru/portal'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
