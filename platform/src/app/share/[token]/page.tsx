import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Montserrat, Manrope } from 'next/font/google';
import { openShareLink } from '@/modules/share/service';
import { SECTION_FIELDS, SHARE_SECTIONS } from '@/modules/share/sections';
import { routing, isAppLocale, type AppLocale } from '@/i18n/routing';
import { LogoMark, Wordmark } from '@/components/Logo';
import { SharePasswordGate } from '@/components/share/SharePasswordGate';
import { ShareDocuments } from '@/components/share/ShareDocuments';
import '@/styles/globals.css';

const display = Montserrat({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800'], variable: '--font-display' });
const sans = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bestway Football', robots: { index: false, follow: false, nocache: true } };

/**
 * The recipient has no account, so the language comes from Accept-Language
 * rather than from a session or a URL segment.
 */
async function negotiateLocale(): Promise<AppLocale> {
  const header = (await headers()).get('accept-language') ?? '';
  const candidate = header.split(',')[0]?.slice(0, 2).toLowerCase();
  return isAppLocale(candidate) ? candidate : routing.defaultLocale;
}

export default async function SharePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;
  const locale = await negotiateLocale();
  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: 'share' });

  const requestHeaders = await headers();
  const result = await openShareLink(token, p ?? null, {
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  });

  const shell = (children: React.ReactNode) => (
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

  // Unknown, expired and revoked all look identical from out here, on purpose.
  if (result.outcome === 'not-found') {
    return shell(<p className="text-sm text-ink-muted">{t('unavailable')}</p>);
  }
  if (result.outcome === 'locked') {
    return shell(<p className="text-sm text-state-warn">{t('tooManyAttempts')}</p>);
  }
  if (result.outcome === 'password-required') {
    return shell(<SharePasswordGate attempted={Boolean(p)} />);
  }

  const { view } = result;
  const value = (key: string) => {
    const raw = view.profile[key];
    if (raw === null || raw === undefined || raw === '') return null;
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (Array.isArray(raw)) return raw.join(', ');
    return String(raw);
  };

  const name = [value('firstName'), value('lastName')].filter(Boolean).join(' ');

  return shell(
    <>
      <div>
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {t('sharedBy')}
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold tracking-tight">
          {name || t('title')}
        </h1>
        <p className="mt-2 text-xs text-ink-faint">
          {t('expires', { date: view.expiresAt.toISOString().slice(0, 10) })} · {t('recorded')}
        </p>
      </div>

      {SHARE_SECTIONS.filter((section) => view.sections[section]).map((section) => {
        const rows = SECTION_FIELDS[section]
          .map((field) => [field, value(field)] as const)
          .filter(([, v]) => v !== null);
        if (rows.length === 0) return null;

        return (
          <section key={section} className="rounded-xl border border-line-faint bg-bg-raised p-6">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
              {t(`section${section.charAt(0).toUpperCase()}${section.slice(1)}`)}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {rows.map(([field, v]) => (
                <div key={field}>
                  <dt className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                    {field}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section className="rounded-xl border border-line-faint bg-bg-raised p-6">
        <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {t('documents')}
        </h2>
        <div className="mt-4">
          {view.documents.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noDocuments')}</p>
          ) : (
            <ShareDocuments token={token} password={p ?? null} documents={view.documents} />
          )}
        </div>
      </section>
    </>,
  );
}
