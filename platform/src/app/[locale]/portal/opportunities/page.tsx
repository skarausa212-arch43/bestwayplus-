import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listForParticipant } from '@/modules/opportunities/service';
import { Card, SectionTitle, EmptyState } from '@/components/ui';
import { StagePill } from '@/components/portal/StatusPill';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('opportunities');
  const format = await getFormatter();
  const entries = await listForParticipant(session);

  return (
    <div className="grid gap-6">
      <div>
        <SectionTitle>{t('title')}</SectionTitle>
        <p className="mt-3 max-w-[70ch] text-sm text-ink-muted">{t('intro')}</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState>{t('empty')}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {entries.map((entry) => (
            <Card as="li" key={entry.id}>
              <Link href={`/portal/opportunities/${entry.opportunity.id}`} className="block">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-display text-base font-extrabold text-ink">{entry.opportunity.name}</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      {[entry.opportunity.country, entry.opportunity.league, entry.opportunity.position]
                        .filter(Boolean).join(' · ')}
                    </p>
                    {entry.opportunity.deadline && (
                      <p className="mt-2 text-xs text-ink-faint">
                        {t('deadline')}: {format.dateTime(entry.opportunity.deadline, { dateStyle: 'medium' })}
                      </p>
                    )}
                  </div>
                  <StagePill stage={entry.stage} />
                </div>
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
