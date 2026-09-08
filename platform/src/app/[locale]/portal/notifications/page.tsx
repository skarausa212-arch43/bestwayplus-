import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listOwn, markAllRead } from '@/modules/notifications/service';
import { Card, SectionTitle, EmptyState } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('notifications');
  const tp = await getTranslations('portal');
  const format = await getFormatter();
  const items = await listOwn(session);

  async function readAll() {
    'use server';
    const actor = await getSessionUser();
    if (actor) await markAllRead(actor);
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SectionTitle>{tp('notifications')}</SectionTitle>
        {items.some((item) => !item.readAt) && (
          <form action={readAll}>
            <button
              type="submit"
              className="rounded-[10px] border border-line px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted hover:border-emerald hover:text-ink"
            >
              {t('markAllRead')}
            </button>
          </form>
        )}
      </div>

      {items.length === 0 ? (
        <EmptyState>{t('empty')}</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <Card as="li" key={item.id} className={item.readAt ? 'opacity-70' : 'border-l-2 border-l-emerald'}>
              <p className="text-sm text-ink">{t(item.titleKey.replace(/^notifications\./, ''))}</p>
              <p className="mt-1.5 text-xs text-ink-faint">
                {format.dateTime(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
