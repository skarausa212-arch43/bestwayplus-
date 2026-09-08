import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Montserrat, Manrope } from 'next/font/google';
import { negotiateLocale } from '@/i18n/negotiate';
import { LogoMark, Wordmark } from '@/components/Logo';
import '@/styles/globals.css';

const display = Montserrat({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800'], variable: '--font-display' });
const sans = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Bestway Football',
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Root layout for the /share subtree. The recipient has no account and the
 * route carries no locale segment, so the language comes from Accept-Language;
 * the page below renders content only.
 */
export default async function ShareLayout({ children }: { children: React.ReactNode }) {
  const locale = await negotiateLocale();
  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: 'share' });

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="mx-auto grid min-h-screen w-[min(880px,100%-2.5rem)] content-start gap-8 py-12">
            <header className="flex items-center gap-3">
              <LogoMark className="h-8 w-auto" id="share" />
              <Wordmark />
            </header>
            {children}
            <footer className="mt-6 border-t border-line-faint pt-5 text-[11px] leading-relaxed text-ink-faint">
              {t('regulatory')}
            </footer>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
