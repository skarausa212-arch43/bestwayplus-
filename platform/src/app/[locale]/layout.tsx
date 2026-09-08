import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Montserrat, Manrope } from 'next/font/google';
import { locales, isAppLocale, type AppLocale } from '@/i18n/routing';
import '@/styles/globals.css';

const display = Montserrat({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800'], variable: '--font-display' });
const sans = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isAppLocale(locale)) return {};
  const t = await getTranslations({ locale, namespace: 'home' });

  const base = process.env.APP_URL ?? 'https://bestwayfootball.pl';
  const languages = Object.fromEntries(locales.map((l) => [l, `${base}/${l}`]));

  return {
    metadataBase: new URL(base),
    title: { default: 'Bestway Football', template: '%s · Bestway Football' },
    description: t('heroBody'),
    alternates: {
      canonical: `${base}/${locale}`,
      languages: { ...languages, 'x-default': `${base}/en` },
    },
    openGraph: { siteName: 'Bestway Football', locale, type: 'website' },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  setRequestLocale(locale as AppLocale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
