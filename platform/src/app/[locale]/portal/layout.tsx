import { redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { unreadCount } from '@/modules/notifications/service';
import { listOwnRequests } from '@/modules/documents/queries';
import { LogoMark, Wordmark } from '@/components/Logo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Sidebar, type NavItem } from '@/components/portal/Sidebar';

export const dynamic = 'force-dynamic';

const BASE: NavItem[] = [
  { href: '/portal', labelKey: 'overview' },
  { href: '/portal/profile', labelKey: 'myProfile' },
  { href: '/portal/documents', labelKey: 'documents' },
  { href: '/portal/requests', labelKey: 'requests' },
  { href: '/portal/messages', labelKey: 'messages' },
  { href: '/portal/notifications', labelKey: 'notifications' },
  { href: '/portal/settings', labelKey: 'settings' },
];

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) redirect(`/${locale}/sign-in`);

  const t = await getTranslations('portal');
  const nav = await getTranslations('nav');

  const [unread, requests] = await Promise.all([
    unreadCount(session),
    listOwnRequests(session).catch(() => []),
  ]);

  // Opportunities are meaningful for players and agents; clubs get the
  // recruitment brief instead. The routes authorise independently regardless.
  const items: NavItem[] = [...BASE];
  if (session.role === 'PLAYER' || session.role === 'AGENT') {
    items.splice(3, 0, { href: '/portal/opportunities', labelKey: 'opportunities' });
  }
  if (session.role === 'CLUB') {
    items.splice(3, 0, { href: '/portal/recruitment', labelKey: 'recruitment' });
  }
  const withBadges = items.map((item) =>
    item.href === '/portal/notifications' ? { ...item, badge: unread }
    : item.href === '/portal/requests' ? { ...item, badge: requests.length }
    : item,
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-line-faint bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-[70px] w-[min(1400px,100%-2.5rem)] items-center gap-6">
          <Link href="/portal" className="flex flex-none items-center gap-3">
            <LogoMark className="h-8 w-auto" id="portal" />
            <Wordmark />
          </Link>
          <div className="ms-auto flex items-center gap-5">
            <span className="hidden text-xs text-ink-faint sm:block">
              {t('signedInAs', { email: session.email })}
            </span>
            <LanguageSwitcher signedIn />
            <form action="/api/v1/auth/logout" method="post">
              <button
                type="submit"
                className="font-display text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
              >
                {nav('signOut')}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-[min(1400px,100%-2.5rem)] gap-8 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar items={withBadges} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
