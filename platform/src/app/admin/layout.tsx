import { redirect } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { Montserrat, Manrope } from 'next/font/google';
import { getSessionUser } from '@/modules/auth/session';
import { isStaff } from '@/modules/rbac/permissions';
import { fromPrismaLocale } from '@/i18n/routing';
import { LogoMark } from '@/components/Logo';
import '@/styles/globals.css';

const display = Montserrat({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['600', '700', '800'], variable: '--font-display' });
const sans = Manrope({ subsets: ['latin', 'latin-ext', 'cyrillic'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CRM', robots: { index: false, follow: false } };

const NAV = [
  { href: '/admin', key: 'dashboard' },
  { href: '/admin/players', key: 'players' },
  { href: '/admin/agents', key: 'agents' },
  { href: '/admin/documents', key: 'documents' },
  { href: '/admin/opportunities', key: 'opportunities' },
  { href: '/admin/tasks', key: 'tasks' },
] as const;

/**
 * The CRM sits outside the localised tree on purpose: staff language comes
 * from the account, which keeps /admin out of sitemaps, hreflang sets and
 * translation review. The guard here is a redirect for ergonomics — every
 * service call underneath authorises independently.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect('/en/sign-in');
  if (!isStaff(session.role)) redirect('/en/portal');

  const locale = fromPrismaLocale(session.locale);
  const messages = await getMessages({ locale });
  const t = await getTranslations({ locale, namespace: 'admin' });

  return (
    <html lang={locale} className={`${display.variable} ${sans.variable}`}>
      <body className="font-sans antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <div className="min-h-screen">
            <header className="sticky top-0 z-50 border-b border-line-faint bg-bg/90 backdrop-blur">
              <div className="mx-auto flex h-[62px] w-[min(1600px,100%-2rem)] items-center gap-6">
                <a href="/admin" className="flex flex-none items-center gap-2.5">
                  <LogoMark className="h-7 w-auto" id="crm" />
                  <span className="font-display text-[11px] font-extrabold uppercase tracking-[0.24em] text-emerald">
                    {t('crm')}
                  </span>
                </a>
                <nav className="hidden items-center gap-1 md:flex">
                  {NAV.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      className="rounded-[8px] px-3 py-2 font-display text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-muted transition-colors hover:bg-bg-panel hover:text-ink"
                    >
                      {t(item.key)}
                    </a>
                  ))}
                </nav>
                <div className="ms-auto flex items-center gap-4 text-xs text-ink-faint">
                  <span className="hidden sm:inline">{session.email}</span>
                  <span className="rounded-full border border-line px-2.5 py-1 font-display text-[9px] font-bold uppercase tracking-[0.14em] text-emerald">
                    {session.role}
                  </span>
                </div>
              </div>
            </header>
            <main className="mx-auto w-[min(1600px,100%-2rem)] py-8">{children}</main>
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
